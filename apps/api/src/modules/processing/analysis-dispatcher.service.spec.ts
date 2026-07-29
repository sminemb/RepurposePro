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
    jobId,
    jobStatus: "queued",
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

  return {
    claim,
    enqueue,
    inspect,
    isPublished,
    markPublished,
    reschedule,
    service: new AnalysisDispatcherService(repository, queue, {
      dispatcherId: "dispatcher-test",
      intervalMs: 60_000,
      maxBatchSize: 10,
    }),
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
});
