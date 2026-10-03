import { lstat, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, parse, relative, resolve, sep } from "node:path";

function contained(root: string, path: string): boolean {
  const value = relative(root, path);
  return value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value);
}

/** Validate existing ancestors too: a lexical check alone permits junction escapes. */
export async function assertSafeStoragePath(
  storageRoot: string,
  path: string,
  allowMissing = false,
): Promise<string> {
  const root = resolve(storageRoot);
  const target = resolve(path);
  if (!contained(root, target)) throw new Error("Unsafe storage path.");
  const volume = parse(target).root;
  let cursor = volume;
  let canonicalRoot: string | undefined;
  for (const segment of relative(volume, target).split(sep).filter(Boolean)) {
    cursor = join(cursor, segment);
    let info;
    try {
      info = await lstat(cursor);
    } catch (error) {
      if (allowMissing && (error as NodeJS.ErrnoException).code === "ENOENT") return target;
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error("Storage links are not allowed.");
    if (contained(root, cursor)) {
      const canonical = await realpath(cursor);
      if (cursor === root) canonicalRoot = canonical;
      if (canonicalRoot && !contained(canonicalRoot, canonical))
        throw new Error("Unsafe resolved storage path.");
    }
  }
  return target;
}

/** Recursive removals must reject nested links, including links back inside storage. */
export async function assertSafeStorageTree(storageRoot: string, path: string): Promise<void> {
  const target = await assertSafeStoragePath(storageRoot, path, true);
  const pending = [target];
  let inspected = 0;
  while (pending.length) {
    const current = pending.pop()!;
    if (++inspected > 10_000) throw new Error("Storage tree exceeds the safety limit.");
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error("Storage links are not allowed.");
    if (info.isDirectory())
      for (const entry of await readdir(current)) pending.push(join(current, entry));
  }
}
