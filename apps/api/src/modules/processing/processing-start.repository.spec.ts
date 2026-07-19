import { describe, expect, it, vi } from "vitest";

import { ProcessingStartRepository } from "./processing-start.repository";

describe("ProcessingStartRepository", () => {
  it("binds session-derived user and project IDs to the paid-start function", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          creditsCharged: 11,
          jobId: "00000000-0000-4000-8000-000000000601",
          outcome: "created",
          projectId: "00000000-0000-4000-8000-000000000602",
          status: "queued",
        },
      ],
    });
    const repository = new ProcessingStartRepository({
      database: { pool: { query } },
    } as never);

    await expect(
      repository.start("session-user", "00000000-0000-4000-8000-000000000602"),
    ).resolves.toMatchObject({ outcome: "created" });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("public.start_paid_video_analysis($1, $2)"),
      ["session-user", "00000000-0000-4000-8000-000000000602"],
    );
  });

  it("fails closed when the database function does not return exactly one outcome", async () => {
    const repository = new ProcessingStartRepository({
      database: { pool: { query: vi.fn().mockResolvedValue({ rows: [] }) } },
    } as never);

    await expect(
      repository.start("session-user", "00000000-0000-4000-8000-000000000602"),
    ).rejects.toThrow("Processing start did not return one result.");
  });

  it("persists the queue ID only for the matching owned analysis job", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "job-1" }] });
    const repository = new ProcessingStartRepository({
      database: { pool: { query } },
    } as never);

    await repository.markEnqueued("session-user", "project-1", "job-1", "job-1");

    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE processing_jobs[\s\S]+projects[\s\S]+analyze_video/),
      ["session-user", "project-1", "job-1", "job-1"],
    );
    expect(query.mock.calls[0]?.[0]).toMatch(
      /processing_job\.bullmq_job_id IS NULL\s+OR processing_job\.bullmq_job_id = \$4/,
    );
  });

  it.each([{ rows: [] }, { rows: [{ id: "job-1" }, { id: "job-1" }] }])(
    "fails closed when the owned queue marker update is ambiguous: %#",
    async ({ rows }) => {
      const repository = new ProcessingStartRepository({
        database: { pool: { query: vi.fn().mockResolvedValue({ rows }) } },
      } as never);

      await expect(
        repository.markEnqueued("session-user", "project-1", "job-1", "job-1"),
      ).rejects.toThrow("Processing queue reference did not update one job.");
    },
  );
});
