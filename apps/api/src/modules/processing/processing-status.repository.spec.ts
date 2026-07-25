import { describe, expect, it, vi } from "vitest";

import { ProcessingStatusRepository } from "./processing-status.repository";

describe("ProcessingStatusRepository", () => {
  it("reads only the authenticated owner's project and current job", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          currentJobId: "00000000-0000-4000-8000-000000000702",
          currentJobProgress: null,
          currentJobReferenceId: "00000000-0000-4000-8000-000000000702",
          currentJobStatus: "queued",
          currentJobStep: "queued",
          projectId: "00000000-0000-4000-8000-000000000701",
          projectStatus: "queued",
        },
      ],
    });
    const repository = new ProcessingStatusRepository({
      database: { pool: { query } },
    } as never);

    await expect(
      repository.get("session-user", "00000000-0000-4000-8000-000000000701"),
    ).resolves.toMatchObject({ projectStatus: "queued" });
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/projects[\s\S]+processing_jobs[\s\S]+project\.user_id = \$1/),
      ["session-user", "00000000-0000-4000-8000-000000000701"],
    );
  });

  it("returns null when no owned project exists", async () => {
    const repository = new ProcessingStatusRepository({
      database: { pool: { query: vi.fn().mockResolvedValue({ rows: [] }) } },
    } as never);

    await expect(repository.get("session-user", "project-id")).resolves.toBeNull();
  });

  it("fails closed when the owner query returns more than one project", async () => {
    const repository = new ProcessingStatusRepository({
      database: { pool: { query: vi.fn().mockResolvedValue({ rows: [{}, {}] }) } },
    } as never);

    await expect(repository.get("session-user", "project-id")).rejects.toThrow(
      "Processing status returned multiple projects.",
    );
  });
});
