import { describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../infrastructure/database.service";
import type { LocalStorageService } from "../storage/local-storage.service";
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

  return { database: { db: { select } } } as unknown as DatabaseService;
}

describe("ProjectsService.storeSourceUpload", () => {
  it("conceals missing and cross-user projects while removing the staged file", async () => {
    const discardStagedUpload = vi.fn().mockResolvedValue(undefined);
    const service = new ProjectsService(createDatabase(undefined), {
      discardStagedUpload,
    } as unknown as LocalStorageService);

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
    const service = new ProjectsService(createDatabase({ status: "uploaded" }), {
      commitSourceUpload,
      discardStagedUpload,
    } as unknown as LocalStorageService);

    const error = await service
      .storeSourceUpload("user-1", "project-1", upload)
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({ code: "PROJECT_UPLOAD_NOT_ALLOWED", statusCode: 409 });
    expect(commitSourceUpload).not.toHaveBeenCalled();
    expect(discardStagedUpload).toHaveBeenCalledWith(upload.stagedPath);
  });

  it("commits only an owned draft project's staged upload", async () => {
    const commitSourceUpload = vi.fn().mockResolvedValue(undefined);
    const service = new ProjectsService(createDatabase({ status: "draft" }), {
      commitSourceUpload,
    } as unknown as LocalStorageService);

    await expect(service.storeSourceUpload("user-1", "project-1", upload)).resolves.toBeUndefined();
    expect(commitSourceUpload).toHaveBeenCalledWith({
      ...upload,
      projectId: "project-1",
      userId: "user-1",
    });
  });

  it("sanitizes storage failures and attempts staged-file cleanup", async () => {
    const commitSourceUpload = vi.fn().mockRejectedValue(new Error("C:/storage/private/video"));
    const discardStagedUpload = vi.fn().mockResolvedValue(undefined);
    const service = new ProjectsService(createDatabase({ status: "draft" }), {
      commitSourceUpload,
      discardStagedUpload,
    } as unknown as LocalStorageService);

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
    );

    const error = await service
      .storeSourceUpload("user-1", "project-1", upload)
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({ code: "UPLOAD_STORAGE_FAILED", statusCode: 500 });
    expect(discardStagedUpload).toHaveBeenCalledWith(upload.stagedPath);
  });
});
