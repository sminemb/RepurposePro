import { Inject, Injectable } from "@nestjs/common";
import { type ProcessingJobStatus, type ProcessingStartResult } from "@repurposepro/shared";

import {
  PROCESSING_START_REPOSITORY,
  type ProcessingStartRecord,
  type ProcessingStartRepositoryContract,
} from "./processing-start.repository";

type ProcessingStartErrorCode =
  | "BILLING_DEDUCTION_FAILED"
  | "BILLING_INSUFFICIENT_CREDITS"
  | "PROCESSING_INVALID_PROJECT_STATE"
  | "PROCESSING_VIDEO_REQUIRED"
  | "PROJECT_NOT_FOUND";

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
  public constructor(
    @Inject(PROCESSING_START_REPOSITORY)
    private readonly processingStartRepository: ProcessingStartRepositoryContract,
  ) {}

  public async start(userId: string, projectId: string): Promise<ProcessingStartResult> {
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
      case "existing":
        return this.toResult(record);
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
}

function isStartableJobStatus(status: string | null): status is ProcessingJobStatus {
  return status === "queued" || status === "active";
}
