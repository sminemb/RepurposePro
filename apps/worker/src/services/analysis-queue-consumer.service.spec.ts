import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";

import type { AnalysisJobProcessor } from "../processors/analysis-job.processor";
import {
  AnalysisQueueConsumerService,
  type AnalysisQueueRedisConnection,
  type AnalysisQueueWorker,
} from "./analysis-queue-consumer.service";

describe("AnalysisQueueConsumerService", () => {
  it("uses a dedicated blocking connection, prefix, concurrency one, and retained jobs", async () => {
    const process = vi.fn().mockResolvedValue({ outcome: "preview_ready" });
    const redisOn = vi.fn();
    const connection: AnalysisQueueRedisConnection = {
      disconnect: vi.fn(),
      on: redisOn,
      quit: vi.fn().mockResolvedValue("OK"),
      status: "ready",
    };
    const createRedis = vi.fn().mockReturnValue(connection);
    const workerOn = vi.fn();
    const waitUntilReady = vi.fn().mockResolvedValue(undefined);
    const worker: AnalysisQueueWorker = {
      close: vi.fn().mockResolvedValue(undefined),
      on: workerOn,
      waitUntilReady,
    };
    const createWorker = vi.fn().mockReturnValue(worker);
    const service = new AnalysisQueueConsumerService(
      { process } as unknown as AnalysisJobProcessor,
      {
        createRedis,
        createWorker,
        prefix: "repurposepro-test",
        redisUrl: "redis://:secret@localhost:6379",
      },
    );

    await service.onModuleInit();

    expect(createRedis).toHaveBeenCalledWith("redis://:secret@localhost:6379");
    expect(createWorker).toHaveBeenCalledWith("video-analysis-queue", expect.any(Function), {
      concurrency: 1,
      connection,
      prefix: "repurposepro-test",
    });
    expect(redisOn).toHaveBeenCalledWith("error", expect.any(Function));
    expect(workerOn).toHaveBeenCalledWith("error", expect.any(Function));
    expect(waitUntilReady).toHaveBeenCalledOnce();

    const callback = createWorker.mock.calls[0]?.[1] as (job: Job) => Promise<unknown>;
    await callback({
      data: { jobId: "job", projectId: "project" },
      id: "job",
      name: "analyze_video",
    } as Job);
    expect(process).toHaveBeenCalledWith({
      data: { jobId: "job", projectId: "project" },
      id: "job",
      name: "analyze_video",
    });
  });

  it("closes the worker before its dedicated Redis connection", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const quit = vi.fn().mockResolvedValue("OK");
    const service = new AnalysisQueueConsumerService(
      { process: vi.fn() } as unknown as AnalysisJobProcessor,
      {
        createRedis: () => ({ disconnect: vi.fn(), on: vi.fn(), quit, status: "ready" }),
        createWorker: () => ({
          close,
          on: vi.fn(),
          waitUntilReady: vi.fn().mockResolvedValue(undefined),
        }),
        prefix: "repurposepro-test",
        redisUrl: "redis://:secret@localhost:6379",
      },
    );
    await service.onModuleInit();

    await service.onModuleDestroy();

    expect(close).toHaveBeenCalledOnce();
    expect(quit).toHaveBeenCalledOnce();
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(quit.mock.invocationCallOrder[0]!);
  });

  it.each([
    ["wait", 1, 0],
    ["end", 0, 0],
  ])(
    "uses the safe Redis shutdown path for a %s connection",
    async (status, expectedDisconnects, expectedQuits) => {
      const disconnect = vi.fn();
      const quit = vi.fn().mockResolvedValue("OK");
      const service = new AnalysisQueueConsumerService(
        { process: vi.fn() } as unknown as AnalysisJobProcessor,
        {
          createRedis: () => ({ disconnect, on: vi.fn(), quit, status }),
          createWorker: () => ({
            close: vi.fn().mockResolvedValue(undefined),
            on: vi.fn(),
            waitUntilReady: vi.fn().mockResolvedValue(undefined),
          }),
          prefix: "repurposepro-test",
          redisUrl: "redis://:secret@localhost:6379",
        },
      );
      await service.onModuleInit();

      await service.onModuleDestroy();

      expect(disconnect).toHaveBeenCalledTimes(expectedDisconnects);
      expect(quit).toHaveBeenCalledTimes(expectedQuits);
    },
  );

  it.each(["worker creation", "worker readiness"])(
    "closes and clears the Redis connection after %s fails",
    async (failurePoint) => {
      const failure = new Error(`${failurePoint} failed`);
      const quit = vi.fn().mockResolvedValue("OK");
      const close = vi.fn().mockResolvedValue(undefined);
      const service = new AnalysisQueueConsumerService(
        { process: vi.fn() } as unknown as AnalysisJobProcessor,
        {
          createRedis: () => ({ disconnect: vi.fn(), on: vi.fn(), quit, status: "ready" }),
          createWorker: () => {
            if (failurePoint === "worker creation") throw failure;
            return {
              close,
              on: vi.fn(),
              waitUntilReady: vi.fn().mockRejectedValue(failure),
            };
          },
          prefix: "repurposepro-test",
          redisUrl: "redis://:secret@localhost:6379",
        },
      );

      await expect(service.onModuleInit()).rejects.toBe(failure);
      expect(quit).toHaveBeenCalledOnce();
      if (failurePoint === "worker readiness") expect(close).toHaveBeenCalledOnce();

      await service.onModuleDestroy();
      expect(quit).toHaveBeenCalledOnce();
    },
  );
});
