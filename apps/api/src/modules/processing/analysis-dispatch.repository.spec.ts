import { describe, expect, it, vi } from "vitest";

import { AnalysisDispatchRepository } from "./analysis-dispatch.repository";

describe("AnalysisDispatchRepository", () => {
  it("claims one leased dispatch through the restricted database function", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          attemptCount: 1,
          dispatchId: "dispatch-1",
          jobId: "job-1",
          jobStatus: "queued",
          leaseToken: "lease-1",
          projectId: "project-1",
        },
      ],
    });
    const repository = new AnalysisDispatchRepository({
      database: { pool: { query } },
    } as never);

    await expect(repository.claim("job-1", "dispatcher-1")).resolves.toMatchObject({
      dispatchId: "dispatch-1",
      leaseToken: "lease-1",
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("public.claim_pending_analysis_dispatch($1, $2)"),
      ["dispatcher-1", "job-1"],
    );
  });

  it("persists publication only with the claimed lease and deterministic BullMQ ID", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ outcome: "published" }] });
    const repository = new AnalysisDispatchRepository({
      database: { pool: { query } },
    } as never);

    await repository.markPublished("dispatch-1", "lease-1", "job-1");

    expect(query).toHaveBeenCalledWith(
      "SELECT public.mark_analysis_dispatch_published($1, $2, $3) AS outcome",
      ["dispatch-1", "lease-1", "job-1"],
    );
  });
});
