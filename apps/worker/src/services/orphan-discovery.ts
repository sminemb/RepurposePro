import { lstat, readdir } from "node:fs/promises";
import { join, resolve, relative, sep, isAbsolute } from "node:path";
import type { DatabaseClient } from "@repurposepro/db";
import type { WorkerConfig } from "@repurposepro/config";
import { validateCleanupLayout } from "./storage-cleanup";

export interface OrphanScanState {
  readonly offsets: Map<string, number>;
}
async function children(
  root: string,
  path: string,
  state: OrphanScanState,
  limit = 1000,
): Promise<string[]> {
  const value = relative(root, path);
  if (value === ".." || value.startsWith(`..${sep}`) || isAbsolute(value)) return [];
  let current = root;
  try {
    for (const segment of value.split(sep)) {
      if (!segment) continue;
      current = join(current, segment);
      const details = await lstat(current);
      if (details.isSymbolicLink() || !details.isDirectory()) return [];
    }
    const names = (await readdir(path)).sort();
    if (!names.length) return [];
    const offset = (state.offsets.get(path) ?? 0) % names.length;
    if (state.offsets.size > 5000) state.offsets.clear();
    state.offsets.set(path, (offset + (names.length > limit ? limit : 1)) % names.length);
    return [...names.slice(offset), ...names.slice(0, offset)].slice(0, limit);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}
export async function discoverOrphans(
  database: DatabaseClient,
  config: WorkerConfig,
  after: string | null,
  state: OrphanScanState = { offsets: new Map() },
): Promise<string | null> {
  const root = resolve(config.storageRoot);
  let budget = 1000;
  const scanChildren = async (path: string, limit = 1000): Promise<string[]> =>
    budget-- > 0 ? children(root, path, state, limit) : [];
  const remember = async (path: string, project: string | null, user: string) => {
    if (budget-- <= 0) return;
    try {
      validateCleanupLayout(root, {
        kind: "orphan",
        project_id: project,
        user_id: user,
        storage_path: path,
      });
    } catch {
      return;
    }
    const details = await lstat(path);
    if (details.isSymbolicLink()) return;
    const created = new Date(Math.max(details.mtimeMs, details.birthtimeMs));
    if (created.getTime() + config.render.retentionDays * 86_400_000 > Date.now()) return;
    await database.pool.query("SELECT public.register_orphan_storage_target($1,$2,$3,$4)", [
      project,
      path.replaceAll("\\", "/"),
      created,
      config.render.retentionDays,
    ]);
  };
  for (const directory of [".staging", ".render-staging"])
    for (const name of await scanChildren(join(root, directory), 200))
      await remember(join(root, directory, name), null, "orphan");
  const projects = (
    await database.pool.query<{ project_id: string; user_id: string }>(
      "SELECT * FROM public.list_cleanup_project_roots($1,$2)",
      [after, config.cleanup.batchSize],
    )
  ).rows;
  let visited = 0;
  for (const project of projects) {
    if (budget <= 0) break;
    visited++;
    const base = join(
      root,
      "users",
      encodeURIComponent(project.user_id).replaceAll(".", "%2E"),
      "projects",
      project.project_id,
    );
    const names = await scanChildren(base);
    for (const name of names.filter((name) => name.startsWith(".source-backup-")))
      await remember(join(base, name), project.project_id, project.user_id);
    if (names.includes("source")) {
      await remember(join(base, "source"), project.project_id, project.user_id);
      for (const name of await scanChildren(join(base, "source", ".analysis")))
        await remember(
          join(base, "source", ".analysis", name),
          project.project_id,
          project.user_id,
        );
    }
    for (const job of await scanChildren(join(base, "renders")))
      for (const item of await scanChildren(join(base, "renders", job)))
        for (const file of await scanChildren(join(base, "renders", job, item)))
          await remember(
            join(base, "renders", job, item, file),
            project.project_id,
            project.user_id,
          );
  }
  return visited > 0 && (visited < projects.length || projects.length === config.cleanup.batchSize)
    ? projects[visited - 1]!.project_id
    : null;
}
