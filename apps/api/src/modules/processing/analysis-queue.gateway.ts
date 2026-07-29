import type { OnModuleDestroy } from "@nestjs/common";
import {
  ANALYZE_VIDEO_JOB_NAME,
  type VideoAnalysisJobPayload,
  VIDEO_ANALYSIS_QUEUE_NAME,
} from "@repurposepro/shared";
import { type ConnectionOptions, Queue } from "bullmq";
import type Redis from "ioredis";

export const ANALYSIS_QUEUE_GATEWAY = Symbol("ANALYSIS_QUEUE_GATEWAY");

export type AnalysisQueueJobState =
  | "active"
  | "completed"
  | "delayed"
  | "failed"
  | "paused"
  | "prioritized"
  | "waiting"
  | "waiting-children";

export interface AnalysisQueueGateway {
  enqueue(payload: VideoAnalysisJobPayload): Promise<string>;
  inspect(payload: VideoAnalysisJobPayload): Promise<AnalysisQueueJobState | null>;
}

export interface AnalysisQueueJob {
  readonly data: VideoAnalysisJobPayload;
  readonly id?: string;
  readonly name: string;
  getState(): Promise<string>;
}

export interface AnalysisQueueClient {
  add(
    name: typeof ANALYZE_VIDEO_JOB_NAME,
    payload: VideoAnalysisJobPayload,
    options: {
      readonly jobId: string;
      readonly removeOnComplete: false;
      readonly removeOnFail: false;
    },
  ): Promise<{ readonly id?: string }>;
  close(): Promise<void>;
  getJob(jobId: string): Promise<AnalysisQueueJob | undefined>;
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
    getJob: (jobId) => queue.getJob(jobId),
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
    if ((await this.inspect(payload)) !== null) {
      return payload.jobId;
    }

    const job = await this.queue.add(ANALYZE_VIDEO_JOB_NAME, payload, {
      jobId: payload.jobId,
      removeOnComplete: false,
      removeOnFail: false,
    });

    if (job.id !== payload.jobId) {
      throw new Error("BullMQ returned an unexpected job ID.");
    }

    return job.id;
  }

  public async inspect(payload: VideoAnalysisJobPayload): Promise<AnalysisQueueJobState | null> {
    const job = await this.queue.getJob(payload.jobId);

    if (!job) {
      return null;
    }

    if (
      job.id !== payload.jobId ||
      job.name !== ANALYZE_VIDEO_JOB_NAME ||
      job.data.jobId !== payload.jobId ||
      job.data.projectId !== payload.projectId
    ) {
      throw new Error("BullMQ job identity does not match the durable dispatch.");
    }

    const state = await job.getState();
    if (!isAnalysisQueueJobState(state)) {
      throw new Error("BullMQ returned an unsupported job state.");
    }

    return state;
  }

  public async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}

function isAnalysisQueueJobState(state: string): state is AnalysisQueueJobState {
  return [
    "active",
    "completed",
    "delayed",
    "failed",
    "paused",
    "prioritized",
    "waiting",
    "waiting-children",
  ].includes(state);
}
