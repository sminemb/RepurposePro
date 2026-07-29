import { randomUUID } from "node:crypto";

import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import {
  ANALYSIS_DISPATCH_REPOSITORY,
  type AnalysisDispatchRecord,
  type AnalysisDispatchRepositoryContract,
  type DispatchFailureStage,
} from "./analysis-dispatch.repository";
import { ANALYSIS_QUEUE_GATEWAY, type AnalysisQueueGateway } from "./analysis-queue.gateway";
import { ProcessingFailureIntentService } from "./processing-failure-intent.service";
import {
  ANALYSIS_RETRIES_EXHAUSTED,
  WORKER_EXECUTION_LEASE_EXPIRED,
} from "./processing-failure.service";

export const ANALYSIS_DISPATCHER_OPTIONS = Symbol("ANALYSIS_DISPATCHER_OPTIONS");

export interface AnalysisDispatcherOptions {
  readonly dispatcherId: string;
  readonly intervalMs: number;
  readonly maxBatchSize: number;
}

export function createAnalysisDispatcherOptions(): AnalysisDispatcherOptions {
  return {
    dispatcherId: `api-${randomUUID()}`,
    intervalMs: 5_000,
    maxBatchSize: 10,
  };
}

@Injectable()
export class AnalysisDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalysisDispatcherService.name);
  private readonly options: AnalysisDispatcherOptions;
  private retryTimer: NodeJS.Timeout | undefined;

  public constructor(
    @Inject(ANALYSIS_DISPATCH_REPOSITORY)
    private readonly repository: AnalysisDispatchRepositoryContract,
    @Inject(ANALYSIS_QUEUE_GATEWAY)
    private readonly queue: AnalysisQueueGateway,
    @Optional()
    @Inject(ANALYSIS_DISPATCHER_OPTIONS)
    options?: AnalysisDispatcherOptions,
    @Optional()
    private readonly processingFailureIntentService?: ProcessingFailureIntentService,
  ) {
    this.options = options ?? createAnalysisDispatcherOptions();
  }

  public onModuleInit(): void {
    this.retryTimer = setInterval(() => {
      void this.dispatchPending("background_retry").catch(() => {
        this.logger.error({
          event: "analysis_dispatch_cycle_failed",
          requestId: "background_retry",
        });
      });
    }, this.options.intervalMs);
    this.retryTimer.unref();

    void this.dispatchPending("background_startup").catch(() => {
      this.logger.error({
        event: "analysis_dispatch_cycle_failed",
        requestId: "background_startup",
      });
    });
  }

  public onModuleDestroy(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

  public async dispatchJob(jobId: string, requestId: string): Promise<boolean> {
    const dispatch = await this.repository.claim(jobId, this.options.dispatcherId);

    if (!dispatch) {
      return this.repository.isPublished(jobId);
    }

    return this.publishClaim(dispatch, requestId);
  }

  public async dispatchPending(requestId: string): Promise<number> {
    let publishedCount = 0;

    for (let index = 0; index < this.options.maxBatchSize; index += 1) {
      const dispatch = await this.repository.claim(null, this.options.dispatcherId);
      if (!dispatch) {
        break;
      }

      if (await this.publishClaim(dispatch, requestId)) {
        publishedCount += 1;
      }
    }

    return publishedCount;
  }

  private async publishClaim(
    dispatch: AnalysisDispatchRecord,
    requestId: string,
  ): Promise<boolean> {
    const payload = { jobId: dispatch.jobId, projectId: dispatch.projectId };
    let bullmqJobId: string;

    try {
      if (dispatch.jobStatus === "active") {
        const state = await this.queue.inspect(payload);
        if (state === null) {
          if (
            dispatch.executionLeaseExpiresAt !== null &&
            dispatch.executionLeaseExpiresAt.getTime() > Date.now()
          ) {
            bullmqJobId = dispatch.jobId;
          } else {
            await this.recordTerminalFailure(dispatch, WORKER_EXECUTION_LEASE_EXPIRED, requestId);
            bullmqJobId = dispatch.jobId;
          }
        } else {
          if (state === "failed") {
            await this.recordTerminalFailure(dispatch, ANALYSIS_RETRIES_EXHAUSTED, requestId);
          }
          bullmqJobId = dispatch.jobId;
        }
      } else if (dispatch.dispatchStatus === "published") {
        const state = await this.queue.inspect(payload);
        if (state === null) {
          bullmqJobId = await this.queue.enqueue(payload);
        } else {
          if (state === "failed") {
            await this.recordTerminalFailure(dispatch, ANALYSIS_RETRIES_EXHAUSTED, requestId);
          }
          bullmqJobId = dispatch.jobId;
        }
      } else {
        bullmqJobId = await this.queue.enqueue(payload);
      }
    } catch {
      await this.reschedule(dispatch, requestId, "queue_publish");
      return false;
    }

    try {
      await this.repository.markPublished(dispatch.dispatchId, dispatch.leaseToken, bullmqJobId);
    } catch {
      await this.reschedule(dispatch, requestId, "queue_reference_persist");
      return false;
    }

    this.logger.log({
      dispatchAttempt: dispatch.attemptCount,
      event: "analysis_dispatch_published",
      jobId: dispatch.jobId,
      projectId: dispatch.projectId,
      requestId,
    });
    return true;
  }

  private async recordTerminalFailure(
    dispatch: AnalysisDispatchRecord,
    failureCode: string,
    requestId: string,
  ): Promise<void> {
    if (!this.processingFailureIntentService) {
      throw new Error("Processing failure intent service is unavailable.");
    }

    await this.processingFailureIntentService.recordTerminalFailure(
      dispatch.jobId,
      failureCode,
      `reconcile:${requestId}`,
    );
  }

  private async reschedule(
    dispatch: AnalysisDispatchRecord,
    requestId: string,
    failureStage: DispatchFailureStage,
  ): Promise<void> {
    const delaySeconds = Math.min(2 ** Math.max(dispatch.attemptCount - 1, 0), 300);

    try {
      await this.repository.reschedule(
        dispatch.dispatchId,
        dispatch.leaseToken,
        failureStage,
        delaySeconds,
      );
    } catch {
      // Lease expiry is the durable fallback when the database is unavailable.
    }

    this.logger.error({
      dispatchAttempt: dispatch.attemptCount,
      event: "analysis_dispatch_failed",
      failureStage,
      jobId: dispatch.jobId,
      projectId: dispatch.projectId,
      requestId,
    });
  }
}
