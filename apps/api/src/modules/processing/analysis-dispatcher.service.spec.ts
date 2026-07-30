import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnalysisQueueGateway } from "./analysis-queue.gateway";
import type {
  AnalysisDispatchRecord,
  AnalysisDispatchRepositoryContract,
} from "./analysis-dispatch.repository";
import { AnalysisDispatcherService } from "./analysis-dispatcher.service";

const dispatchId = "00000000-0000-4000-8000-000000000731";
const jobId = "00000000-0000-4000-8000-000000000732";
const leaseToken = "00000000-0000-4000-8000-000000000733";
const projectId = "00000000-0000-4000-8000-000000000734";

function dispatchRecord(overrides: Partial<AnalysisDispatchRecord> = {}): AnalysisDispatchRecord {
  return {
    attemptCount: 1,
    dispatchId,
    dispatchStatus: "pending",
    executionLeaseExpiresAt: null,
    jobId,
    jobStatus: "queued",
    lastFailureStage: null,
    leaseToken,
    projectId,
    ...overrides,
  };
}

function setup(records: Array<AnalysisDispatchRecord | null>) {
  const claim = vi.fn<AnalysisDispatchRepositoryContract["claim"]>();
  for (const record of records) {
    claim.mockResolvedValueOnce(record);
  }
  const isPublished = vi
    .fn<AnalysisDispatchRepositoryContract["isPublished"]>()
    .mockResolvedValue(false);
  const markPublished = vi
    .fn<AnalysisDispatchRepositoryContract["markPublished"]>()
    .mockResolvedValue(undefined);
  const reschedule = vi
    .fn<AnalysisDispatchRepositoryContract["reschedule"]>()
    .mockResolvedValue(undefined);
  const enqueue = vi.fn<AnalysisQueueGateway["enqueue"]>().mockResolvedValue(jobId);
  const inspect = vi.fn<AnalysisQueueGateway["inspect"]>().mockResolvedValue(null);
  const repository: AnalysisDispatchRepositoryContract = {
    claim,
    isPublished,
    markPublished,
    reschedule,
  };
  const queue: AnalysisQueueGateway = { enqueue, inspect };
  const recordTerminalFailure = vi.fn().mockResolvedValue("persisted");

  return {
    claim,
    enqueue,
    inspect,
    isPublished,
    markPublished,
    reschedule,
    recordTerminalFailure,
    service: new AnalysisDispatcherService(
      repository,
      queue,
      {
        dispatcherId: "dispatcher-test",
        intervalMs: 60_000,
        maxBatchSize: 10,
      },
      { recordTerminalFailure } as never,
    ),
  };
}

