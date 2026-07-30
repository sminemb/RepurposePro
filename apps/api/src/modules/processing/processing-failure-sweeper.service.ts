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
  PROCESSING_FAILURE_INTENT_REPOSITORY,
  type ProcessingFailureIntentRecord,
  type ProcessingFailureIntentRepositoryContract,
} from "./processing-failure-intent.repository";
import { ProcessingFailureService } from "./processing-failure.service";

export const PROCESSING_FAILURE_SWEEPER_OPTIONS = Symbol("PROCESSING_FAILURE_SWEEPER_OPTIONS");

export interface ProcessingFailureSweeperOptions {
  readonly intervalMs: number;
  readonly maxBatchSize: number;
  readonly sweeperId: string;
}

export function createProcessingFailureSweeperOptions(): ProcessingFailureSweeperOptions {
  return {
    intervalMs: 5_000,
    maxBatchSize: 10,
    sweeperId: `api-${randomUUID()}`,
  };
}

@Injectable()
export class ProcessingFailureSweeperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProcessingFailureSweeperService.name);
  private readonly options: ProcessingFailureSweeperOptions;
  private sweepTimer: NodeJS.Timeout | undefined;

  public constructor(
    @Inject(PROCESSING_FAILURE_INTENT_REPOSITORY)
    private readonly repository: ProcessingFailureIntentRepositoryContract,
    private readonly processingFailureService: ProcessingFailureService,
    @Optional()
    @Inject(PROCESSING_FAILURE_SWEEPER_OPTIONS)
    options?: ProcessingFailureSweeperOptions,
  ) {
    this.options = options ?? createProcessingFailureSweeperOptions();
  }

  public onModuleInit(): void {
    this.sweepTimer = setInterval(() => {
      void this.sweepPending("background_retry").catch(() => {
        this.logger.error({
          event: "processing_failure_sweep_cycle_failed",
          requestId: "background_retry",
        });
      });
    }, this.options.intervalMs);
    this.sweepTimer.unref();

    void this.sweepPending("background_startup").catch(() => {
      this.logger.error({
        event: "processing_failure_sweep_cycle_failed",
        requestId: "background_startup",
      });
    });
  }

  public onModuleDestroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }
  }

  public async sweepJob(jobId: string, requestId: string): Promise<boolean> {
    const intent = await this.repository.claim(jobId, this.options.sweeperId);
    return intent ? this.finalizeClaim(intent, requestId) : false;
  }

  public async sweepPending(requestId: string): Promise<number> {
    let finalizedCount = 0;

    for (let index = 0; index < this.options.maxBatchSize; index += 1) {
      const intent = await this.repository.claim(null, this.options.sweeperId);
      if (!intent) {
        break;
      }

      if (await this.finalizeClaim(intent, requestId)) {
        finalizedCount += 1;
      }
    }

    return finalizedCount;
  }

  private async finalizeClaim(
    intent: ProcessingFailureIntentRecord,
    requestId: string,
  ): Promise<boolean> {
    let outcome: string;

    try {
      const result = await this.processingFailureService.handleTerminalFailure(
        intent.jobId,
        intent.failureCode,
        requestId,
      );
      outcome = result.outcome;
    } catch {
      await this.reschedule(intent, requestId);
      return false;
    }

    if (outcome === "lease_active") {
      await this.reschedule(intent, requestId);
      return false;
    }

    try {
      await this.repository.markFinalized(intent.intentId, intent.leaseToken);
    } catch {
      await this.reschedule(intent, requestId);
      return false;
    }

    this.logger.log({
      event: "processing_failure_intent_finalized",
      failureCode: intent.failureCode,
      intentId: intent.intentId,
      jobId: intent.jobId,
      requestId,
    });
    return true;
  }

  private async reschedule(
    intent: ProcessingFailureIntentRecord,
    requestId: string,
  ): Promise<void> {
    const delaySeconds = Math.min(2 ** Math.max(intent.attemptCount - 1, 0), 300);

    try {
      await this.repository.reschedule(intent.intentId, intent.leaseToken, delaySeconds);
    } catch {
      // Lease expiry keeps the durable intent claimable if this marker cannot be saved.
    }

    this.logger.error({
      attempt: intent.attemptCount,
      event: "processing_failure_intent_retry_scheduled",
      failureCode: intent.failureCode,
      intentId: intent.intentId,
      jobId: intent.jobId,
      requestId,
    });
  }
}
