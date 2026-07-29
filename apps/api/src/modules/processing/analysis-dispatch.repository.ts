import { Inject, Injectable } from "@nestjs/common";
import type { ProcessingJobStatus } from "@repurposepro/shared";

import type { ScopedDatabaseProvider } from "../billing/scoped-database.providers";
import { PROCESSING_DATABASE } from "./scoped-database.provider";

export const ANALYSIS_DISPATCH_REPOSITORY = Symbol("ANALYSIS_DISPATCH_REPOSITORY");

export type DispatchFailureStage =
  "active_job_missing" | "queue_publish" | "queue_reference_persist";

export interface AnalysisDispatchRecord {
  readonly attemptCount: number;
  readonly dispatchId: string;
  readonly dispatchStatus: "pending" | "published";
  readonly executionLeaseExpiresAt: Date | null;
  readonly jobId: string;
  readonly jobStatus: ProcessingJobStatus;
  readonly leaseToken: string;
  readonly projectId: string;
}

export interface AnalysisDispatchRepositoryContract {
  claim(jobId: string | null, dispatcherId: string): Promise<AnalysisDispatchRecord | null>;
  isPublished(jobId: string): Promise<boolean>;
  markPublished(dispatchId: string, leaseToken: string, bullmqJobId: string): Promise<void>;
  reschedule(
    dispatchId: string,
    leaseToken: string,
    failureStage: DispatchFailureStage,
    delaySeconds: number,
  ): Promise<void>;
}

@Injectable()
export class AnalysisDispatchRepository implements AnalysisDispatchRepositoryContract {
  public constructor(
    @Inject(PROCESSING_DATABASE)
    private readonly databaseService: ScopedDatabaseProvider,
  ) {}

  public async claim(
    jobId: string | null,
    dispatcherId: string,
  ): Promise<AnalysisDispatchRecord | null> {
    const result = await this.databaseService.database.pool.query<AnalysisDispatchRecord>(
      `SELECT
        attempt_count AS "attemptCount",
        dispatch_id AS "dispatchId",
        dispatch_status AS "dispatchStatus",
        execution_lease_expires_at AS "executionLeaseExpiresAt",
        job_id AS "jobId",
        job_status AS "jobStatus",
        lease_token AS "leaseToken",
        project_id AS "projectId"
       FROM public.claim_pending_analysis_dispatch($1, $2)`,
      [dispatcherId, jobId],
    );

    if (result.rows.length > 1) {
      throw new Error("Analysis dispatch claim returned multiple rows.");
    }

    return result.rows[0] ?? null;
  }

  public async isPublished(jobId: string): Promise<boolean> {
    const result = await this.databaseService.database.pool.query<{ published: boolean }>(
      `SELECT public.is_analysis_dispatch_published($1) AS published`,
      [jobId],
    );

    if (result.rows.length !== 1 || typeof result.rows[0]?.published !== "boolean") {
      throw new Error("Analysis dispatch status did not return one boolean.");
    }

    return result.rows[0].published;
  }

  public async markPublished(
    dispatchId: string,
    leaseToken: string,
    bullmqJobId: string,
  ): Promise<void> {
    const result = await this.databaseService.database.pool.query<{ outcome: string }>(
      `SELECT public.mark_analysis_dispatch_published($1, $2, $3) AS outcome`,
      [dispatchId, leaseToken, bullmqJobId],
    );

    if (result.rows.length !== 1 || result.rows[0]?.outcome !== "published") {
      throw new Error("Analysis dispatch publication marker was not persisted.");
    }
  }

  public async reschedule(
    dispatchId: string,
    leaseToken: string,
    failureStage: DispatchFailureStage,
    delaySeconds: number,
  ): Promise<void> {
    const result = await this.databaseService.database.pool.query<{ outcome: string }>(
      `SELECT public.reschedule_analysis_dispatch($1, $2, $3, $4) AS outcome`,
      [dispatchId, leaseToken, failureStage, delaySeconds],
    );

    if (result.rows.length !== 1 || result.rows[0]?.outcome !== "rescheduled") {
      throw new Error("Analysis dispatch retry was not persisted.");
    }
  }
}
