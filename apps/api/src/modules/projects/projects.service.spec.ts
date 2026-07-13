import { describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../infrastructure/database.service";
import type { LocalStorageService } from "../storage/local-storage.service";
import { VideoProbeError, type VideoProbeService } from "../storage/video-probe.service";
import type { SourceVideoUploadInput } from "./projects.contracts";
import { ProjectUploadError, ProjectsService } from "./projects.service";

const upload: SourceVideoUploadInput = {
  fileSizeBytes: 1024,
  mimeType: "video/mp4",
  originalFileName: "episode.mp4",
  stagedPath: "C:/private/staging/upload",
};

function createDatabase(project: { readonly status: string } | undefined): DatabaseService {
  const limit = vi.fn().mockResolvedValue(project ? [project] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  const returning = vi.fn().mockResolvedValue([{ id: "project-1" }]);
  const whereUpdate = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where: whereUpdate });
  const update = vi.fn().mockReturnValue({ set });
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn().mockReturnValue({ values });
  const transaction = vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) =>
    callback({ insert, update }),
  );

  return { database: { db: { select, transaction } } } as unknown as DatabaseService;
}

function validProbe(): VideoProbeService {
  return {
    fileRetentionDays: 7,
    probe: vi.fn().mockResolvedValue({
      audioCodec: "aac",
      durationSeconds: 60,
      fps: 30,
      hasAudio: true,
      height: 1080,
      videoCodec: "h264",
      width: 1920,
    }),
  } as unknown as VideoProbeService;
}

function createVideoDatabase(
  video:
    | {
        readonly durationSeconds: string;
        readonly expiresAt: Date;
        readonly fileSizeBytes: number;
        readonly fps: string | null;
        readonly hasAudio: boolean;
        readonly height: number;
        readonly id: string;
        readonly originalFileName: string;
        readonly width: number;
      }
    | undefined,
): DatabaseService {
  const limit = vi.fn().mockResolvedValue(video ? [video] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ innerJoin });
  const select = vi.fn().mockReturnValue({ from });

  return { database: { db: { select } } } as unknown as DatabaseService;
}

