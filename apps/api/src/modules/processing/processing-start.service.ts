import { Inject, Injectable, Logger } from "@nestjs/common";
import { type ProcessingJobStatus, type ProcessingStartResult } from "@repurposepro/shared";

import {
  PROCESSING_START_REPOSITORY,
  type ProcessingStartRecord,
  type ProcessingStartRepositoryContract,
} from "./processing-start.repository";
import { ANALYSIS_QUEUE_GATEWAY, type AnalysisQueueGateway } from "./analysis-queue.gateway";

type ProcessingStartErrorCode =
  | "BILLING_DEDUCTION_FAILED"
  | "BILLING_INSUFFICIENT_CREDITS"
  | "PROCESSING_INVALID_PROJECT_STATE"
  | "PROCESSING_VIDEO_REQUIRED"
  | "PROJECT_NOT_FOUND"
  | "QUEUE_UNAVAILABLE";

export class ProcessingStartError extends Error {
  public constructor(
    public readonly code: ProcessingStartErrorCode,
    public readonly statusCode: 404 | 409 | 503,
    message: string,
  ) {
    super(message);
    this.name = "ProcessingStartError";
  }
}

@Injectable()
export class ProcessingStartService {
  private readonly logger = new Logger(ProcessingStartService.name);

  public constructor(
    @Inject(PROCESSING_START_REPOSITORY)
    private readonly processingStartRepository: ProcessingStartRepositoryContract,
    @Inject(ANALYSIS_QUEUE_GATEWAY)
    private readonly analysisQueueGateway: AnalysisQueueGateway,
  ) {}

  public async start(
    userId: string,
    projectId: string,
    requestId: string,
  ): Promise<ProcessingStartResult> {
    let record: ProcessingStartRecord;

    try {
      record = await this.processingStartRepository.start(userId, projectId);
    } catch {
      throw new ProcessingStartError(
        "BILLING_DEDUCTION_FAILED",
        503,
        "We could not start processing. Try again.",
      );
    }

    switch (record.outcome) {
      case "created":
      case "existing": {
        const result = this.toResult(record);
        await this.enqueueAndMark(userId, result, requestId, record.outcome === "existing");
        return result;
      }
      case "project_not_found":
        throw new ProcessingStartError("PROJECT_NOT_FOUND", 404, "Project not found.");
      case "invalid_project_state":
        throw new ProcessingStartError(
          "PROCESSING_INVALID_PROJECT_STATE",
          409,
          "This project is not ready to start processing.",
        );
      case "video_required":
        throw new ProcessingStartError(
          "PROCESSING_VIDEO_REQUIRED",
          409,
          "Upload a valid video before starting processing.",
        );
      case "insufficient_credits":
        throw new ProcessingStartError(
          "BILLING_INSUFFICIENT_CREDITS",
          409,
          "You do not have enough credits to process this video.",
        );
      default:
        return this.unavailable();
    }
  }

  private async enqueueAndMark(
    userId: string,
    result: ProcessingStartResult,
    requestId: string,
    recovery: boolean,
  ): Promise<void> {
    let bullmqJobId: string;

    try {
      bullmqJobId = await this.analysisQueueGateway.enqueue({
        jobId: result.jobId,
        projectId: result.projectId,
      });
    } catch {
      this.logEnqueueFailure(result, requestId, recovery, "queue_publish");
      return this.queueUnavailable();
    }

    try {
      await this.processingStartRepository.markEnqueued(
        userId,
        result.projectId,
        result.jobId,
        bullmqJobId,
      );
    } catch {
      this.logEnqueueFailure(result, requestId, recovery, "queue_reference_persist");
      return this.queueUnavailable();
    }

    this.logger.log({
      event: "analysis_job_enqueued",
      jobId: result.jobId,
      projectId: result.projectId,
      recovery,
      requestId,
    });
  }

  private logEnqueueFailure(
    result: ProcessingStartResult,
    requestId: string,
    recovery: boolean,
    failureStage: "queue_publish" | "queue_reference_persist",
  ): void {
    this.logger.error({
      event: "analysis_job_enqueue_failed",
      failureStage,
      jobId: result.jobId,
      projectId: result.projectId,
      recovery,
      requestId,
    });
  }

  private toResult(record: ProcessingStartRecord): ProcessingStartResult {
    if (
      !record.jobId ||
      !record.projectId ||
      record.creditsCharged === null ||
      !isStartableJobStatus(record.status)
    ) {
      return this.unavailable();
    }

    return {
      creditsCharged: record.creditsCharged,
      jobId: record.jobId,
      projectId: record.projectId,
      status: record.status,
    };
  }

  private unavailable(): never {
    throw new ProcessingStartError(
      "BILLING_DEDUCTION_FAILED",
      503,
      "We could not start processing. Try again.",
    );
  }

  private queueUnavailable(): never {
    throw new ProcessingStartError(
      "QUEUE_UNAVAILABLE",
      503,
      "Your processing job is saved, but the queue is unavailable. Retry is safe.",
    );
  }
}

function isStartableJobStatus(status: string | null): status is ProcessingJobStatus {
  return status === "queued" || status === "active";
}
