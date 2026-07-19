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
}
