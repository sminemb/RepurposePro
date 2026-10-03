import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertSafeStoragePath, assertSafeStorageTree } from "./safe-storage";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
describe("resolved private storage containment", () => {
  it("permits ordinary files and missing destinations, rejects traversal", async () => {
    const root = await mkdtemp(join(tmpdir(), "vs11-storage-"));
    roots.push(root);
    await writeFile(join(root, "video"), "media");
    await expect(assertSafeStoragePath(root, join(root, "video"))).resolves.toBe(
      join(root, "video"),
    );
    await expect(
      assertSafeStoragePath(root, join(root, "new", "file"), true),
    ).resolves.toBeDefined();
    await expect(assertSafeStoragePath(root, join(root, "..", "outside"), true)).rejects.toThrow();
  });
  it("rejects junctions before reading or removing their targets", async () => {
    const root = await mkdtemp(join(tmpdir(), "vs11-storage-"));
    roots.push(root);
    const outside = await mkdtemp(join(tmpdir(), "vs11-outside-"));
    roots.push(outside);
    await writeFile(join(outside, "secret"), "unchanged");
    await symlink(outside, join(root, "linked"), "junction");
    await expect(assertSafeStoragePath(root, join(root, "linked", "secret"))).rejects.toThrow();
    await expect(assertSafeStorageTree(root, root)).rejects.toThrow();
    expect(await readFile(join(outside, "secret"), "utf8")).toBe("unchanged");
  });
  it("rejects links even when their destination is inside the root", async () => {
    const root = await mkdtemp(join(tmpdir(), "vs11-storage-"));
    roots.push(root);
    await mkdir(join(root, "actual"));
    await symlink(join(root, "actual"), join(root, "alias"), "junction");
    await expect(assertSafeStoragePath(root, join(root, "alias", "new"), true)).rejects.toThrow();
  });
});
