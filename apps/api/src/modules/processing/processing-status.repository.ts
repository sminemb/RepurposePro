import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../infrastructure/database.service";

export const PROCESSING_STATUS_REPOSITORY = Symbol("PROCESSING_STATUS_REPOSITORY");

export interface ProcessingStatusRecord {
  readonly currentJobType?: string | null;
  readonly failureCode?: string | null;
  readonly refundEligible?: boolean;
  readonly creditsCharged?: number | null;
  readonly refundedCredits?: number | null;
  readonly refundCompletedAt?: Date | null;
  readonly outputType?: "clips" | "summary";
  readonly currentJobId: string | null;
  readonly currentJobProgress: number | null;
  readonly currentJobReferenceId: string | null;
  readonly currentJobStatus: string | null;
  readonly currentJobStep: string | null;
  readonly projectId: string;
  readonly projectStatus: string;
}

export interface ProcessingStatusRepositoryContract {
  get(userId: string, projectId: string): Promise<ProcessingStatusRecord | null>;
}

@Injectable()
export class ProcessingStatusRepository implements ProcessingStatusRepositoryContract {
  public constructor(private readonly databaseService: DatabaseService) {}

  public async get(userId: string, projectId: string): Promise<ProcessingStatusRecord | null> {
    const result = await this.databaseService.database.pool.query<ProcessingStatusRecord>(
      `SELECT
         project.id AS "projectId",
         project.output_type AS "outputType",
         project.status AS "projectStatus",
         project.current_job_id AS "currentJobReferenceId",
         current_job.id AS "currentJobId",
         current_job.status AS "currentJobStatus",
         current_job.step AS "currentJobStep",
         current_job.progress AS "currentJobProgress",
         current_job.type AS "currentJobType",
         COALESCE(current_job.error_code, intent.failure_code) AS "failureCode",
         COALESCE(public.is_processing_failure_refund_eligible(intent.failure_code),current_job.refund_eligible,false) AS "refundEligible",
         current_job.credits_charged AS "creditsCharged",
         refund.amount AS "refundedCredits",
         current_job.refund_completed_at AS "refundCompletedAt"
       FROM projects AS project
       LEFT JOIN processing_jobs AS current_job
         ON current_job.id = project.current_job_id
        AND current_job.project_id = project.id
        AND current_job.user_id = project.user_id
       LEFT JOIN processing_failure_intents AS intent ON intent.processing_job_id=current_job.id
       LEFT JOIN credit_ledger AS refund ON refund.processing_job_id=current_job.id
         AND refund.user_id=project.user_id AND refund.project_id=project.id AND refund.type='refund'
       WHERE project.user_id = $1
         AND project.id = $2
         AND project.deleted_at IS NULL
       LIMIT 2`,
      [userId, projectId],
    );

    if (result.rows.length > 1) {
      throw new Error("Processing status returned multiple projects.");
    }

    return result.rows[0] ?? null;
  }
}
