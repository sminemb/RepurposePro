import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ANALYZE_VIDEO_JOB_NAME, type VideoAnalysisJobPayload } from "@repurposepro/shared";
import { UnrecoverableError } from "bullmq";

import {
  ProcessingLeaseLostError,
  type ProcessingLeaseContext,
  ProcessingLifecycleService,
  RetryableProcessingError,
} from "../services/processing-lifecycle.service";

export const ANALYSIS_PIPELINE_HANDLER = Symbol("ANALYSIS_PIPELINE_HANDLER");
export const ANALYSIS_JOB_PROCESSOR_OPTIONS = Symbol("ANALYSIS_JOB_PROCESSOR_OPTIONS");

export interface AnalysisQueueJobInput {
  readonly data: unknown;
  readonly id?: string;
  readonly name: string;
}

export interface AnalysisPipelineResult {
  readonly outcome: "preview_ready";
}

export interface AnalysisPipelineHandler {
  handle(
    payload: VideoAnalysisJobPayload,
    context: ProcessingLeaseContext,
  ): Promise<AnalysisPipelineResult>;
}

export interface AnalysisJobProcessorOptions {
  readonly createExecutionId: () => string;
}

export class AnalysisJobBusyError extends Error {
  public constructor() {
    super("Analysis execution lease is currently owned by another worker.");
    this.name = "AnalysisJobBusyError";
  }
}

const defaultOptions: AnalysisJobProcessorOptions = {
  createExecutionId: () => `worker-${randomUUID()}`,
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

@Injectable()
export class AnalysisJobProcessor {
  private readonly logger = new Logger(AnalysisJobProcessor.name);
  private readonly options: AnalysisJobProcessorOptions;

  public constructor(
    private readonly lifecycle: ProcessingLifecycleService,
    @Inject(ANALYSIS_PIPELINE_HANDLER)
    private readonly handler: AnalysisPipelineHandler,
    @Optional()
    @Inject(ANALYSIS_JOB_PROCESSOR_OPTIONS)
    options?: AnalysisJobProcessorOptions,
  ) {
    this.options = options ?? defaultOptions;
  }

  public async process(job: AnalysisQueueJobInput): Promise<AnalysisPipelineResult> {
    let payload: VideoAnalysisJobPayload;

    try {
      payload = parseAnalysisQueueJob(job);
    } catch (error: unknown) {
      this.logger.warn({
        event: "analysis_job_rejected",
        failureCode: "invalid_queue_contract",
        outcome: "rejected",
      });
      throw error;
    }

    const executionId = this.options.createExecutionId();
    this.logger.log({
      event: "analysis_job_started",
      executionId,
      jobId: payload.jobId,
      outcome: "started",
      projectId: payload.projectId,
    });

    try {
      const execution = await this.lifecycle.execute(
        payload.jobId,
        payload.projectId,
        executionId,
        async (context) => {
          const result = await this.handler.handle(payload, context);
          if (!isAnalysisPipelineResult(result)) {
            throw new UnrecoverableError(
              "Analysis pipeline did not persist a preview-ready result.",
            );
          }
          return result;
        },
      );

      if (execution.outcome === "not_acquired") {
        if (execution.reason === "busy") {
          throw new AnalysisJobBusyError();
        }
        throw new UnrecoverableError("Analysis job was rejected by the durable lifecycle.");
      }

      this.logger.log({
        event: "analysis_job_completed",
        executionId,
        jobId: payload.jobId,
        outcome: execution.value.outcome,
        projectId: payload.projectId,
      });
      return execution.value;
    } catch (error: unknown) {
      this.logger.error({
        event: "analysis_job_failed",
        executionId,
        failureCode: classifyFailure(error),
        jobId: payload.jobId,
        outcome: "failed",
        projectId: payload.projectId,
      });
      throw error;
    }
  }
}

function parseAnalysisQueueJob(job: AnalysisQueueJobInput): VideoAnalysisJobPayload {
  if (job.name !== ANALYZE_VIDEO_JOB_NAME || !isUuid(job.id)) {
    throw new UnrecoverableError("Analysis queue job identity is invalid.");
  }

  if (!isPlainRecord(job.data)) {
    throw new UnrecoverableError("Analysis queue job payload is invalid.");
  }

  const keys = Object.keys(job.data);
  if (
    keys.length !== 2 ||
    !keys.includes("jobId") ||
    !keys.includes("projectId") ||
    !isUuid(job.data.jobId) ||
    !isUuid(job.data.projectId) ||
    job.data.jobId !== job.id
  ) {
    throw new UnrecoverableError("Analysis queue job payload is invalid.");
  }

  return {
    jobId: job.data.jobId,
    projectId: job.data.projectId,
  };
}

function isAnalysisPipelineResult(value: unknown): value is AnalysisPipelineResult {
  return (
    isPlainRecord(value) && Object.keys(value).length === 1 && value.outcome === "preview_ready"
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function classifyFailure(error: unknown): string {
  if (error instanceof AnalysisJobBusyError) {
    return "execution_lease_busy";
  }
  if (error instanceof ProcessingLeaseLostError) {
    return "execution_lease_lost";
  }
  if (error instanceof RetryableProcessingError) {
    return "analysis_retry_requested";
  }
  if (error instanceof UnrecoverableError) {
    return "analysis_job_unrecoverable";
  }
  return "analysis_job_failed";
}
