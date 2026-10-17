import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedRequest } from "../auth/auth.guard";
import { DeletionController } from "./deletion.controller";
import { DeletionError, type DeletionService } from "./deletion.service";

const projectId = "00000000-0000-4000-8000-000000000001";
const clip = { id: "00000000-0000-4000-8000-000000000002", expectedRevision: 0 };
const request = { user: { id: "owner" }, id: "delete-test" } as AuthenticatedRequest;
describe("deletion API boundary", () => {
  it("requires authentication and validates IDs and duplicate batches", async () => {
    const service = { project: vi.fn(), clips: vi.fn() };
    const controller = new DeletionController(service as unknown as DeletionService);
    await expect(controller.project(projectId, {} as AuthenticatedRequest)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(controller.project("invalid", request)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      controller.clips(projectId, { clips: [clip, clip] }, request),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.project).not.toHaveBeenCalled();
    expect(service.clips).not.toHaveBeenCalled();
  });
  it("returns no content for successful project and bulk deletion", async () => {
    const controller = new DeletionController({
      project: vi.fn().mockResolvedValue(undefined),
      clips: vi.fn().mockResolvedValue(undefined),
    } as unknown as DeletionService);
    await expect(controller.project(projectId, request)).resolves.toBeUndefined();
    await expect(controller.clips(projectId, { clips: [clip] }, request)).resolves.toBeUndefined();
  });
  it("reports missing projects and revision or busy conflicts", async () => {
    for (const [code, type] of [
      ["PROJECT_NOT_FOUND", NotFoundException],
      ["PROJECT_BUSY", ConflictException],
      ["CLIP_EDIT_CONFLICT", ConflictException],
    ] as const) {
      const controller = new DeletionController({
        project: vi.fn().mockRejectedValue(new DeletionError(code)),
      } as unknown as DeletionService);
      await expect(controller.project(projectId, request)).rejects.toBeInstanceOf(type);
    }
  });
});
