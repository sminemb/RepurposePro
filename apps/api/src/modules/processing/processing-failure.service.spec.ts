import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProcessingFailureRepositoryContract } from "./processing-failure.repository";
import { ProcessingFailureService } from "./processing-failure.service";

const jobId = "00000000-0000-4000-8000-000000000741";

describe("ProcessingFailureService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the restricted atomic operation for an exhausted terminal analysis failure", async () => {
    const finalize = vi
      .fn<ProcessingFailureRepositoryContract["finalize"]>()
      .mockResolvedValue({ outcome: "refunded", refundedCredits: 11 });
    const info = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const service = new ProcessingFailureService({ finalize });

    await expect(
      service.handleTerminalFailure(jobId, "ANALYSIS_RETRIES_EXHAUSTED", "queue-event-1"),
    ).resolves.toEqual({ outcome: "refunded", refundedCredits: 11 });

    expect(finalize).toHaveBeenCalledWith(
      jobId,
      "ANALYSIS_RETRIES_EXHAUSTED",
      "Processing failed before a usable result was produced.",
    );
    expect(info).toHaveBeenCalledWith({
      event: "processing_failure_finalized",
      failureCode: "ANALYSIS_RETRIES_EXHAUSTED",
      jobId,
      outcome: "refunded",
      refundedCredits: 11,
      requestId: "queue-event-1",
    });
  });

  it("keeps database and queue internals out of failure logs and user-safe messages", async () => {
    const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const finalize = vi
      .fn<ProcessingFailureRepositoryContract["finalize"]>()
      .mockRejectedValue(new Error("SELECT secret FROM private_table"));
    const service = new ProcessingFailureService({ finalize });

    await expect(
      service.handleTerminalFailure(jobId, "ANALYSIS_RETRIES_EXHAUSTED", "queue-event-2"),
    ).rejects.toThrow("Processing failure finalization failed.");

    expect(error).toHaveBeenCalledWith({
      event: "processing_failure_finalize_failed",
      failureCode: "ANALYSIS_RETRIES_EXHAUSTED",
      jobId,
      requestId: "queue-event-2",
    });
  });
});
