import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { VIDEO_ANALYSIS_QUEUE_NAME } from "@repurposepro/shared";
import { type ConnectionOptions, QueueEvents } from "bullmq";
import type Redis from "ioredis";

import { ANALYSIS_RETRIES_EXHAUSTED, ProcessingFailureService } from "./processing-failure.service";

export const ANALYSIS_QUEUE_EVENTS = Symbol("ANALYSIS_QUEUE_EVENTS");

export interface AnalysisQueueEventsClient {
  close(): Promise<void>;
  on(event: "error", listener: (error: Error) => void): AnalysisQueueEventsClient;
  on(
    event: "retries-exhausted",
    listener: (args: { readonly jobId: string }, eventId: string) => void,
  ): AnalysisQueueEventsClient;
  waitUntilReady(): Promise<unknown>;
}

export function createAnalysisQueueEventsClient(
  connection: Redis,
  prefix: string,
): AnalysisQueueEventsClient {
  const blockingConnection = connection.duplicate({ maxRetriesPerRequest: null });
  return new QueueEvents(VIDEO_ANALYSIS_QUEUE_NAME, {
    connection: blockingConnection as unknown as ConnectionOptions,
    lastEventId: "0-0",
    prefix,
  });
}

@Injectable()
export class AnalysisQueueFailureListener implements OnModuleInit, OnModuleDestroy {
  private readonly finalizingJobs = new Set<string>();
  private readonly logger = new Logger(AnalysisQueueFailureListener.name);
  private readonly retryTimers = new Map<string, NodeJS.Timeout>();

  public constructor(
    private readonly processingFailureService: ProcessingFailureService,
    @Inject(ANALYSIS_QUEUE_EVENTS)
    private readonly queueEvents: AnalysisQueueEventsClient,
  ) {}

  public async onModuleInit(): Promise<void> {
    this.queueEvents.on("error", () => {
      this.logger.error({ event: "analysis_queue_events_failed" });
    });
    this.queueEvents.on("retries-exhausted", ({ jobId }, eventId) => {
      this.finalizeFailure(jobId, eventId, 1);
    });
    await this.queueEvents.waitUntilReady();
  }

  public async onModuleDestroy(): Promise<void> {
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
    await this.queueEvents.close();
  }

  private finalizeFailure(jobId: string, eventId: string, attempt: number): void {
    if (this.finalizingJobs.has(jobId) || this.retryTimers.has(jobId)) {
      return;
    }

    this.finalizingJobs.add(jobId);
    void this.processingFailureService
      .handleTerminalFailure(jobId, ANALYSIS_RETRIES_EXHAUSTED, `queue-event:${eventId}`)
      .then(() => {
        this.finalizingJobs.delete(jobId);
      })
      .catch(() => {
        this.finalizingJobs.delete(jobId);
        const delayMs = Math.min(2 ** Math.max(attempt - 1, 0) * 1_000, 300_000);
        const timer = setTimeout(() => {
          this.retryTimers.delete(jobId);
          this.finalizeFailure(jobId, eventId, attempt + 1);
        }, delayMs);
        timer.unref();
        this.retryTimers.set(jobId, timer);
        this.logger.error({
          attempt,
          event: "processing_failure_retry_scheduled",
          jobId,
          requestId: `queue-event:${eventId}`,
        });
      });
  }
}
