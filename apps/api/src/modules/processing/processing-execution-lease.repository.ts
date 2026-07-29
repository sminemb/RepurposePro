import { Inject, Injectable } from "@nestjs/common";

import type { ScopedDatabaseProvider } from "../billing/scoped-database.providers";
import { PROCESSING_DATABASE } from "./scoped-database.provider";

export const PROCESSING_EXECUTION_LEASE_REPOSITORY = Symbol(
  "PROCESSING_EXECUTION_LEASE_REPOSITORY",
);

export interface ProcessingExecutionLeaseRepositoryContract {
  touch(jobId: string, leaseOwner: string): Promise<"ignored" | "renewed">;
}

@Injectable()
export class ProcessingExecutionLeaseRepository implements ProcessingExecutionLeaseRepositoryContract {
  public constructor(
    @Inject(PROCESSING_DATABASE)
    private readonly databaseService: ScopedDatabaseProvider,
  ) {}

  public async touch(jobId: string, leaseOwner: string): Promise<"ignored" | "renewed"> {
    const result = await this.databaseService.database.pool.query<{ outcome: string }>(
      "SELECT public.touch_analysis_execution_lease($1, $2, $3) AS outcome",
      [jobId, leaseOwner, 60],
    );
    const outcome = result.rows[0]?.outcome;

    if (result.rows.length !== 1 || (outcome !== "ignored" && outcome !== "renewed")) {
      throw new Error("Processing execution lease update returned an invalid result.");
    }

    return outcome;
  }
}
