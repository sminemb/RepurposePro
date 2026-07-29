import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ProcessingFailureIntentRecord,
  ProcessingFailureIntentRepositoryContract,
} from "./processing-failure-intent.repository";
import { ProcessingFailureSweeperService } from "./processing-failure-sweeper.service";

const intent: ProcessingFailureIntentRecord = {
  attemptCount: 1,
  failureCode: "ANALYSIS_RETRIES_EXHAUSTED",
  intentId: "00000000-0000-4000-8000-000000000761",
  jobId: "00000000-0000-4000-8000-000000000762",
  leaseToken: "00000000-0000-4000-8000-000000000763",
  safeMessage: "Processing failed before a usable result was produced.",
};

describe("ProcessingFailureSweeperService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries a persisted intent after finalization fails without another queue event", async () => {
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const claim = vi
      .fn<ProcessingFailureIntentRepositoryContract["claim"]>()
      .mockResolvedValueOnce(intent)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...intent, attemptCount: 2 })
      .mockResolvedValueOnce(null);
    const markFinalized = vi.fn().mockResolvedValue(undefined);
    const reschedule = vi.fn().mockResolvedValue(undefined);
    const finalize = vi
      .fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValue({ outcome: "refunded", refundedCredits: 11 });
    const service = new ProcessingFailureSweeperService(
      { claim, markFinalized, persist: vi.fn(), reschedule },
      { handleTerminalFailure: finalize } as never,
      { intervalMs: 60_000, maxBatchSize: 10, sweeperId: "sweeper-test" },
    );

    await expect(service.sweepPending("background")).resolves.toBe(0);
    await expect(service.sweepPending("background")).resolves.toBe(1);

    expect(reschedule).toHaveBeenCalledOnce();
    expect(markFinalized).toHaveBeenCalledWith(intent.intentId, intent.leaseToken);
    expect(finalize).toHaveBeenCalledTimes(2);
  });

  it("leaves the intent retryable when refund succeeds but marker persistence fails", async () => {
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const claim = vi
      .fn<ProcessingFailureIntentRepositoryContract["claim"]>()
      .mockResolvedValueOnce(intent)
      .mockResolvedValueOnce(null);
    const markFinalized = vi.fn().mockRejectedValue(new Error("marker failed"));
    const reschedule = vi.fn().mockResolvedValue(undefined);
    const service = new ProcessingFailureSweeperService(
      { claim, markFinalized, persist: vi.fn(), reschedule },
      {
        handleTerminalFailure: vi
          .fn()
          .mockResolvedValue({ outcome: "refunded", refundedCredits: 11 }),
      } as never,
      { intervalMs: 60_000, maxBatchSize: 10, sweeperId: "sweeper-test" },
    );

    await expect(service.sweepPending("background")).resolves.toBe(0);

    expect(reschedule).toHaveBeenCalledWith(intent.intentId, intent.leaseToken, 1);
  });
});