describe("ProjectsService.storeSourceUpload", () => {
  it("conceals missing and cross-user projects while removing the staged file", async () => {
    const discardStagedUpload = vi.fn().mockResolvedValue(undefined);
    const service = new ProjectsService(
      createDatabase(undefined),
      {
        discardStagedUpload,
      } as unknown as LocalStorageService,
      validProbe(),
    );

    const error = await service
      .storeSourceUpload("user-1", "project-1", upload)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ProjectUploadError);
    expect(error).toMatchObject({ code: "PROJECT_NOT_FOUND", statusCode: 404 });
    expect(discardStagedUpload).toHaveBeenCalledWith(upload.stagedPath);
  });

  it("rejects non-draft projects before committing a source file", async () => {
    const discardStagedUpload = vi.fn().mockResolvedValue(undefined);
    const commitSourceUpload = vi.fn();
    const service = new ProjectsService(
      createDatabase({ status: "uploaded" }),
      {
        commitSourceUpload,
        discardStagedUpload,
      } as unknown as LocalStorageService,
      validProbe(),
    );

    const error = await service
      .storeSourceUpload("user-1", "project-1", upload)
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({ code: "PROJECT_UPLOAD_NOT_ALLOWED", statusCode: 409 });
    expect(commitSourceUpload).not.toHaveBeenCalled();
    expect(discardStagedUpload).toHaveBeenCalledWith(upload.stagedPath);
  });

  it("commits only an owned draft project's staged upload", async () => {
    const commitSourceUpload = vi.fn().mockResolvedValue(undefined);
    const readSourceUpload = vi.fn().mockResolvedValue({
      manifest: {
        fileSizeBytes: 1024,
        mimeType: "video/mp4",
        originalFileName: "episode.mp4",
        storedAt: "2026-07-13T02:00:00.000Z",
        version: 1,
      },
      videoPath: "C:/private/source/video",
    });
    const service = new ProjectsService(
      createDatabase({ status: "draft" }),
      {
        commitSourceUpload,
        readSourceUpload,
      } as unknown as LocalStorageService,
      validProbe(),
    );

    await expect(service.storeSourceUpload("user-1", "project-1", upload)).resolves.toBeUndefined();
    expect(commitSourceUpload).toHaveBeenCalledWith({
      ...upload,
      projectId: "project-1",
      userId: "user-1",
    });
    expect(readSourceUpload).toHaveBeenCalledWith("user-1", "project-1");
  });

  it("persists trusted metadata and advances the project only after a valid probe", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T02:00:00.000Z"));
    const limit = vi.fn().mockResolvedValue([{ status: "draft" }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const returning = vi.fn().mockResolvedValue([{ id: "project-1" }]);
    const updateWhere = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where: updateWhere });
    const update = vi.fn().mockReturnValue({ set });
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockReturnValue({ values });
    const transaction = vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback({ insert, update }),
    );
    const database = { database: { db: { select, transaction } } } as unknown as DatabaseService;
    const service = new ProjectsService(
      database,
      {
        commitSourceUpload: vi.fn().mockResolvedValue(undefined),
        readSourceUpload: vi.fn().mockResolvedValue({
          manifest: {
            fileSizeBytes: 1024,
            mimeType: "video/mp4",
            originalFileName: "episode.mp4",
            storedAt: "2026-07-13T02:00:00.000Z",
            version: 1,
          },
          videoPath: "C:/private/source/video",
        }),
      } as unknown as LocalStorageService,
      validProbe(),
    );

    await service.storeSourceUpload("user-1", "project-1", upload);

    expect(update).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        audioCodec: "aac",
        durationSeconds: "60",
        expiresAt: new Date("2026-07-20T02:00:00.000Z"),
        fileSizeBytes: 1024,
        fps: "30",
        hasAudio: true,
        height: 1080,
        mimeType: "video/mp4",
        originalFileName: "episode.mp4",
        projectId: "project-1",
        storagePath: "C:/private/source/video",
        videoCodec: "h264",
        width: 1920,
      }),
    );
    vi.useRealTimers();
  });

  it("sanitizes storage failures and attempts staged-file cleanup", async () => {
    const commitSourceUpload = vi.fn().mockRejectedValue(new Error("C:/storage/private/video"));
    const discardStagedUpload = vi.fn().mockResolvedValue(undefined);
    const service = new ProjectsService(
      createDatabase({ status: "draft" }),
      {
        commitSourceUpload,
        discardStagedUpload,
      } as unknown as LocalStorageService,
      validProbe(),
    );

    const error = await service
      .storeSourceUpload("user-1", "project-1", upload)
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({
      code: "UPLOAD_STORAGE_FAILED",
      message: "We could not store this video. Please try again.",
      statusCode: 500,
    });
    expect(discardStagedUpload).toHaveBeenCalledWith(upload.stagedPath);
  });

  it("removes the committed source and returns a safe validation error when probing fails", async () => {
    const commitSourceUpload = vi.fn().mockResolvedValue(undefined);
    const readSourceUpload = vi.fn().mockResolvedValue({
      manifest: {
        fileSizeBytes: 1024,
        mimeType: "video/mp4",
        originalFileName: "episode.mp4",
        storedAt: "2026-07-13T02:00:00.000Z",
        version: 1,
      },
      videoPath: "C:/private/source/video",
    });
    const removeSourceUpload = vi.fn().mockResolvedValue(undefined);
    const probe = vi
      .fn()
      .mockRejectedValue(
        new VideoProbeError("missing_audio", "This video does not contain an audio track."),
      );
    const service = new ProjectsService(
      createDatabase({ status: "draft" }),
      {
        commitSourceUpload,
        readSourceUpload,
        removeSourceUpload,
      } as unknown as LocalStorageService,
      { fileRetentionDays: 7, probe } as unknown as VideoProbeService,
    );

    const error = await service
      .storeSourceUpload("user-1", "project-1", upload)
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({
      code: "UPLOAD_INVALID_VIDEO",
      message: "This video does not contain an audio track.",
      statusCode: 422,
    });
    expect(removeSourceUpload).toHaveBeenCalledWith("user-1", "project-1");
  });

  it("cleans up a staged file when project ownership lookup fails", async () => {
    const discardStagedUpload = vi.fn().mockResolvedValue(undefined);
    const service = new ProjectsService(
      {
        database: {
          db: {
            select: vi.fn().mockImplementation(() => {
              throw new Error("database unavailable");
            }),
          },
        },
      } as unknown as DatabaseService,
      { discardStagedUpload } as unknown as LocalStorageService,
      validProbe(),
    );

    const error = await service
      .storeSourceUpload("user-1", "project-1", upload)
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({ code: "UPLOAD_STORAGE_FAILED", statusCode: 500 });
    expect(discardStagedUpload).toHaveBeenCalledWith(upload.stagedPath);
  });
});

describe("ProjectsService.getSourceVideo", () => {
  it("returns persisted metadata and rounds the trusted duration up to credits", async () => {
    const service = new ProjectsService(
      createVideoDatabase({
        durationSeconds: "60.001",
        expiresAt: new Date("2026-07-20T02:00:00.000Z"),
        fileSizeBytes: 1024,
        fps: "30",
        hasAudio: true,
        height: 1080,
        id: "video-1",
        originalFileName: "episode.mp4",
        width: 1920,
      }),
      {} as LocalStorageService,
      validProbe(),
    );

    await expect(service.getSourceVideo("user-1", "project-1")).resolves.toEqual({
      durationSeconds: 60.001,
      expiresAt: "2026-07-20T02:00:00.000Z",
      fileName: "episode.mp4",
      fileSizeBytes: 1024,
      fps: 30,
      hasAudio: true,
      height: 1080,
      id: "video-1",
      requiredCredits: 2,
      width: 1920,
    });
  });

  it("returns a safe not-found error when no owned source video is available", async () => {
    const service = new ProjectsService(
      createVideoDatabase(undefined),
      {} as LocalStorageService,
      validProbe(),
    );

    await expect(service.getSourceVideo("other-user", "project-1")).rejects.toMatchObject({
      code: "PROJECT_NOT_FOUND",
      message: "Project or source video not found.",
      statusCode: 404,
    });
  });
});
