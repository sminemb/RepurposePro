import type { Redis } from "ioredis";
import { describe, expect, it, vi } from "vitest";

import {
  BullMqAnalysisQueueGateway,
  type AnalysisQueueClient,
  type AnalysisQueueClientFactory,
} from "./analysis-queue.gateway";

const jobId = "00000000-0000-4000-8000-000000000701";
const projectId = "00000000-0000-4000-8000-000000000702";

describe("BullMqAnalysisQueueGateway", () => {
  it("publishes the IDs-only contract with the durable job ID and configured prefix", async () => {
    const add = vi.fn().mockResolvedValue({ id: jobId });
    const close = vi.fn().mockResolvedValue(undefined);
    const getJob = vi.fn().mockResolvedValue(undefined);
    const createQueue = vi.fn<AnalysisQueueClientFactory>().mockReturnValue({ add, close, getJob });
    const connection = {} as Redis;
    const gateway = new BullMqAnalysisQueueGateway(connection, "isolated-prefix", createQueue);

    await expect(gateway.enqueue({ jobId, projectId })).resolves.toBe(jobId);
    expect(createQueue).toHaveBeenCalledWith("video-analysis-queue", {
      connection,
      prefix: "isolated-prefix",
    });
    expect(add).toHaveBeenCalledWith(
      "analyze_video",
      { jobId, projectId },
      { jobId, removeOnComplete: false, removeOnFail: false },
    );
  });

  it("returns an existing active job without blindly adding it again", async () => {
    const add = vi.fn();
    const getState = vi.fn().mockResolvedValue("active");
    const getJob = vi.fn().mockResolvedValue({
      data: { jobId, projectId },
      getState,
      id: jobId,
      name: "analyze_video",
    });
    const gateway = new BullMqAnalysisQueueGateway(
      {} as Redis,
      "test-prefix",
      vi.fn().mockReturnValue({
        add,
        close: vi.fn().mockResolvedValue(undefined),
        getJob,
      }),
    );

    await expect(gateway.enqueue({ jobId, projectId })).resolves.toBe(jobId);
    await expect(gateway.inspect({ jobId, projectId })).resolves.toBe("active");

    expect(add).not.toHaveBeenCalled();
    expect(getState).toHaveBeenCalledTimes(2);
  });

  it.each([{ id: undefined }, { id: "different-job-id" }])(
    "rejects an invalid returned queue ID: $id",
    async (queueJob) => {
      const client: AnalysisQueueClient = {
        add: vi.fn().mockResolvedValue(queueJob),
        close: vi.fn().mockResolvedValue(undefined),
        getJob: vi.fn().mockResolvedValue(undefined),
      };
      const gateway = new BullMqAnalysisQueueGateway(
        {} as Redis,
        "test-prefix",
        vi.fn().mockReturnValue(client),
      );

      await expect(gateway.enqueue({ jobId, projectId })).rejects.toThrow(
        "BullMQ returned an unexpected job ID.",
      );
    },
  );

  it("closes the queue during application shutdown", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const client: AnalysisQueueClient = {
      add: vi.fn(),
      close,
      getJob: vi.fn().mockResolvedValue(undefined),
    };
    const gateway = new BullMqAnalysisQueueGateway(
      {} as Redis,
      "test-prefix",
      vi.fn().mockReturnValue(client),
    );

    await gateway.onModuleDestroy();

    expect(close).toHaveBeenCalledOnce();
  });
});
