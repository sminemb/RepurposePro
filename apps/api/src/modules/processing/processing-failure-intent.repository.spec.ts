import { describe, expect, it, vi } from "vitest";

import { ProcessingFailureIntentRepository } from "./processing-failure-intent.repository";

describe("ProcessingFailureIntentRepository", () => {
  it("persists a terminal intent before finalization and claims it with a durable lease", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ outcome: "persisted" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            attemptCount: 1,
            failureCode: "ANALYSIS_RETRIES_EXHAUSTED",
            intentId: "intent-1",
            jobId: "job-1",
            leaseToken: "lease-1",
            safeMessage: "Safe.",
          },
        ],
      });
    const repository = new ProcessingFailureIntentRepository({
      database: { pool: { query } },
    } as never);

    await expect(
      repository.persist("job-1", "ANALYSIS_RETRIES_EXHAUSTED", "Safe.", "queue:event-1"),
    ).resolves.toBe("persisted");
    await expect(repository.claim(null, "sweeper-1")).resolves.toMatchObject({
      intentId: "intent-1",
      leaseToken: "lease-1",
    });
    expect(query).toHaveBeenNthCalledWith(
      1,
      "SELECT public.persist_processing_failure_intent($1, $2, $3, $4) AS outcome",
      ["job-1", "ANALYSIS_RETRIES_EXHAUSTED", "Safe.", "queue:event-1"],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("public.claim_processing_failure_intent($1, $2)"),
      ["sweeper-1", null],
    );
  });

  it("fails closed on conflicting or malformed persistence outcomes", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ outcome: "unknown" }] });
    const repository = new ProcessingFailureIntentRepository({
      database: { pool: { query } },
    } as never);

    await expect(
      repository.persist("job-1", "USER_CANCELLED", "Safe.", "worker:1"),
    ).rejects.toThrow("Processing failure intent persistence returned an invalid result.");
  });
});
