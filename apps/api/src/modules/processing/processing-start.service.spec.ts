import { describe, expect, it, vi } from "vitest";

import type { AnalysisDispatcherService } from "./analysis-dispatcher.service";
import type {
  ProcessingStartRecord,
  ProcessingStartRepositoryContract,
} from "./processing-start.repository";
import { ProcessingStartError, ProcessingStartService } from "./processing-start.service";

const jobId = "00000000-0000-4000-8000-000000000711";
const projectId = "00000000-0000-4000-8000-000000000712";
const requestId = "req_processing_service";

function startRecord(outcome: "created" | "existing"): ProcessingStartRecord {
  return { creditsCharged: 11, jobId, outcome, projectId, status: "queued" };
}

function setup(record: ProcessingStartRecord = startRecord("created")) {
  const start = vi.fn<ProcessingStartRepositoryContract["start"]>().mockResolvedValue(record);
  const dispatchJob = vi.fn<AnalysisDispatcherService["dispatchJob"]>().mockResolvedValue(true);
  const repository = { start } as ProcessingStartRepositoryContract;

  return {
    dispatchJob,
    service: new ProcessingStartService(repository, {
      dispatchJob,
    } as unknown as AnalysisDispatcherService),
    start,
  };
}

describe("ProcessingStartService", () => {
  it("checks an actual retained source before charging a refunded restart", async () => {
    const start = vi.fn().mockResolvedValue(startRecord("created"));
    const getSourceVideoContent = vi.fn().mockResolvedValue({ path: "retained.mp4" });
    const service = new ProcessingStartService(
      { start, requiresRestartValidation: vi.fn().mockResolvedValue(true) },
      { dispatchJob: vi.fn().mockResolvedValue(true) } as never,
      { getSourceVideoContent } as never,
    );
    await service.start("user-1", projectId, requestId);
    expect(getSourceVideoContent).toHaveBeenCalledWith("user-1", projectId);
    expect(getSourceVideoContent.mock.invocationCallOrder[0]).toBeLessThan(
      start.mock.invocationCallOrder[0]!,
    );
  });

  it("does not charge a refunded restart when the retained file is unavailable", async () => {
    const start = vi.fn();
    const service = new ProcessingStartService(
      { start, requiresRestartValidation: vi.fn().mockResolvedValue(true) },
      { dispatchJob: vi.fn() } as never,
      { getSourceVideoContent: vi.fn().mockRejectedValue(new Error("private path")) } as never,
    );
    await expect(service.start("user-1", projectId, requestId)).rejects.toMatchObject({
      code: "PROCESSING_VIDEO_REQUIRED",
      statusCode: 409,
    });
    expect(start).not.toHaveBeenCalled();
  });
  it("dispatches a newly created durable job before returning the unchanged response", async () => {
    const { dispatchJob, service, start } = setup();

    await expect(service.start("user-1", projectId, requestId)).resolves.toEqual({
      creditsCharged: 11,
      jobId,
      projectId,
      status: "queued",
    });
    expect(dispatchJob).toHaveBeenCalledWith(jobId, requestId);
    expect(start).toHaveBeenCalledOnce();
    expect(start.mock.invocationCallOrder[0]).toBeLessThan(
      dispatchJob.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("reuses an existing durable job without another financial operation", async () => {
    const { dispatchJob, service, start } = setup(startRecord("existing"));

    await service.start("user-1", projectId, requestId);

    expect(start).toHaveBeenCalledOnce();
    expect(dispatchJob).toHaveBeenCalledWith(jobId, requestId);
  });

  it("returns a safe queue error while durable background retry remains pending", async () => {
    const { dispatchJob, service } = setup();
    dispatchJob.mockResolvedValue(false);

    const error = await service
      .start("user-1", projectId, requestId)
      .catch((reason: unknown): unknown => reason);

    expect(error).toBeInstanceOf(ProcessingStartError);
    expect(error).toMatchObject({ code: "QUEUE_UNAVAILABLE", statusCode: 503 });
    expect((error as Error).message).toBe(
      "Your processing job is saved and will retry automatically when the queue recovers.",
    );
  });

  it("uses the same safe queue error when immediate dispatch throws", async () => {
    const { dispatchJob, service } = setup(startRecord("existing"));
    dispatchJob.mockRejectedValue(new Error("private queue failure"));

    await expect(service.start("user-1", projectId, requestId)).rejects.toMatchObject({
      code: "QUEUE_UNAVAILABLE",
      statusCode: 503,
    });
  });
});
