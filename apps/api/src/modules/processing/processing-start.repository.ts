import { Inject, Injectable } from "@nestjs/common";

import type { ScopedDatabaseProvider } from "../billing/scoped-database.providers";
import { PROCESSING_DATABASE } from "./scoped-database.provider";

export const PROCESSING_START_REPOSITORY = Symbol("PROCESSING_START_REPOSITORY");

export type ProcessingStartOutcome =
  | "created"
  | "existing"
  | "insufficient_credits"
  | "invalid_project_state"
  | "project_not_found"
  | "video_required"
  | "video_expired";

export interface ProcessingStartRecord {
  readonly creditsCharged: number | null;
  readonly jobId: string | null;
  readonly outcome: ProcessingStartOutcome;
  readonly projectId: string | null;
  readonly status: string | null;
}

export interface ProcessingStartRepositoryContract {
  requiresRestartValidation?(userId: string, projectId: string): Promise<boolean>;
  start(userId: string, projectId: string): Promise<ProcessingStartRecord>;
}

@Injectable()
export class ProcessingStartRepository implements ProcessingStartRepositoryContract {
  public constructor(
    @Inject(PROCESSING_DATABASE)
    private readonly databaseService: ScopedDatabaseProvider,
  ) {}

  public async requiresRestartValidation(userId: string, projectId: string): Promise<boolean> {
    const result = await this.databaseService.database.pool.query<{ required: boolean }>(
      "SELECT public.is_owned_refunded_analysis_project($1,$2) AS required",
      [userId, projectId],
    );
    if (result.rows.length !== 1 || typeof result.rows[0]?.required !== "boolean")
      throw new Error("Analysis restart preflight returned an invalid result.");
    return result.rows[0].required;
  }

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
