import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../infrastructure/database.service";

export const PROCESSING_START_REPOSITORY = Symbol("PROCESSING_START_REPOSITORY");

export type ProcessingStartOutcome =
  | "created"
  | "existing"
  | "insufficient_credits"
  | "invalid_project_state"
  | "project_not_found"
  | "video_required";

export interface ProcessingStartRecord {
  readonly creditsCharged: number | null;
  readonly jobId: string | null;
  readonly outcome: ProcessingStartOutcome;
  readonly projectId: string | null;
  readonly status: string | null;
}

export interface ProcessingStartRepositoryContract {
  markEnqueued(
    userId: string,
    projectId: string,
    jobId: string,
    bullmqJobId: string,
  ): Promise<void>;
  start(userId: string, projectId: string): Promise<ProcessingStartRecord>;
}

@Injectable()
export class ProcessingStartRepository implements ProcessingStartRepositoryContract {
  public constructor(private readonly databaseService: DatabaseService) {}

  public async start(userId: string, projectId: string): Promise<ProcessingStartRecord> {
    const result = await this.databaseService.database.pool.query<ProcessingStartRecord>(
      `SELECT
        outcome,
        job_id AS "jobId",
        project_id AS "projectId",
        status,
        credits_charged AS "creditsCharged"
       FROM public.start_paid_video_analysis($1, $2)`,
      [userId, projectId],
    );
    const [record] = result.rows;

    if (result.rows.length !== 1 || !record) {
      throw new Error("Processing start did not return one result.");
    }

    return record;
  }

  public async markEnqueued(
    userId: string,
    projectId: string,
    jobId: string,
    bullmqJobId: string,
  ): Promise<void> {
    const result = await this.databaseService.database.pool.query<{ id: string }>(
      `UPDATE processing_jobs AS processing_job
       SET bullmq_job_id = $4,
           updated_at = now()
       FROM projects AS project
       WHERE processing_job.id = $3
         AND processing_job.project_id = project.id
         AND project.id = $2
         AND project.user_id = $1
         AND processing_job.type = 'analyze_video'
         AND (
           processing_job.bullmq_job_id IS NULL
           OR processing_job.bullmq_job_id = $4
         )
       RETURNING processing_job.id`,
      [userId, projectId, jobId, bullmqJobId],
    );

    if (result.rows.length !== 1) {
      throw new Error("Processing queue reference did not update one job.");
    }
  }
}
