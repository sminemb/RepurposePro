import type { ProjectSummary, SourceVideoMetadata } from "@repurposepro/shared";
import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequest } from "../auth/auth.guard";
import { ProjectsController } from "./projects.controller";
import { ProjectUploadError, type ProjectsService } from "./projects.service";

const request = {
  id: "req_project_test",
  user: { email: "creator@example.com", id: "user_1", name: "Creator" },
} as AuthenticatedRequest;

const project: ProjectSummary = {
  clipCount: 0,
  createdAt: "2026-07-12T09:06:00.000Z",
  expiresAt: null,
  id: "f5e14a5f-6d36-4449-a9c3-5e5c67a5344e",
  name: "Creator breakdown",
  outputType: "clips",
  status: "draft",
};

const sourceVideo: SourceVideoMetadata = {
  durationSeconds: 60.001,
  expiresAt: "2026-07-20T02:00:00.000Z",
  fileName: "episode.mp4",
  fileSizeBytes: 1024,
  fps: 30,
  hasAudio: true,
  height: 1080,
  id: "f5e14a5f-6d36-4449-a9c3-5e5c67a5344e",
  requiredCredits: 2,
  width: 1920,
};

describe("ProjectsController", () => {
  it("creates a draft project for the authenticated user only", async () => {
    const create = vi.fn().mockResolvedValue(project);
    const controller = new ProjectsController({ create } as unknown as ProjectsService);

    await expect(
      controller.create({ name: " Creator breakdown ", outputType: "clips" }, request),
    ).resolves.toEqual({
      data: project,
    });
    expect(create).toHaveBeenCalledWith("user_1", {
      name: "Creator breakdown",
      outputType: "clips",
    });
  });

  it("lists only the authenticated user's projects with validated filters", async () => {
    const list = vi.fn().mockResolvedValue({ data: [project], meta: { nextCursor: null } });
    const controller = new ProjectsController({ list } as unknown as ProjectsService);

    await expect(
      controller.list({ limit: "5", outputType: "clips", status: "draft" }, request),
    ).resolves.toEqual({
      data: [project],
      meta: { nextCursor: null },
    });
    expect(list).toHaveBeenCalledWith("user_1", { limit: 5, outputType: "clips", status: "draft" });
  });

  it("returns source video metadata for the authenticated project owner", async () => {
    const getSourceVideo = vi.fn().mockResolvedValue(sourceVideo);
    const controller = new ProjectsController({ getSourceVideo } as unknown as ProjectsService);

    await expect(controller.getSourceVideo(project.id, request)).resolves.toEqual({
      data: sourceVideo,
    });
    expect(getSourceVideo).toHaveBeenCalledWith("user_1", project.id);
  });

  it("returns a safe not-found envelope when no owned source video exists", async () => {
    const controller = new ProjectsController({
      getSourceVideo: vi
        .fn()
        .mockRejectedValue(
          new ProjectUploadError("PROJECT_NOT_FOUND", 404, "Project or source video not found."),
        ),
    } as unknown as ProjectsService);

    const error = await controller
      .getSourceVideo(project.id, request)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toEqual({
      error: {
        code: "PROJECT_NOT_FOUND",
        details: null,
        message: "Project or source video not found.",
        requestId: "req_project_test",
      },
    });
  });

  it("returns the standard validation error envelope for invalid input", async () => {
    const controller = new ProjectsController({} as ProjectsService);
    const error = await controller
      .create({ name: "", outputType: "clips" }, request)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        details: null,
        message: "Project name must be between 1 and 120 characters.",
        requestId: "req_project_test",
      },
    });
  });

  it("stores an allowed source video only for the authenticated user", async () => {
    const storeSourceUpload = vi.fn().mockResolvedValue(undefined);
    const controller = new ProjectsController({ storeSourceUpload } as unknown as ProjectsService);
    const file = {
      mimetype: "video/mp4",
      originalname: "episode.mp4",
      path: "C:/private/staging/upload",
      size: 1024,
    } as Express.Multer.File;

    await expect(controller.upload(project.id, file, request)).resolves.toEqual({
      data: { success: true },
    });
    expect(storeSourceUpload).toHaveBeenCalledWith("user_1", project.id, {
      fileSizeBytes: 1024,
      mimeType: "video/mp4",
      originalFileName: "episode.mp4",
      stagedPath: "C:/private/staging/upload",
    });
  });

  it("returns the documented upload validation envelope without calling storage", async () => {
    const storeSourceUpload = vi.fn();
    const controller = new ProjectsController({ storeSourceUpload } as unknown as ProjectsService);
    const error = await controller
      .upload(project.id, undefined, request)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toEqual({
      error: {
        code: "UPLOAD_INVALID_FILE",
        details: null,
        message: "Choose a video file to upload.",
        requestId: "req_project_test",
      },
    });
    expect(storeSourceUpload).not.toHaveBeenCalled();
  });

  it("removes a staged file when the project ID is invalid", async () => {
    const discardStagedUpload = vi.fn().mockResolvedValue(undefined);
    const controller = new ProjectsController({
      discardStagedUpload,
    } as unknown as ProjectsService);
    const file = {
      mimetype: "video/mp4",
      originalname: "episode.mp4",
      path: "C:/private/staging/upload",
      size: 1024,
    } as Express.Multer.File;

    await expect(controller.upload("not-a-project-id", file, request)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(discardStagedUpload).toHaveBeenCalledWith(file.path);
  });

  it("returns the standard invalid-video envelope without leaking source details", async () => {
    const controller = new ProjectsController({
      storeSourceUpload: vi
        .fn()
        .mockRejectedValue(
          new ProjectUploadError(
            "UPLOAD_INVALID_VIDEO",
            422,
            "This video does not contain an audio track.",
          ),
        ),
    } as unknown as ProjectsService);
    const file = {
      mimetype: "video/mp4",
      originalname: "episode.mp4",
      path: "C:/private/staging/upload",
      size: 1024,
    } as Express.Multer.File;

    const error = await controller
      .upload(project.id, file, request)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toEqual({
      error: {
        code: "UPLOAD_INVALID_VIDEO",
        details: null,
        message: "This video does not contain an audio track.",
        requestId: "req_project_test",
      },
    });
  });
});
