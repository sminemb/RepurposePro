import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { VIDEO_ANALYSIS_QUEUE_NAME } from "@repurposepro/shared";
import { Worker, type Job, type WorkerOptions } from "bullmq";
import Redis from "ioredis";

import { AnalysisJobProcessor } from "../processors/analysis-job.processor";

export interface AnalysisQueueRedisConnection {
  disconnect(): void;
  on(event: "error", listener: (error: Error) => void): unknown;
  quit(): Promise<unknown>;
  readonly status: string;
}

export interface AnalysisQueueWorker {
  close(): Promise<void>;
  on(event: "error", listener: (error: Error) => void): unknown;
  waitUntilReady(): Promise<unknown>;
}

export type AnalysisQueueRedisFactory = (url: string) => AnalysisQueueRedisConnection;
export type AnalysisQueueWorkerFactory = (
  queueName: string,
  processor: (job: Job) => Promise<unknown>,
  options: { readonly concurrency: 1; readonly connection: unknown; readonly prefix: string },
) => AnalysisQueueWorker;

export interface AnalysisQueueConsumerOptions {
  readonly createRedis?: AnalysisQueueRedisFactory;
  readonly createWorker?: AnalysisQueueWorkerFactory;
  readonly prefix: string;
  readonly redisUrl: string;
}

const defaultRedisFactory: AnalysisQueueRedisFactory = (url) =>
  new Redis(url, { maxRetriesPerRequest: null });
const defaultWorkerFactory: AnalysisQueueWorkerFactory = (queueName, processor, options) =>
  new Worker(queueName, processor, options as unknown as WorkerOptions);

@Injectable()
export class AnalysisQueueConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalysisQueueConsumerService.name);
  private connection: AnalysisQueueRedisConnection | undefined;
  private worker: AnalysisQueueWorker | undefined;

  public constructor(
    private readonly processor: AnalysisJobProcessor,
    private readonly options: AnalysisQueueConsumerOptions,
  ) {}

  public async onModuleInit(): Promise<void> {
    const connection = (this.connection = (this.options.createRedis ?? defaultRedisFactory)(
      this.options.redisUrl,
    ));
    try {
      connection.on("error", (error) => {
        this.logger.error({ event: "analysis_queue_redis_error", error: error.message });
      });
      const worker = (this.worker = (this.options.createWorker ?? defaultWorkerFactory)(
        VIDEO_ANALYSIS_QUEUE_NAME,
        (job) =>
          this.processor.process({
            data: job.data,
            id: job.id,
            name: job.name,
          }),
        { concurrency: 1, connection, prefix: this.options.prefix },
      ));
      worker.on("error", (error) => {
        this.logger.error({ event: "analysis_queue_worker_error", error: error.message });
      });
      await worker.waitUntilReady();
    } catch (error: unknown) {
      const worker = this.worker;
      this.worker = undefined;
      await worker?.close().catch((cleanupError: unknown) => {
        this.logger.error({ cleanupError, event: "analysis_queue_worker_cleanup_failed" });
      });
      if (this.connection === connection) this.connection = undefined;
      await this.closeConnection(connection).catch((cleanupError: unknown) => {
        this.logger.error({ cleanupError, event: "analysis_queue_redis_cleanup_failed" });
      });
      throw error;
    }
  }

  public async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.worker = undefined;

    const connection = this.connection;
    this.connection = undefined;
    if (!connection) return;
    await this.closeConnection(connection);
  }

  private async closeConnection(connection: AnalysisQueueRedisConnection): Promise<void> {
    if (connection.status === "end") return;
    if (connection.status === "wait") {
      connection.disconnect();
      return;
    }
    await connection.quit();
  }
}
