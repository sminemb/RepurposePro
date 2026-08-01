import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../infrastructure/database.service";
import type { LocalStorageService } from "../storage/local-storage.service";
import { ClipPreviewsService } from "./clip-previews.service";

const projectId = "00000000-0000-4000-8000-000000003001";
const candidateId = "00000000-0000-4000-8000-000000003002";
const userId = "preview-user";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("ClipPreviewsService", () => {
  it("returns a validated, fixed-bound clip list without internal fields", async () => {
    const { query, service } = setup();
    query.mockResolvedValue({
      rows: [
        {
          clips: [candidate()],
          projectId,
          sourceDurationSeconds: "30.000",
        },
      ],
    });

    await expect(service.list(userId, projectId)).resolves.toEqual({
      clips: [candidate()],
      projectId,
      sourceDurationSeconds: 30,
    });
    expect(JSON.stringify((await service.list(userId, projectId)).clips)).not.toContain(
      "storagePath",
    );
  });

  it("returns not found for another user's project without exposing ownership", async () => {
    const { query, service } = setup();
    query.mockResolvedValue({ rows: [] });

    await expect(service.list("another-user", projectId)).rejects.toMatchObject({
      code: "CLIPS_NOT_FOUND",
    });
  });

  it("resolves an unexpired source through computed private storage", async () => {
    const directory = await mkdtemp(join(tmpdir(), "repurposepro-source-"));
    temporaryDirectories.push(directory);
    const videoPath = join(directory, "video");
    await writeFile(videoPath, Buffer.from("0123456789"));
    const { query, readSourceUpload, service } = setup();
    query.mockResolvedValue({
      rows: [
        {
          expiresAt: new Date(Date.now() + 60_000),
          fileSizeBytes: "10",
          mimeType: "video/mp4",
          originalFileName: "source.mp4",
          storagePath: videoPath,
        },
      ],
    });
    readSourceUpload.mockResolvedValue({
      manifest: {
        fileSizeBytes: 10,
        mimeType: "video/mp4",
        originalFileName: "source.mp4",
        storedAt: new Date().toISOString(),
        version: 1,
      },
      videoPath,
    });

    await expect(service.getSourceVideoContent(userId, projectId)).resolves.toEqual({
      fileSizeBytes: 10,
      mimeType: "video/mp4",
      path: videoPath,
    });
  });

  it("rejects expired and missing source files", async () => {
    const { query, readSourceUpload, service } = setup();
    query.mockResolvedValueOnce({
      rows: [
        {
          expiresAt: new Date(Date.now() - 1),
          fileSizeBytes: "10",
          mimeType: "video/mp4",
          originalFileName: "source.mp4",
          storagePath: "unused",
        },
      ],
    });
    await expect(service.getSourceVideoContent(userId, projectId)).rejects.toMatchObject({
      code: "SOURCE_VIDEO_EXPIRED",
    });
    expect(readSourceUpload).not.toHaveBeenCalled();

    query.mockResolvedValueOnce({ rows: [] });
    await expect(service.getSourceVideoContent(userId, projectId)).rejects.toMatchObject({
      code: "SOURCE_VIDEO_NOT_FOUND",
    });
  });
});

function setup() {
  const query = vi.fn();
  const readSourceUpload = vi.fn();
  const database = { database: { pool: { query } } } as unknown as DatabaseService;
  const storage = { readSourceUpload } as unknown as LocalStorageService;
  return {
    query,
    readSourceUpload,
    service: new ClipPreviewsService(database, storage),
  };
}

function candidate() {
  return {
    captionLines: [{ endTime: 15, startTime: 0, text: "Caption text" }],
    captionPosition: { x: 0.5, y: 0.72 },
    captionStyle: "hormozi" as const,
    captionsEnabled: true as const,
    crop: null,
    endTime: 15,
    id: candidateId,
    previewFontSize: 48,
    rank: 0,
    score: 0.9,
    startTime: 0,
    title: "Opening",
  };
}
