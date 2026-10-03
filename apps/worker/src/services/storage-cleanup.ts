import { lstat, readdir, realpath, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export interface CleanupAsset {
  kind: string;
  user_id: string;
  project_id: string | null;
  storage_path: string;
}
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const renderAttempt = new RegExp(`^${uuid}-${uuid}-(?:${uuid}|[a-z0-9]{6})$`, "iu");
const output = new RegExp(`^renders/${uuid}/(?:${uuid}|summary)/${uuid}\\.mp4$`, "iu");
const audio = new RegExp(
  `^source/\\.analysis/\\.?${uuid}-${uuid}-[12]\\.wav(?:\\.${uuid}\\.tmp\\.wav)?$`,
  "iu",
);

function within(root: string, path: string) {
  const value = relative(root, path);
  return value !== "" && value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value);
}
export function validateCleanupLayout(root: string, target: CleanupAsset): string {
  const path = resolve(target.storage_path);
  if (!within(root, path)) throw new Error("Cleanup path escapes the private storage root.");
  const parts = relative(root, path).split(sep);
  if (parts[0] === ".staging") {
    if (
      !["upload_temp", "orphan"].includes(target.kind) ||
      parts.length !== 2 ||
      !new RegExp(`^(?:commit-)?${uuid}$`, "iu").test(parts[1]!)
    )
      throw new Error("Invalid upload cleanup layout.");
  } else if (parts[0] === ".render-staging") {
    if (
      !["render_temp", "orphan"].includes(target.kind) ||
      parts.length !== 2 ||
      !renderAttempt.test(parts[1]!)
    )
      throw new Error("Invalid render cleanup layout.");
  } else {
    const owner = encodeURIComponent(target.user_id).replaceAll(".", "%2E");
    if (
      !target.project_id ||
      parts[0] !== "users" ||
      parts[1] !== owner ||
      parts[2] !== "projects" ||
      parts[3] !== target.project_id
    )
      throw new Error("Cleanup ownership layout mismatch.");
    const asset = parts.slice(4).join("/");
    const valid =
      (target.kind === "source" && asset === "source") ||
      (["output", "render_temp"].includes(target.kind) && output.test(asset)) ||
      (target.kind === "audio" && audio.test(asset)) ||
      (target.kind === "upload_temp" &&
        new RegExp(`^\\.source-backup-${uuid}$`, "iu").test(asset)) ||
      (target.kind === "orphan" &&
        (asset === "source" ||
          output.test(asset) ||
          audio.test(asset) ||
          new RegExp(`^\\.source-backup-${uuid}$`, "iu").test(asset)));
    if (!valid) throw new Error("Invalid media cleanup layout.");
  }
  return path;
}
function missing(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}
export async function removeCleanupAsset(
  configuredRoot: string,
  target: CleanupAsset,
): Promise<void> {
  const lexicalRoot = resolve(configuredRoot);
  const path = validateCleanupLayout(lexicalRoot, target);
  try {
    if ((await lstat(lexicalRoot)).isSymbolicLink())
      throw new Error("Cleanup refuses a symlink or junction root.");
  } catch (error) {
    if (missing(error)) return;
    throw error;
  }
  const root = await realpath(lexicalRoot);
  let ancestor = lexicalRoot;
  for (const part of relative(lexicalRoot, path).split(sep)) {
    ancestor = join(ancestor, part);
    try {
      const details = await lstat(ancestor);
      if (details.isSymbolicLink()) throw new Error("Cleanup refuses a symlink or junction.");
      if (!within(root, await realpath(ancestor))) throw new Error("Cleanup path escapes storage.");
    } catch (error) {
      if (missing(error)) return;
      throw error;
    }
  }
  let entries = 0;
  const inspect = async (value: string): Promise<void> => {
    if (++entries > 10_000) throw new Error("Cleanup directory exceeds its safety bound.");
    let details;
    try {
      details = await lstat(value);
    } catch (error) {
      if (missing(error)) return;
      throw error;
    }
    if (details.isSymbolicLink()) throw new Error("Cleanup refuses a symlink or junction.");
    if (details.isDirectory()) {
      let children: string[];
      try {
        children = await readdir(value);
      } catch (error) {
        if (missing(error)) return;
        throw error;
      }
      for (const child of children) await inspect(join(value, child));
    }
  };
  try {
    await inspect(path);
    await rm(path, { force: true, recursive: true });
  } catch (error) {
    if (!missing(error)) throw error;
  }
}
