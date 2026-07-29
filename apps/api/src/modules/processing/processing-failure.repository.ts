import { Inject, Injectable } from "@nestjs/common";

import type { ScopedDatabaseProvider } from "../billing/scoped-database.providers";
import { PROCESSING_DATABASE } from "./scoped-database.provider";

export const PROCESSING_FAILURE_REPOSITORY = Symbol("PROCESSING_FAILURE_REPOSITORY");

export type ProcessingFailureOutcome =
  "already_refunded" | "failed_no_refund" | "invalid_job_state" | "job_not_found" | "refunded";

export interface ProcessingFailureResult {
  readonly outcome: ProcessingFailureOutcome;
  readonly refundedCredits: number;
}

export interface ProcessingFailureRepositoryContract {
  finalize(
    jobId: string,
    failureCode: string,
    safeMessage: string,
  ): Promise<ProcessingFailureResult>;
}

@Injectable()
export class ProcessingFailureRepository implements ProcessingFailureRepositoryContract {
  public constructor(
    @Inject(PROCESSING_DATABASE)
    private readonly databaseService: ScopedDatabaseProvider,
  ) {}

  public async finalize(
    jobId: string,
    failureCode: string,
    safeMessage: string,
  ): Promise<ProcessingFailureResult> {
    const result = await this.databaseService.database.pool.query<ProcessingFailureResult>(
      `SELECT
        outcome,
        refunded_credits AS "refundedCredits"
       FROM public.finalize_failed_processing_job($1, $2, $3)`,
      [jobId, failureCode, safeMessage],
    );
    const [record] = result.rows;

    if (
      result.rows.length !== 1 ||
      !record ||
      !isProcessingFailureOutcome(record.outcome) ||
      !Number.isInteger(record.refundedCredits) ||
      record.refundedCredits < 0
    ) {
      throw new Error("Processing failure finalization returned an invalid result.");
    }

    return record;
  }
}

function isProcessingFailureOutcome(outcome: string): outcome is ProcessingFailureOutcome {
  return [
    "already_refunded",
    "failed_no_refund",
    "invalid_job_state",
    "job_not_found",
    "refunded",
  ].includes(outcome);
}
