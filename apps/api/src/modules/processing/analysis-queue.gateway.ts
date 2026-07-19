import type { OnModuleDestroy } from "@nestjs/common";
import {
  ANALYZE_VIDEO_JOB_NAME,
  type VideoAnalysisJobPayload,
  VIDEO_ANALYSIS_QUEUE_NAME,
} from "@repurposepro/shared";
import { type ConnectionOptions, Queue } from "bullmq";
import type Redis from "ioredis";

export const ANALYSIS_QUEUE_GATEWAY = Symbol("ANALYSIS_QUEUE_GATEWAY");

export interface AnalysisQueueGateway {
  enqueue(payload: VideoAnalysisJobPayload): Promise<string>;
}

export interface AnalysisQueueClient {
  add(
    name: typeof ANALYZE_VIDEO_JOB_NAME,
    payload: VideoAnalysisJobPayload,
    options: { readonly jobId: string },
  ): Promise<{ readonly id?: string }>;
  close(): Promise<void>;
}

interface AnalysisQueueOptions {
  readonly connection: Redis;
  readonly prefix: string;
}

export type AnalysisQueueClientFactory = (
  name: typeof VIDEO_ANALYSIS_QUEUE_NAME,
  options: AnalysisQueueOptions,
) => AnalysisQueueClient;

const createAnalysisQueueClient: AnalysisQueueClientFactory = (name, options) => {
  const queue = new Queue<VideoAnalysisJobPayload>(name, {
    // BullMQ pins a compatible ioredis minor whose private types are nominally distinct.
    connection: options.connection as unknown as ConnectionOptions,
    prefix: options.prefix,
  });

  return {
    add: (jobName, payload, jobOptions) => queue.add(jobName, payload, jobOptions),
    close: () => queue.close(),
  };
};

export class BullMqAnalysisQueueGateway implements AnalysisQueueGateway, OnModuleDestroy {
  private readonly queue: AnalysisQueueClient;

  public constructor(
    connection: Redis,
    prefix: string,
    createQueue: AnalysisQueueClientFactory = createAnalysisQueueClient,
  ) {
    this.queue = createQueue(VIDEO_ANALYSIS_QUEUE_NAME, { connection, prefix });
  }

  public async enqueue(payload: VideoAnalysisJobPayload): Promise<string> {
    const job = await this.queue.add(ANALYZE_VIDEO_JOB_NAME, payload, { jobId: payload.jobId });

    if (job.id !== payload.jobId) {
      throw new Error("BullMQ returned an unexpected job ID.");
    }

    return job.id;
  }

  public async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
