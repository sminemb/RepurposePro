import { Inject, Injectable, Logger } from "@nestjs/common";

import {
  PROCESSING_FAILURE_INTENT_REPOSITORY,
  type ProcessingFailureIntentPersistenceOutcome,
  type ProcessingFailureIntentRepositoryContract,
} from "./processing-failure-intent.repository";
import { ProcessingFailureSweeperService } from "./processing-failure-sweeper.service";
import { PROCESSING_FAILURE_SAFE_MESSAGE } from "./processing-failure.service";

@Injectable()
export class ProcessingFailureIntentService {
  private readonly logger = new Logger(ProcessingFailureIntentService.name);

  public constructor(
    @Inject(PROCESSING_FAILURE_INTENT_REPOSITORY)
    private readonly repository: ProcessingFailureIntentRepositoryContract,
    private readonly sweeper: ProcessingFailureSweeperService,
  ) {}

  public async recordTerminalFailure(
    jobId: string,
    failureCode: string,
    sourceReference: string,
  ): Promise<ProcessingFailureIntentPersistenceOutcome> {
    const outcome = await this.repository.persist(
      jobId,
      failureCode,
      PROCESSING_FAILURE_SAFE_MESSAGE,
      sourceReference,
    );

    this.logger.log({
      event: "processing_failure_intent_recorded",
      failureCode,
      jobId,
      outcome,
      requestId: sourceReference,
    });

    if (outcome !== "conflict" && outcome !== "finalized") {
      await this.sweeper.sweepJob(jobId, sourceReference);
    }

    return outcome;
  }
}
