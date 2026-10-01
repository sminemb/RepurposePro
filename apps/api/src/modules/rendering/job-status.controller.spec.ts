import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedRequest } from "../auth/auth.guard";
import type { DatabaseService } from "../infrastructure/database.service";
import { JobStatusController } from "./job-status.controller";

const jobId = "00000000-0000-4000-8000-000000000071";
const projectId = "00000000-0000-4000-8000-000000000070";
const request = { user: { id: "owner" } } as AuthenticatedRequest;
describe("owned durable job status", () => {
  it("binds the documented project path as well as the session owner", async () => {
    const data = { id: jobId, status: "active", clips: [{ clipId: jobId, status: "completed" }] };
    const query = vi.fn().mockResolvedValue({ rows: [{ result: data }] });
    const controller = new JobStatusController({
      database: { pool: { query } },
    } as unknown as DatabaseService);
    expect(await controller.get(jobId, request, projectId)).toEqual({ data });
    expect(query).toHaveBeenCalledWith(expect.any(String), ["owner", jobId, projectId]);
    await controller.get(jobId, request);
    expect(query).toHaveBeenLastCalledWith(expect.any(String), ["owner", jobId, null]);
  });
  it("rejects missing owners, malformed paths and ownership misses", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ result: null }] });
    const controller = new JobStatusController({
      database: { pool: { query } },
    } as unknown as DatabaseService);
    await expect(controller.get(jobId, {} as AuthenticatedRequest)).rejects.toMatchObject({
      status: 401,
    });
    await expect(controller.get(jobId, request, "bad")).rejects.toMatchObject({ status: 400 });
    expect(query).not.toHaveBeenCalled();
    await expect(controller.get(jobId, request, projectId)).rejects.toMatchObject({ status: 404 });
  });
});
