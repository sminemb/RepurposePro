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

import { ProcessingFailureIntentService } from "./processing-failure-intent.service";
import { ANALYSIS_RETRIES_EXHAUSTED } from "./processing-failure.service";

export const ANALYSIS_QUEUE_EVENTS = Symbol("ANALYSIS_QUEUE_EVENTS");

export interface AnalysisQueueEventsClient {
  close(): Promise<void>;
  on(event: "error", listener: (error: Error) => void): AnalysisQueueEventsClient;
  on(
    event: "retries-exhausted",
    listener: (args: { readonly jobId: string }, eventId: string) => Promise<void> | void,
  ): AnalysisQueueEventsClient;
  waitUntilReady(): Promise<unknown>;
}

export function createAnalysisQueueEventsClient(
  connection: Redis,
  prefix: string,
  closeConnection: (connection: Redis) => Promise<void> = async () => undefined,
): AnalysisQueueEventsClient {
  const queueEvents = new QueueEvents(VIDEO_ANALYSIS_QUEUE_NAME, {
    connection: connection as unknown as ConnectionOptions,
    lastEventId: "0-0",
    prefix,
  });
  const client: AnalysisQueueEventsClient = {
    close: async () => {
      try {
        await queueEvents.close();
      } finally {
        await closeConnection(connection);
      }
    },
    on: (event, listener) => {
      queueEvents.on(event, listener);
      return client;
    },
    waitUntilReady: () => queueEvents.waitUntilReady(),
  };
  return client;
}

@Injectable()
export class AnalysisQueueFailureListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalysisQueueFailureListener.name);

  public constructor(
    private readonly processingFailureIntentService: ProcessingFailureIntentService,
    @Inject(ANALYSIS_QUEUE_EVENTS)
    private readonly queueEvents: AnalysisQueueEventsClient,
  ) {}

  public async onModuleInit(): Promise<void> {
    this.queueEvents.on("error", () => {
      this.logger.error({ event: "analysis_queue_events_failed" });
    });
    this.queueEvents.on("retries-exhausted", async ({ jobId }, eventId) => {
      await this.persistTerminalFailure(jobId, eventId);
    });
    await this.queueEvents.waitUntilReady();
  }

  public async onModuleDestroy(): Promise<void> {
    await this.queueEvents.close();
  }

  private async persistTerminalFailure(jobId: string, eventId: string): Promise<void> {
    const requestId = `queue-event:${eventId}`;

    try {
      await this.processingFailureIntentService.recordTerminalFailure(
        jobId,
        ANALYSIS_RETRIES_EXHAUSTED,
        requestId,
      );
    } catch {
      this.logger.error({
        event: "processing_failure_intent_persist_failed",
        failureCode: ANALYSIS_RETRIES_EXHAUSTED,
        jobId,
        requestId,
      });
    }
  }
}
