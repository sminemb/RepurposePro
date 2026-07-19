import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequest } from "../auth/auth.guard";
import { ProcessingController } from "./processing.controller";
import { ProcessingStartError, type ProcessingStartService } from "./processing-start.service";

const projectId = "00000000-0000-4000-8000-000000000501";
const request = {
  id: "req_processing_test",
  user: { email: "creator@example.test", id: "user_1", name: "Creator" },
} as AuthenticatedRequest;

describe("ProcessingController", () => {
  it("starts analysis with the session owner and returns the persisted job", async () => {
    const start = vi.fn().mockResolvedValue({
      creditsCharged: 11,
      jobId: "00000000-0000-4000-8000-000000000502",
      projectId,
      status: "queued",
    });
    const controller = new ProcessingController({ start } as unknown as ProcessingStartService);

    await expect(controller.start(projectId, { confirmed: true }, request)).resolves.toEqual({
      data: {
        creditsCharged: 11,
        jobId: "00000000-0000-4000-8000-000000000502",
        projectId,
        status: "queued",
      },
    });
    expect(start).toHaveBeenCalledWith("user_1", projectId);
  });

  it("returns the confirmation error before calling processing", async () => {
    const start = vi.fn();
    const controller = new ProcessingController({ start } as unknown as ProcessingStartService);

    const error = await controller
      .start(projectId, { confirmed: false }, request)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toEqual({
      error: {
        code: "PROCESSING_CONFIRMATION_REQUIRED",
        details: null,
        message: "Confirm the credit charge before starting processing.",
        requestId: "req_processing_test",
      },
    });
    expect(start).not.toHaveBeenCalled();
  });

  it.each([
    ["PROJECT_NOT_FOUND", 404, NotFoundException, "Project not found."],
    [
      "BILLING_INSUFFICIENT_CREDITS",
      409,
      ConflictException,
      "You do not have enough credits to process this video.",
    ],
    [
      "BILLING_DEDUCTION_FAILED",
      503,
      ServiceUnavailableException,
      "We could not start processing. Try again.",
    ],
  ])("maps %s to the standard safe envelope", async (code, statusCode, exception, message) => {
    const controller = new ProcessingController({
      start: vi.fn().mockRejectedValue(new ProcessingStartError(code, statusCode, message)),
    } as unknown as ProcessingStartService);

    const error = await controller
      .start(projectId, { confirmed: true }, request)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(exception);
    expect((error as { getResponse(): unknown }).getResponse()).toEqual({
      error: { code, details: null, message, requestId: "req_processing_test" },
    });
  });
});
