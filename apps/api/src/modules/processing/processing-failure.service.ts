import { Inject, Injectable, Logger } from "@nestjs/common";

import {
  PROCESSING_FAILURE_REPOSITORY,
  type ProcessingFailureRepositoryContract,
  type ProcessingFailureResult,
} from "./processing-failure.repository";

export const ANALYSIS_RETRIES_EXHAUSTED = "ANALYSIS_RETRIES_EXHAUSTED";
export const WORKER_EXECUTION_LEASE_EXPIRED = "WORKER_EXECUTION_LEASE_EXPIRED";

export const PROCESSING_FAILURE_SAFE_MESSAGE =
  "Processing failed before a usable result was produced.";

@Injectable()
export class ProcessingFailureService {
  private readonly logger = new Logger(ProcessingFailureService.name);

  public constructor(
    @Inject(PROCESSING_FAILURE_REPOSITORY)
    private readonly repository: ProcessingFailureRepositoryContract,
  ) {}

  public async handleTerminalFailure(
    jobId: string,
    failureCode: string,
    requestId: string,
  ): Promise<ProcessingFailureResult> {
    let result: ProcessingFailureResult;

    try {
      result = await this.repository.finalize(jobId, failureCode, PROCESSING_FAILURE_SAFE_MESSAGE);
    } catch {
      this.logger.error({
        event: "processing_failure_finalize_failed",
        failureCode,
        jobId,
        requestId,
      });
      throw new Error("Processing failure finalization failed.");
    }

    this.logger.log({
      event: "processing_failure_finalized",
      failureCode,
      jobId,
      outcome: result.outcome,
      refundedCredits: result.refundedCredits,
      requestId,
    });
    return result;
  }
}
