import { describe, expect, it, vi } from "vitest";

import { ProcessingFailureRepository } from "./processing-failure.repository";

describe("ProcessingFailureRepository", () => {
  it("calls one restricted atomic failure/refund operation", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ outcome: "refunded", refundedCredits: 11 }],
    });
    const repository = new ProcessingFailureRepository({
      database: { pool: { query } },
    } as never);

    await expect(
      repository.finalize(
        "job-1",
        "ANALYSIS_RETRIES_EXHAUSTED",
        "Processing failed before a usable result was produced.",
      ),
    ).resolves.toEqual({ outcome: "refunded", refundedCredits: 11 });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("public.finalize_failed_processing_job($1, $2, $3)"),
      [
        "job-1",
        "ANALYSIS_RETRIES_EXHAUSTED",
        "Processing failed before a usable result was produced.",
      ],
    );
  });

  it("fails closed on malformed database outcomes", async () => {
    const repository = new ProcessingFailureRepository({
      database: {
        pool: {
          query: vi.fn().mockResolvedValue({
            rows: [{ outcome: "refunded", refundedCredits: -1 }],
          }),
        },
      },
    } as never);

    await expect(
      repository.finalize("job-1", "ANALYSIS_RETRIES_EXHAUSTED", "Safe."),
    ).rejects.toThrow("Processing failure finalization returned an invalid result.");
  });
});
