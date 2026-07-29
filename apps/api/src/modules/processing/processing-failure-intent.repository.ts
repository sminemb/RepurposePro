import { Inject, Injectable } from "@nestjs/common";

import type { ScopedDatabaseProvider } from "../billing/scoped-database.providers";
import { PROCESSING_DATABASE } from "./scoped-database.provider";

export const PROCESSING_FAILURE_INTENT_REPOSITORY = Symbol("PROCESSING_FAILURE_INTENT_REPOSITORY");

export type ProcessingFailureIntentPersistenceOutcome =
  "conflict" | "duplicate" | "finalized" | "persisted";

export interface ProcessingFailureIntentRecord {
  readonly attemptCount: number;
  readonly failureCode: string;
  readonly intentId: string;
  readonly jobId: string;
  readonly leaseToken: string;
  readonly safeMessage: string;
}

export interface ProcessingFailureIntentRepositoryContract {
  claim(jobId: string | null, sweeperId: string): Promise<ProcessingFailureIntentRecord | null>;
  markFinalized(intentId: string, leaseToken: string): Promise<void>;
  persist(
    jobId: string,
    failureCode: string,
    safeMessage: string,
    sourceReference: string,
  ): Promise<ProcessingFailureIntentPersistenceOutcome>;
  reschedule(intentId: string, leaseToken: string, delaySeconds: number): Promise<void>;
}

@Injectable()
export class ProcessingFailureIntentRepository implements ProcessingFailureIntentRepositoryContract {
  public constructor(
    @Inject(PROCESSING_DATABASE)
    private readonly databaseService: ScopedDatabaseProvider,
  ) {}

  public async persist(
    jobId: string,
    failureCode: string,
    safeMessage: string,
    sourceReference: string,
  ): Promise<ProcessingFailureIntentPersistenceOutcome> {
    const result = await this.databaseService.database.pool.query<{ outcome: string }>(
      "SELECT public.persist_processing_failure_intent($1, $2, $3, $4) AS outcome",
      [jobId, failureCode, safeMessage, sourceReference],
    );
    const outcome = result.rows[0]?.outcome;

    if (
      result.rows.length !== 1 ||
      !outcome ||
      !["conflict", "duplicate", "finalized", "persisted"].includes(outcome)
    ) {
      throw new Error("Processing failure intent persistence returned an invalid result.");
    }

    return outcome as ProcessingFailureIntentPersistenceOutcome;
  }

  public async claim(
    jobId: string | null,
    sweeperId: string,
  ): Promise<ProcessingFailureIntentRecord | null> {
    const result = await this.databaseService.database.pool.query<ProcessingFailureIntentRecord>(
      `SELECT
          attempt_count AS "attemptCount",
          failure_code AS "failureCode",
          intent_id AS "intentId",
          job_id AS "jobId",
          lease_token AS "leaseToken",
          safe_message AS "safeMessage"
         FROM public.claim_processing_failure_intent($1, $2)`,
      [sweeperId, jobId],
    );

    if (result.rows.length > 1) {
      throw new Error("Processing failure intent claim returned multiple rows.");
    }

    return result.rows[0] ?? null;
  }

  public async markFinalized(intentId: string, leaseToken: string): Promise<void> {
    const result = await this.databaseService.database.pool.query<{ outcome: string }>(
      "SELECT public.mark_processing_failure_intent_finalized($1, $2) AS outcome",
      [intentId, leaseToken],
    );

    if (result.rows.length !== 1 || result.rows[0]?.outcome !== "finalized") {
      throw new Error("Processing failure intent marker was not persisted.");
    }
  }

  public async reschedule(
    intentId: string,
    leaseToken: string,
    delaySeconds: number,
  ): Promise<void> {
    const result = await this.databaseService.database.pool.query<{ outcome: string }>(
      "SELECT public.reschedule_processing_failure_intent($1, $2, $3) AS outcome",
      [intentId, leaseToken, delaySeconds],
    );

    if (result.rows.length !== 1 || result.rows[0]?.outcome !== "rescheduled") {
      throw new Error("Processing failure intent retry was not persisted.");
    }
  }
}