describe("AnalysisDispatcherService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("automatically retries a durable pending dispatch without another HTTP start", async () => {
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { enqueue, markPublished, reschedule, service } = setup([
      dispatchRecord(),
      null,
      dispatchRecord({ attemptCount: 2 }),
      null,
    ]);
    enqueue.mockRejectedValueOnce(new Error("private redis failure"));

    await expect(service.dispatchPending("background_retry")).resolves.toBe(0);
    await expect(service.dispatchPending("background_retry")).resolves.toBe(1);

    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenNthCalledWith(1, { jobId, projectId });
    expect(enqueue).toHaveBeenNthCalledWith(2, { jobId, projectId });
    expect(reschedule).toHaveBeenCalledWith(dispatchId, leaseToken, "queue_publish", 1);
    expect(markPublished).toHaveBeenCalledWith(dispatchId, leaseToken, jobId);
  });

  it("replays the deterministic BullMQ job ID after queue acceptance but marker failure", async () => {
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { enqueue, markPublished, service } = setup([
      dispatchRecord(),
      null,
      dispatchRecord({ attemptCount: 2 }),
      null,
    ]);
    markPublished.mockRejectedValueOnce(new Error("private database failure"));

    await expect(service.dispatchPending("background_retry")).resolves.toBe(0);
    await expect(service.dispatchPending("background_retry")).resolves.toBe(1);

    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue.mock.calls[0]?.[0]).toEqual(enqueue.mock.calls[1]?.[0]);
    expect(enqueue.mock.calls[0]?.[0]).toEqual({ jobId, projectId });
  });

  it("allows only one concurrent dispatcher to publish one claimed record", async () => {
    const shared = setup([dispatchRecord(), null, null]);
    const second = new AnalysisDispatcherService(
      {
        claim: shared.claim,
        isPublished: shared.isPublished,
        markPublished: shared.markPublished,
        reschedule: shared.reschedule,
      },
      { enqueue: shared.enqueue, inspect: shared.inspect },
      {
        dispatcherId: "dispatcher-second",
        intervalMs: 60_000,
        maxBatchSize: 10,
      },
      { recordTerminalFailure: shared.recordTerminalFailure } as never,
    );

    await Promise.all([
      shared.service.dispatchPending("background_retry"),
      second.dispatchPending("background_retry"),
    ]);

    expect(shared.enqueue).toHaveBeenCalledOnce();
    expect(shared.markPublished).toHaveBeenCalledOnce();
  });

  it("does not blindly republish a database-active job", async () => {
    const { enqueue, inspect, markPublished, service } = setup([
      dispatchRecord({ jobStatus: "active" }),
      null,
    ]);
    inspect.mockResolvedValue("active");

    await expect(service.dispatchPending("background_retry")).resolves.toBe(1);

    expect(inspect).toHaveBeenCalledWith({ jobId, projectId });
    expect(enqueue).not.toHaveBeenCalled();
    expect(markPublished).toHaveBeenCalledWith(dispatchId, leaseToken, jobId);
  });

  it("restores a missing published queued job with the deterministic database UUID", async () => {
    const { enqueue, inspect, markPublished, reschedule, service } = setup([
      dispatchRecord({ dispatchStatus: "published" }),
      null,
      dispatchRecord({
        attemptCount: 2,
        dispatchStatus: "published",
        lastFailureStage: "queue_handoff_wait",
      }),
      null,
    ]);

    await expect(service.dispatchPending("first-observation")).resolves.toBe(0);

    expect(inspect).toHaveBeenCalledWith({ jobId, projectId });
    expect(reschedule).toHaveBeenCalledWith(dispatchId, leaseToken, "queue_handoff_wait", 15);
    expect(enqueue).not.toHaveBeenCalled();

    await expect(service.dispatchPending("second-observation")).resolves.toBe(1);

    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledWith({ jobId, projectId });
    expect(markPublished).toHaveBeenCalledWith(dispatchId, leaseToken, jobId);
  });

  it("does not duplicate an existing matching published queued job", async () => {
    const { enqueue, inspect, service } = setup([
      dispatchRecord({ dispatchStatus: "published" }),
      null,
    ]);
    inspect.mockResolvedValue("waiting");

    await expect(service.dispatchPending("reconcile")).resolves.toBe(1);

    expect(enqueue).not.toHaveBeenCalled();
  });

  it("waits for a missing active job while its durable execution lease remains valid", async () => {
    const { enqueue, inspect, recordTerminalFailure, service } = setup([
      dispatchRecord({
        dispatchStatus: "published",
        executionLeaseExpiresAt: new Date(Date.now() + 60_000),
        jobStatus: "active",
      }),
      null,
    ]);

    await expect(service.dispatchPending("reconcile")).resolves.toBe(1);

    expect(inspect).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(recordTerminalFailure).not.toHaveBeenCalled();
  });

  it("lets a valid active lease override a retained failed BullMQ state", async () => {
    const { enqueue, inspect, recordTerminalFailure, service } = setup([
      dispatchRecord({
        dispatchStatus: "published",
        executionLeaseExpiresAt: new Date(Date.now() + 60_000),
        jobStatus: "active",
      }),
      null,
    ]);
    inspect.mockResolvedValue("failed");

    await expect(service.dispatchPending("reconcile")).resolves.toBe(1);

    expect(enqueue).not.toHaveBeenCalled();
    expect(recordTerminalFailure).not.toHaveBeenCalled();
  });

  it("persists one terminal intent for a missing active job with an expired lease", async () => {
    const { enqueue, recordTerminalFailure, service } = setup([
      dispatchRecord({
        dispatchStatus: "published",
        executionLeaseExpiresAt: new Date(Date.now() - 1),
        jobStatus: "active",
      }),
      null,
    ]);

    await expect(service.dispatchPending("reconcile")).resolves.toBe(1);

    expect(enqueue).not.toHaveBeenCalled();
    expect(recordTerminalFailure).toHaveBeenCalledWith(
      jobId,
      "WORKER_EXECUTION_LEASE_EXPIRED",
      "reconcile:reconcile",
    );
  });
});
