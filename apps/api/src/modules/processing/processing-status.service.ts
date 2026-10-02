import { Inject, Injectable } from "@nestjs/common";
import {
  isProcessingFailureCode,
  PROCESSING_FAILURES,
  type ProcessingFailureSnapshot,
  ProcessingJobStatus,
  ProcessingJobStep,
  ProjectStatus,
  type ProjectProcessingStatus,
} from "@repurposepro/shared";

import {
  PROCESSING_STATUS_REPOSITORY,
  type ProcessingStatusRecord,
  type ProcessingStatusRepositoryContract,
} from "./processing-status.repository";

type ProcessingStatusErrorCode = "PROCESSING_STATUS_UNAVAILABLE" | "PROJECT_NOT_FOUND";

export class ProcessingStatusError extends Error {
  public constructor(
    public readonly code: ProcessingStatusErrorCode,
    public readonly statusCode: 404 | 503,
    message: string,
  ) {
    super(message);
    this.name = "ProcessingStatusError";
  }
}

@Injectable()
export class ProcessingStatusService {
  public constructor(
    @Inject(PROCESSING_STATUS_REPOSITORY)
    private readonly processingStatusRepository: ProcessingStatusRepositoryContract,
  ) {}

  public async get(userId: string, projectId: string): Promise<ProjectProcessingStatus> {
    let record: ProcessingStatusRecord | null;

    try {
      record = await this.processingStatusRepository.get(userId, projectId);
    } catch {
      return this.unavailable();
    }

    if (!record) {
      throw new ProcessingStatusError("PROJECT_NOT_FOUND", 404, "Project not found.");
    }

    if (!isProjectStatus(record.projectStatus) || record.projectId !== projectId) {
      return this.unavailable();
    }

    if (record.currentJobReferenceId === null) {
      if (!hasNullJob(record)) {
        return this.unavailable();
      }

      return {
        currentJob: null,
        projectId: record.projectId,
        status: record.projectStatus,
        ...(record.outputType ? { outputType: record.outputType } : {}),
      };
    }

    if (
      record.currentJobId !== record.currentJobReferenceId ||
      !isProcessingJobStatus(record.currentJobStatus) ||
      !isProcessingJobStepOrNull(record.currentJobStep) ||
      !isProgressOrNull(record.currentJobProgress)
    ) {
      return this.unavailable();
    }

    return {
      ...(record.outputType ? { outputType: record.outputType } : {}),
      currentJob: {
        ...(record.failureCode !== undefined ? { failure: this.failure(record) } : {}),
        id: record.currentJobId,
        progress:
          record.currentJobStatus === ProcessingJobStatus.Queued && record.currentJobProgress === 0
            ? null
            : record.currentJobProgress,
        status: record.currentJobStatus,
        step: record.currentJobStep,
      },
      projectId: record.projectId,
      status: record.projectStatus,
    };
  }

  private unavailable(): never {
    throw new ProcessingStatusError(
      "PROCESSING_STATUS_UNAVAILABLE",
      503,
      "We could not load this project's processing status.",
    );
  }

  private failure(record: ProcessingStatusRecord): ProcessingFailureSnapshot | null {
    if (!record.failureCode || (record.currentJobType && record.currentJobType !== "analyze_video"))
      return null;
    if (!isProcessingFailureCode(record.failureCode)) return this.unavailable();
    const completed = record.currentJobStatus === ProcessingJobStatus.Refunded;
    if (
      completed &&
      (!record.refundEligible ||
        !record.refundCompletedAt ||
        !Number.isInteger(record.refundedCredits) ||
        (record.refundedCredits ?? 0) <= 0 ||
        record.refundedCredits !== record.creditsCharged)
    )
      return this.unavailable();
    return {
      code: record.failureCode,
      message: PROCESSING_FAILURES[record.failureCode].message,
      refundStatus: completed ? "completed" : record.refundEligible ? "pending" : "not_eligible",
      refundedCredits: completed ? record.refundedCredits! : 0,
      refundCompletedAt: completed ? record.refundCompletedAt!.toISOString() : null,
    };
  }
}

const projectStatuses = new Set<string>(Object.values(ProjectStatus));
const processingJobStatuses = new Set<string>(Object.values(ProcessingJobStatus));
const processingJobSteps = new Set<string>(Object.values(ProcessingJobStep));

function isProjectStatus(status: string): status is ProjectStatus {
  return projectStatuses.has(status);
}

function isProcessingJobStatus(status: string | null): status is ProcessingJobStatus {
  return status !== null && processingJobStatuses.has(status);
}

function isProcessingJobStepOrNull(step: string | null): step is ProcessingJobStep | null {
  return step === null || processingJobSteps.has(step);
}

function isProgressOrNull(progress: number | null): boolean {
  return progress === null || (Number.isInteger(progress) && progress >= 0 && progress <= 100);
}

function hasNullJob(record: ProcessingStatusRecord): boolean {
  return (
    record.currentJobId === null &&
    record.currentJobStatus === null &&
    record.currentJobStep === null &&
    record.currentJobProgress === null
  );
}
