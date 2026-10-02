import {
  isProcessingFailureCode,
  type ProcessingFailureCode,
  type ProcessingJobStep,
} from "@repurposepro/shared";
import type { AnalysisAttempt, AnalysisStage } from "./analysis-retry";
import {
  checkDatabaseConnection,
  closeDatabaseClient,
  type DatabaseClient,
} from "@repurposepro/db";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";

export const PROCESSING_LIFECYCLE_REPOSITORY = Symbol("PROCESSING_LIFECYCLE_REPOSITORY");

export type ProcessingLeaseAcquireOutcome = "acquired" | "busy" | "rejected";
export type ProcessingLeaseRenewOutcome = "lost" | "renewed";
export type ProcessingLeaseReleaseOutcome = "lost" | "released";
export type ProcessingProgressOutcome = "lost" | "updated";

export interface ProcessingLeaseAcquisition {
  readonly expiresAt: Date | null;
  readonly leaseToken: string | null;
  readonly outcome: ProcessingLeaseAcquireOutcome;
}

export interface ProcessingLifecycleRepositoryContract {
  beginAttempt?(
    jobId: string,
    workerId: string,
    leaseToken: string,
    stage: AnalysisStage,
  ): Promise<AnalysisAttempt>;
  recordAttemptFailure?(
    jobId: string,
    workerId: string,
    leaseToken: string,
    stage: AnalysisStage,
    code: ProcessingFailureCode,
  ): Promise<"recorded" | "lost">;
  terminalFailure?(
    jobId: string,
    workerId: string,
    leaseToken: string,
    code: ProcessingFailureCode,
  ): Promise<"persisted" | "duplicate" | "finalized" | "lost">;
  acquire(jobId: string, projectId: string, workerId: string): Promise<ProcessingLeaseAcquisition>;
  release(
    jobId: string,
    workerId: string,
    leaseToken: string,
  ): Promise<ProcessingLeaseReleaseOutcome>;
  renew(jobId: string, workerId: string, leaseToken: string): Promise<ProcessingLeaseRenewOutcome>;
  updateProgress(
    jobId: string,
    workerId: string,
    leaseToken: string,
    step: ProcessingJobStep,
    progress: number,
  ): Promise<ProcessingProgressOutcome>;
}

export class ProcessingLifecycleRepository
  implements ProcessingLifecycleRepositoryContract, OnModuleInit, OnModuleDestroy
{
  public constructor(private readonly database: DatabaseClient) {}

  public async onModuleInit(): Promise<void> {
    await checkDatabaseConnection(this.database);
  }

  public async beginAttempt(
    jobId: string,
    workerId: string,
    leaseToken: string,
    stage: AnalysisStage,
  ): Promise<AnalysisAttempt> {
    const result = await this.database.pool.query<AnalysisAttempt>(
      `SELECT outcome,attempt,failure_code AS "failureCode" FROM public.begin_analysis_stage_attempt($1,$2,$3,$4)`,
      [jobId, workerId, leaseToken, stage],
    );
    const attempt = result.rows[0];
    if (
      result.rows.length !== 1 ||
      !attempt ||
      !["started", "exhausted", "lost"].includes(attempt.outcome) ||
      !Number.isInteger(attempt.attempt) ||
      attempt.attempt < 0 ||
      (attempt.failureCode !== null && !isProcessingFailureCode(attempt.failureCode))
    ) {
      throw new Error("Analysis stage attempt returned invalid state.");
    }
    return attempt;
  }

  public async recordAttemptFailure(
    jobId: string,
    workerId: string,
    leaseToken: string,
    stage: AnalysisStage,
    code: ProcessingFailureCode,
  ): Promise<"recorded" | "lost"> {
    return this.queryOutcome(
      "SELECT public.record_analysis_stage_failure($1,$2,$3,$4,$5) AS outcome",
      [jobId, workerId, leaseToken, stage, code],
      ["recorded", "lost"],
      "stage failure",
    );
  }

  public async terminalFailure(
    jobId: string,
    workerId: string,
    leaseToken: string,
    code: ProcessingFailureCode,
  ): Promise<"persisted" | "duplicate" | "finalized" | "lost"> {
    return this.queryOutcome(
      "SELECT public.persist_analysis_terminal_failure($1,$2,$3,$4) AS outcome",
      [jobId, workerId, leaseToken, code],
      ["persisted", "duplicate", "finalized", "lost"],
      "terminal failure",
    );
  }

  public async onModuleDestroy(): Promise<void> {
    await closeDatabaseClient(this.database);
  }

  public async acquire(
    jobId: string,
    projectId: string,
    workerId: string,
  ): Promise<ProcessingLeaseAcquisition> {
    const result = await this.database.pool.query<ProcessingLeaseAcquisition>(
      `SELECT
        outcome,
        lease_token AS "leaseToken",
        expires_at AS "expiresAt"
       FROM public.acquire_analysis_execution_lease($1, $2, $3)`,
      [jobId, projectId, workerId],
    );
    const record = result.rows[0];

    if (
      result.rows.length !== 1 ||
      !record ||
      !["acquired", "busy", "rejected"].includes(record.outcome) ||
      (record.outcome === "acquired" &&
        (!(record.expiresAt instanceof Date) || typeof record.leaseToken !== "string")) ||
      (record.outcome !== "acquired" && (record.expiresAt !== null || record.leaseToken !== null))
    ) {
      throw new Error("Processing lease acquisition returned an invalid result.");
    }

    return record;
  }

  public async renew(
    jobId: string,
    workerId: string,
    leaseToken: string,
  ): Promise<ProcessingLeaseRenewOutcome> {
    return this.queryOutcome(
      "SELECT public.renew_analysis_execution_lease($1, $2, $3) AS outcome",
      [jobId, workerId, leaseToken],
      ["lost", "renewed"],
      "renewal",
    );
  }

  public async release(
    jobId: string,
    workerId: string,
    leaseToken: string,
  ): Promise<ProcessingLeaseReleaseOutcome> {
    return this.queryOutcome(
      "SELECT public.release_analysis_execution_lease($1, $2, $3) AS outcome",
      [jobId, workerId, leaseToken],
      ["lost", "released"],
      "release",
    );
  }

  public async updateProgress(
    jobId: string,
    workerId: string,
    leaseToken: string,
    step: ProcessingJobStep,
    progress: number,
  ): Promise<ProcessingProgressOutcome> {
    return this.queryOutcome(
      "SELECT public.update_analysis_execution_progress($1, $2, $3, $4, $5) AS outcome",
      [jobId, workerId, leaseToken, step, progress],
      ["lost", "updated"],
      "progress update",
    );
  }

  private async queryOutcome<TOutcome extends string>(
    query: string,
    values: readonly unknown[],
    outcomes: readonly TOutcome[],
    operation: string,
  ): Promise<TOutcome> {
    const result = await this.database.pool.query<{ outcome: string }>(query, [...values]);
    const outcome = result.rows[0]?.outcome;

    if (result.rows.length !== 1 || !outcome || !outcomes.includes(outcome as TOutcome)) {
      throw new Error(`Processing lease ${operation} returned an invalid result.`);
    }

    return outcome as TOutcome;
  }
}
