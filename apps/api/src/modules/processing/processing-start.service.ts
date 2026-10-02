import { Inject, Injectable, Optional } from "@nestjs/common";
import { ClipPreviewsService, ClipPreviewAccessError } from "../projects/clip-previews.service";
import { type ProcessingJobStatus, type ProcessingStartResult } from "@repurposepro/shared";

import {
  PROCESSING_START_REPOSITORY,
  type ProcessingStartRecord,
  type ProcessingStartRepositoryContract,
} from "./processing-start.repository";
import { AnalysisDispatcherService } from "./analysis-dispatcher.service";

type ProcessingStartErrorCode =
  | "BILLING_DEDUCTION_FAILED"
  | "BILLING_INSUFFICIENT_CREDITS"
  | "PROCESSING_INVALID_PROJECT_STATE"
  | "PROCESSING_VIDEO_REQUIRED"
  | "PROJECT_NOT_FOUND"
  | "SOURCE_VIDEO_EXPIRED"
  | "QUEUE_UNAVAILABLE";

export class ProcessingStartError extends Error {
  public constructor(
    public readonly code: ProcessingStartErrorCode,
    public readonly statusCode: 404 | 409 | 410 | 503,
    message: string,
  ) {
    super(message);
    this.name = "ProcessingStartError";
  }
}

@Injectable()
export class ProcessingStartService {
  public constructor(
    @Inject(PROCESSING_START_REPOSITORY)
    private readonly processingStartRepository: ProcessingStartRepositoryContract,
    private readonly analysisDispatcher: AnalysisDispatcherService,
    @Optional() private readonly sourceVideos?: ClipPreviewsService,
  ) {}

  public async start(
    userId: string,
    projectId: string,
    requestId: string,
  ): Promise<ProcessingStartResult> {
    let record: ProcessingStartRecord;

    try {
      if (
        this.sourceVideos &&
        (await this.processingStartRepository.requiresRestartValidation?.(userId, projectId))
      ) {
        try {
          await this.sourceVideos.getSourceVideoContent(userId, projectId);
        } catch (error) {
          if (error instanceof ClipPreviewAccessError && error.code === "SOURCE_VIDEO_EXPIRED")
            throw new ProcessingStartError(
              "SOURCE_VIDEO_EXPIRED",
              410,
              "The source video has expired.",
            );
          throw new ProcessingStartError(
            "PROCESSING_VIDEO_REQUIRED",
            409,
            "Your retained upload is unavailable. Create a new project and upload your video again.",
          );
        }
      }

      record = await this.processingStartRepository.start(userId, projectId);
    } catch (error: unknown) {
      if (error instanceof ProcessingStartError) throw error;
      throw new ProcessingStartError(
        "BILLING_DEDUCTION_FAILED",
        503,
        "We could not start processing. Try again.",
      );
    }

    switch (record.outcome) {
      case "video_expired":
        throw new ProcessingStartError(
          "SOURCE_VIDEO_EXPIRED",
          410,
          "The source video has expired.",
        );
      case "created":
      case "existing": {
        const result = this.toResult(record);
        let published: boolean;

        try {
          published = await this.analysisDispatcher.dispatchJob(result.jobId, requestId);
        } catch {
          return this.queueUnavailable();
        }

        if (!published) {
          return this.queueUnavailable();
        }

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
      "Your processing job is saved and will retry automatically when the queue recovers.",
    );
  }
}

function isStartableJobStatus(status: string | null): status is ProcessingJobStatus {
  return status === "queued" || status === "active";
}
