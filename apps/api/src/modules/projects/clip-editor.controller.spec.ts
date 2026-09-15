import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequest } from "../auth/auth.guard";
import { ClipEditorController } from "./clip-editor.controller";
import { ClipEditorError, type ClipEditorService } from "./clip-editor.service";

const projectId = "00000000-0000-4000-8000-000000003101";
const clipId = "00000000-0000-4000-8000-000000003102";
const request = { id: "test-request", user: { id: "owner" } } as AuthenticatedRequest;
const input = {
  expectedRevision: 0,
  startTime: 1,
  endTime: 5,
  captionsEnabled: false,
  captionPosition: { x: 0.5, y: 0.72 },
  previewFontSize: 48,
  captionEdits: [],
};
function setup() {
  const get = vi.fn(),
    save = vi.fn();
  return {
    get,
    save,
    controller: new ClipEditorController({ get, save } as unknown as ClipEditorService),
  };
}
describe("ClipEditorController", () => {
  it("requires an authenticated user before reading or saving", async () => {
    const { controller, save } = setup();
    await expect(
      controller.get(projectId, clipId, {} as AuthenticatedRequest),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      controller.save(projectId, clipId, input, {} as AuthenticatedRequest),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(save).not.toHaveBeenCalled();
  });
  it("rejects malformed IDs and non-editable fields", async () => {
    const { controller, save } = setup();
    await expect(controller.get(projectId, "invalid", request)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      controller.save(projectId, clipId, { ...input, selected: true }, request),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(save).not.toHaveBeenCalled();
  });
  it("returns the saved canonical state in the existing API envelope", async () => {
    const { controller, save } = setup();
    save.mockResolvedValue({ clip: { id: clipId, revision: 1 } });
    await expect(controller.save(projectId, clipId, input, request)).resolves.toEqual({
      data: { clip: { id: clipId, revision: 1 } },
    });
    expect(save).toHaveBeenCalledWith("owner", projectId, clipId, input);
  });
  it.each([
    ["CLIP_EDIT_CONFLICT", ConflictException],
    ["CLIP_NOT_FOUND", NotFoundException],
    ["CLIP_INVALID_TIME_RANGE", BadRequestException],
  ])("maps %s to a public error", async (code, errorType) => {
    const { controller, save } = setup();
    save.mockRejectedValue(new ClipEditorError(code));
    await expect(controller.save(projectId, clipId, input, request)).rejects.toBeInstanceOf(
      errorType,
    );
  });
});
