import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import type * as FileSystem from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { removeCleanupAsset } from "./storage-cleanup";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  return { ...actual, readdir: vi.fn(actual.readdir) };
});

const roots: string[] = [];
afterEach(async () => {
  vi.mocked(readdir).mockReset();
  const actual = await vi.importActual<typeof FileSystem>("node:fs/promises");
  vi.mocked(readdir).mockImplementation(actual.readdir);
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "rp-cleanup-"));
  roots.push(root);
  const project = randomUUID();
  const directory = join(root, "users", "owner", "projects", project, "source");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "video"), "source");
  return {
    root,
    directory,
    target: { kind: "source", user_id: "owner", project_id: project, storage_path: directory },
  };
}
describe("private media deletion", () => {
  it("still removes the source when a separately cleaned child disappears during inspection", async () => {
    const { root, directory, target } = await fixture();
    const actual = await vi.importActual<typeof FileSystem>("node:fs/promises");
    vi.mocked(readdir).mockImplementationOnce(async () => {
      const children = await actual.readdir(directory);
      return [...children, "audio-already-removed.wav"] as never;
    });
    await removeCleanupAsset(root, target);
    await expect(readFile(join(directory, "video"))).rejects.toThrow();
  });
  it("recognizes legacy render staging and source backups without accepting unrelated folders", async () => {
    const { root, target } = await fixture();
    const paths = [
      join(root, ".render-staging", `${randomUUID()}-${randomUUID()}-Ab12xy`),
      join(target.storage_path, "..", `.source-backup-${randomUUID()}`),
      join(root, ".staging", `commit-${randomUUID()}`),
    ];
    for (const storage_path of paths) {
      await mkdir(storage_path, { recursive: true });
      await writeFile(join(storage_path, "temporary"), "media");
      await removeCleanupAsset(root, { ...target, kind: "orphan", storage_path });
      await expect(readFile(join(storage_path, "temporary"))).rejects.toThrow();
    }
    for (const directory of [
      "models",
      "fonts",
      "logs",
      ".render-staging/unrelated",
      ".staging/other",
    ])
      await expect(
        removeCleanupAsset(root, {
          ...target,
          kind: "orphan",
          storage_path: join(root, directory),
        }),
      ).rejects.toThrow();
  });
  it("removes source and its audio without deleting a later export, and tolerates repeats", async () => {
    const { root, directory, target } = await fixture();
    const output = join(
      root,
      "users",
      "owner",
      "projects",
      target.project_id,
      "renders",
      randomUUID(),
      "summary",
      `${randomUUID()}.mp4`,
    );
    await mkdir(join(directory, ".analysis"));
    await writeFile(join(directory, ".analysis", "audio.wav"), "audio");
    await mkdir(join(output, ".."), { recursive: true });
    await writeFile(output, "export");
    await removeCleanupAsset(root, target);
    await removeCleanupAsset(root, target);
    expect(await readFile(output, "utf8")).toBe("export");
    await expect(readFile(join(directory, "video"))).rejects.toThrow();
  });
  it("rejects project roots, foreign owners and traversal", async () => {
    const { root, target } = await fixture();
    for (const storage_path of [
      root,
      join(root, ".."),
      join(target.storage_path, ".."),
      target.storage_path.replace("owner", "foreign"),
    ]) {
      await expect(removeCleanupAsset(root, { ...target, storage_path })).rejects.toThrow();
    }
  });
  it("rejects junctions rather than deleting outside the intended asset", async () => {
    const { root, directory, target } = await fixture();
    const outside = await mkdtemp(join(tmpdir(), "rp-outside-"));
    roots.push(outside);
    await writeFile(join(outside, "keep"), "safe");
    await symlink(outside, join(directory, "redirect"), "junction");
    await expect(removeCleanupAsset(root, target)).rejects.toThrow(/link|junction/i);
    expect(await readFile(join(outside, "keep"), "utf8")).toBe("safe");
  });
});
