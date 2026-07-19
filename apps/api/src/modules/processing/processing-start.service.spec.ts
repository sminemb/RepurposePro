import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

import type { AnalysisQueueGateway } from "./analysis-queue.gateway";
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
  const markEnqueued = vi
    .fn<ProcessingStartRepositoryContract["markEnqueued"]>()
    .mockResolvedValue(undefined);
  const start = vi.fn<ProcessingStartRepositoryContract["start"]>().mockResolvedValue(record);
  const enqueue = vi.fn<AnalysisQueueGateway["enqueue"]>().mockResolvedValue(jobId);
  const repository: ProcessingStartRepositoryContract = {
    markEnqueued,
    start,
  };
  const queue: AnalysisQueueGateway = {
    enqueue,
  };

  return {
    enqueue,
    markEnqueued,
    service: new ProcessingStartService(repository, queue),
    start,
  };
}

describe("ProcessingStartService", () => {
  let successLog: MockInstance;

  beforeEach(() => {
    successLog = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("publishes and marks a newly created durable job before returning the unchanged response", async () => {
    const { enqueue, markEnqueued, service, start } = setup();

    await expect(service.start("user-1", projectId, requestId)).resolves.toEqual({
      creditsCharged: 11,
      jobId,
      projectId,
      status: "queued",
    });
    expect(enqueue).toHaveBeenCalledWith({ jobId, projectId });
    expect(markEnqueued).toHaveBeenCalledWith("user-1", projectId, jobId, jobId);
    expect(start).toHaveBeenCalledOnce();
    expect(start.mock.invocationCallOrder[0]).toBeLessThan(
      enqueue.mock.invocationCallOrder[0] ?? 0,
    );
    expect(enqueue.mock.invocationCallOrder[0]).toBeLessThan(
      markEnqueued.mock.invocationCallOrder[0] ?? 0,
    );
    expect(successLog).toHaveBeenCalledWith({
      event: "analysis_job_enqueued",
      jobId,
      projectId,
      recovery: false,
      requestId,
    });
  });

  it("republishes an existing durable job for safe recovery without another financial operation", async () => {
    const { enqueue, markEnqueued, service, start } = setup(startRecord("existing"));

    await service.start("user-1", projectId, requestId);

    expect(start).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledWith({ jobId, projectId });
    expect(markEnqueued).toHaveBeenCalledWith("user-1", projectId, jobId, jobId);
  });

  it("returns a retry-safe queue error when publication fails and does not write the marker", async () => {
    const errorLog = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { enqueue, markEnqueued, service } = setup();
    enqueue.mockRejectedValue(new Error("private redis failure"));

    const error = await service
      .start("user-1", projectId, requestId)
      .catch((reason: unknown): unknown => reason);

    expect(error).toBeInstanceOf(ProcessingStartError);
    expect(error).toMatchObject({ code: "QUEUE_UNAVAILABLE", statusCode: 503 });
    expect((error as Error).message).toBe(
      "Your processing job is saved, but the queue is unavailable. Retry is safe.",
    );
    expect(markEnqueued).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith({
      event: "analysis_job_enqueue_failed",
      failureStage: "queue_publish",
      jobId,
      projectId,
      recovery: false,
      requestId,
    });
  });

  it("returns the same retry-safe error when queue-reference persistence fails", async () => {
    const errorLog = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { markEnqueued, service, start } = setup(startRecord("existing"));
    markEnqueued.mockRejectedValue(new Error("private database failure"));

    const error = await service
      .start("user-1", projectId, requestId)
      .catch((reason: unknown): unknown => reason);

    expect(error).toMatchObject({ code: "QUEUE_UNAVAILABLE", statusCode: 503 });
    expect(start).toHaveBeenCalledOnce();
    expect(markEnqueued).toHaveBeenCalledOnce();
    expect(errorLog).toHaveBeenCalledWith({
      event: "analysis_job_enqueue_failed",
      failureStage: "queue_reference_persist",
      jobId,
      projectId,
      recovery: true,
      requestId,
    });
  });
});
