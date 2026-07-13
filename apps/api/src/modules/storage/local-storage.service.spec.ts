import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { LocalStorageService } from "./local-storage.service";

const roots: string[] = [];

async function createService(): Promise<LocalStorageService> {
  const root = await mkdtemp(join(tmpdir(), "repurposepro-storage-"));
  roots.push(root);
  return new LocalStorageService({ storageRoot: root });
}

async function stageFile(
  service: LocalStorageService,
  fileName: string,
  contents = "source-video",
): Promise<string> {
  const path = service.stagingPath(fileName);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
  return path;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("LocalStorageService", () => {
  it("stores source files under a deterministic private project directory", async () => {
    const service = await createService();
    const stagedPath = await stageFile(service, "staged-upload");

    await service.commitSourceUpload({
      fileSizeBytes: 12,
      mimeType: "video/mp4",
      originalFileName: "episode.mp4",
      projectId: "project-123",
      stagedPath,
      userId: "user/with/slashes",
    });

    const paths = service.sourcePaths("user/with/slashes", "project-123");
    expect(relative(service.storageRoot, paths.directory).startsWith(`..${sep}`)).toBe(false);
    await expect(readFile(paths.video, "utf8")).resolves.toBe("source-video");
    await expect(readFile(paths.manifest, "utf8")).resolves.toContain(
      '"originalFileName":"episode.mp4"',
    );
    expect(paths.video).not.toContain("episode.mp4");
  });

  it("replaces the complete source directory when a project uploads again", async () => {
    const service = await createService();
    const first = await stageFile(service, "first", "first-video");
    await service.commitSourceUpload({
      fileSizeBytes: 11,
      mimeType: "video/mp4",
      originalFileName: "first.mp4",
      projectId: "project-123",
      stagedPath: first,
      userId: "user-123",
    });
    const second = await stageFile(service, "second", "second-video");

    await service.commitSourceUpload({
      fileSizeBytes: 12,
      mimeType: "video/webm",
      originalFileName: "second.webm",
      projectId: "project-123",
      stagedPath: second,
      userId: "user-123",
    });

    const paths = service.sourcePaths("user-123", "project-123");
    await expect(readFile(paths.video, "utf8")).resolves.toBe("second-video");
    await expect(readFile(paths.manifest, "utf8")).resolves.toContain(
      '"originalFileName":"second.webm"',
    );
  });

  it("rejects staged paths outside its private staging root", async () => {
    const service = await createService();
    const outsidePath = join(service.storageRoot, "outside-upload");
    await writeFile(outsidePath, "outside", "utf8");

    await expect(
      service.commitSourceUpload({
        fileSizeBytes: 7,
        mimeType: "video/mp4",
        originalFileName: "episode.mp4",
        projectId: "project-123",
        stagedPath: outsidePath,
        userId: "user-123",
      }),
    ).rejects.toThrow("staging directory");
  });

  it("keeps dot-only path segments from collapsing into parent directories", async () => {
    const service = await createService();
    const paths = service.sourcePaths(".", ".");

    expect(relative(service.storageRoot, paths.directory).split(sep)).toEqual([
      "users",
      "%2E",
      "projects",
      "%2E",
      "source",
    ]);
  });

  it("reads trusted source metadata and removes an invalid committed source", async () => {
    const service = await createService();
    const stagedPath = await stageFile(service, "staged-upload");
    await service.commitSourceUpload({
      fileSizeBytes: 12,
      mimeType: "video/mp4",
      originalFileName: "episode.mp4",
      projectId: "project-123",
      stagedPath,
      userId: "user-123",
    });

    await expect(service.readSourceUpload("user-123", "project-123")).resolves.toMatchObject({
      manifest: {
        fileSizeBytes: 12,
        mimeType: "video/mp4",
        originalFileName: "episode.mp4",
      },
    });

    await service.removeSourceUpload("user-123", "project-123");
    await expect(
      readFile(service.sourcePaths("user-123", "project-123").video, "utf8"),
    ).rejects.toThrow();
  });
});
