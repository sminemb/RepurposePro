import { randomUUID } from "node:crypto";

import {
  ANALYZE_VIDEO_JOB_NAME,
  type VideoAnalysisJobPayload,
  VIDEO_ANALYSIS_QUEUE_NAME,
} from "@repurposepro/shared";
import { type ConnectionOptions, Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BullMqAnalysisQueueGateway } from "./analysis-queue.gateway";

const describeIntegration = process.env.RUN_REDIS_INTEGRATION === "true" ? describe : describe.skip;

describeIntegration("BullMQ analysis queue Redis integration", () => {
  const prefix = `repurposepro-test-${randomUUID()}`;
  const payload: VideoAnalysisJobPayload = {
    jobId: "00000000-0000-4000-8000-000000000721",
    projectId: "00000000-0000-4000-8000-000000000722",
  };
  let connection: Redis;
  let gateway: BullMqAnalysisQueueGateway;
  let inspectionQueue: Queue<VideoAnalysisJobPayload>;

  beforeAll(async () => {
    connection = new Redis(process.env.TEST_REDIS_URL ?? "redis://localhost:6379", {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    connection.on("error", () => undefined);
    await connection.connect();
    gateway = new BullMqAnalysisQueueGateway(connection, prefix);
    inspectionQueue = new Queue<VideoAnalysisJobPayload>(VIDEO_ANALYSIS_QUEUE_NAME, {
      connection: connection as unknown as ConnectionOptions,
      prefix,
    });
  });

  afterAll(async () => {
    await inspectionQueue.obliterate({ force: true });
    await gateway.onModuleDestroy();
    await inspectionQueue.close();
    await connection.quit();
  });

  it("stores one waiting job when the same durable publication is requested twice", async () => {
    await expect(gateway.enqueue(payload)).resolves.toBe(payload.jobId);
    await expect(gateway.enqueue(payload)).resolves.toBe(payload.jobId);

    const job = await inspectionQueue.getJob(payload.jobId);

    expect(job).toMatchObject({
      data: payload,
      id: payload.jobId,
      name: ANALYZE_VIDEO_JOB_NAME,
    });
    await expect(inspectionQueue.getJobCounts("waiting")).resolves.toMatchObject({ waiting: 1 });
  });

  it("executes once when publication replays after the retained job already completed", async () => {
    const replayPayload: VideoAnalysisJobPayload = {
      jobId: "00000000-0000-4000-8000-000000000723",
      projectId: "00000000-0000-4000-8000-000000000724",
    };
    const workerConnection = new Redis(process.env.TEST_REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
    workerConnection.on("error", () => undefined);
    let executionCount = 0;
    const worker = new Worker<VideoAnalysisJobPayload>(
      VIDEO_ANALYSIS_QUEUE_NAME,
      async (job) => {
        if (job.id === replayPayload.jobId) {
          executionCount += 1;
        }
      },
      {
        connection: workerConnection as unknown as ConnectionOptions,
        prefix,
      },
    );

    try {
      await worker.waitUntilReady();
      await gateway.enqueue(replayPayload);
      await waitForJobState(replayPayload.jobId, "completed");

      await gateway.enqueue(replayPayload);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(executionCount).toBe(1);
      await expect(inspectionQueue.getJob(replayPayload.jobId)).resolves.toBeDefined();
      await expect(gateway.inspect(replayPayload)).resolves.toBe("completed");
    } finally {
      await worker.close();
      await workerConnection.quit();
    }
  });

  async function waitForJobState(jobId: string, expectedState: string): Promise<void> {
    const deadline = Date.now() + 3_000;

    while (Date.now() < deadline) {
      const job = await inspectionQueue.getJob(jobId);
      if ((await job?.getState()) === expectedState) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    throw new Error(`BullMQ job ${jobId} did not reach ${expectedState}.`);
  }
});
