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
    const createQueue = vi.fn<AnalysisQueueClientFactory>().mockReturnValue({ add, close });
    const connection = {} as Redis;
    const gateway = new BullMqAnalysisQueueGateway(connection, "isolated-prefix", createQueue);

    await expect(gateway.enqueue({ jobId, projectId })).resolves.toBe(jobId);
    expect(createQueue).toHaveBeenCalledWith("video-analysis-queue", {
      connection,
      prefix: "isolated-prefix",
    });
    expect(add).toHaveBeenCalledWith("analyze_video", { jobId, projectId }, { jobId });
  });

  it.each([{ id: undefined }, { id: "different-job-id" }])(
    "rejects an invalid returned queue ID: $id",
    async (queueJob) => {
      const client: AnalysisQueueClient = {
        add: vi.fn().mockResolvedValue(queueJob),
        close: vi.fn().mockResolvedValue(undefined),
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
    const client: AnalysisQueueClient = { add: vi.fn(), close };
    const gateway = new BullMqAnalysisQueueGateway(
      {} as Redis,
      "test-prefix",
      vi.fn().mockReturnValue(client),
    );

    await gateway.onModuleDestroy();

    expect(close).toHaveBeenCalledOnce();
  });
});
