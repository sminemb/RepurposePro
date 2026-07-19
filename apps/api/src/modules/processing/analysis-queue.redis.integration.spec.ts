import { randomUUID } from "node:crypto";

import {
  ANALYZE_VIDEO_JOB_NAME,
  type VideoAnalysisJobPayload,
  VIDEO_ANALYSIS_QUEUE_NAME,
} from "@repurposepro/shared";
import { type ConnectionOptions, Queue } from "bullmq";
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
});
