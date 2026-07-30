import { Inject, Injectable, Optional } from "@nestjs/common";
import type { ProcessingJobStep } from "@repurposepro/shared";

import {
  PROCESSING_LIFECYCLE_REPOSITORY,
  type ProcessingLeaseAcquireOutcome,
  type ProcessingLifecycleRepositoryContract,
} from "./processing-lifecycle.repository";

export const PROCESSING_LIFECYCLE_OPTIONS = Symbol("PROCESSING_LIFECYCLE_OPTIONS");

export interface ProcessingLifecycleOptions {
  readonly heartbeatIntervalMs: number;
  readonly heartbeatRetryMs: number;
  readonly leaseLifetimeMs: number;
  readonly leaseSafetyMs: number;
}

export interface ProcessingLeaseContext {
  readonly leaseToken: string;
  readonly signal: AbortSignal;
  updateProgress(step: ProcessingJobStep, progress: number): Promise<void>;
}

export type ProcessingLifecycleResult<TValue> =
  | { readonly outcome: "completed"; readonly value: TValue }
  | {
      readonly outcome: "not_acquired";
      readonly reason: Exclude<ProcessingLeaseAcquireOutcome, "acquired">;
    };

export class ProcessingLeaseLostError extends Error {
  public constructor(message = "Processing execution lease was lost.") {
    super(message);
    this.name = "ProcessingLeaseLostError";
  }
}

export class RetryableProcessingError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RetryableProcessingError";
  }
}

const defaultOptions: ProcessingLifecycleOptions = {
  heartbeatIntervalMs: 15_000,
  heartbeatRetryMs: 1_000,
  leaseLifetimeMs: 60_000,
  leaseSafetyMs: 1_000,
};

@Injectable()
export class ProcessingLifecycleService {
  private readonly options: ProcessingLifecycleOptions;

  public constructor(
    @Inject(PROCESSING_LIFECYCLE_REPOSITORY)
    private readonly repository: ProcessingLifecycleRepositoryContract,
    @Optional()
    @Inject(PROCESSING_LIFECYCLE_OPTIONS)
    options?: ProcessingLifecycleOptions,
  ) {
    this.options = options ?? defaultOptions;
  }

  public async execute<TValue>(
    jobId: string,
    projectId: string,
    workerId: string,
    handler: (context: ProcessingLeaseContext) => Promise<TValue>,
  ): Promise<ProcessingLifecycleResult<TValue>> {
    const acquisition = await this.repository.acquire(jobId, projectId, workerId);

    if (
      acquisition.outcome !== "acquired" ||
      acquisition.leaseToken === null ||
      acquisition.expiresAt === null
    ) {
      return {
        outcome: "not_acquired",
        reason: acquisition.outcome === "acquired" ? "rejected" : acquisition.outcome,
      };
    }

    const leaseToken = acquisition.leaseToken;
    const abortController = new AbortController();
    let heartbeatPromise: Promise<void> | undefined;
    let heartbeatTimer: NodeJS.Timeout | undefined;
    let knownExpiresAt = acquisition.expiresAt.getTime();
    let stopped = false;
    let rejectLeaseLoss: ((error: ProcessingLeaseLostError) => void) | undefined;
    const leaseLoss = new Promise<never>((_resolve, reject) => {
      rejectLeaseLoss = reject;
    });

    const loseLease = (message?: string): ProcessingLeaseLostError => {
      const error = new ProcessingLeaseLostError(message);
      if (!abortController.signal.aborted) {
        abortController.abort(error);
        rejectLeaseLoss?.(error);
      }
      return error;
    };

    const scheduleHeartbeat = (delayMs: number): void => {
      if (stopped || abortController.signal.aborted) {
        return;
      }

      heartbeatTimer = setTimeout(() => {
        heartbeatPromise = renewLease().finally(() => {
          heartbeatPromise = undefined;
        });
      }, delayMs);
      heartbeatTimer.unref?.();
    };

    const renewLease = async (): Promise<void> => {
      if (stopped || abortController.signal.aborted) {
        return;
      }

      try {
        const outcome = await this.repository.renew(jobId, workerId, leaseToken);
        if (outcome === "lost") {
          loseLease();
          return;
        }

        knownExpiresAt = Date.now() + this.options.leaseLifetimeMs;
        scheduleHeartbeat(this.options.heartbeatIntervalMs);
      } catch {
        const retryWindowMs = knownExpiresAt - Date.now() - this.options.leaseSafetyMs;
        if (retryWindowMs <= 0) {
          loseLease("Processing execution lease could not be renewed before expiry.");
          return;
        }

        scheduleHeartbeat(Math.min(this.options.heartbeatRetryMs, retryWindowMs));
      }
    };

    const stopHeartbeat = async (): Promise<void> => {
      stopped = true;
      if (heartbeatTimer) {
        clearTimeout(heartbeatTimer);
        heartbeatTimer = undefined;
      }
      await heartbeatPromise?.catch(() => undefined);
    };

    const context: ProcessingLeaseContext = {
      leaseToken,
      signal: abortController.signal,
      updateProgress: async (step, progress) => {
        try {
          const outcome = await this.repository.updateProgress(
            jobId,
            workerId,
            leaseToken,
            step,
            progress,
          );
          if (outcome === "lost") {
            throw loseLease();
          }
        } catch (error: unknown) {
          if (error instanceof ProcessingLeaseLostError) {
            throw error;
          }
          throw loseLease("Processing progress could not be persisted with the active lease.");
        }
      },
    };

    scheduleHeartbeat(this.options.heartbeatIntervalMs);

    try {
      const value = await Promise.race([handler(context), leaseLoss]);
      await stopHeartbeat();
      return { outcome: "completed", value };
    } catch (error: unknown) {
      await stopHeartbeat();

      if (error instanceof RetryableProcessingError) {
        const release = await this.repository.release(jobId, workerId, leaseToken);
        if (release === "lost") {
          throw new ProcessingLeaseLostError(
            "Processing execution lease was lost before controlled retry release.",
          );
        }
      }

      throw error;
    }
  }
}
