import {
  ANALYZE_VIDEO_JOB_NAME,
  ProcessingJobStep,
  type VideoAnalysisJobPayload,
} from "@repurposepro/shared";
import { UnrecoverableError } from "bullmq";
import { describe, expect, it, vi } from "vitest";

import type { ProcessingLifecycleRepositoryContract } from "../services/processing-lifecycle.repository";
import {
  ProcessingLifecycleService,
  RetryableProcessingError,
} from "../services/processing-lifecycle.service";
import {
  AnalysisJobBusyError,
  AnalysisJobProcessor,
  type AnalysisPipelineHandler,
} from "./analysis-job.processor";

const jobId = "00000000-0000-4000-8000-000000000901";
const leaseToken = "00000000-0000-4000-8000-000000000902";
const projectId = "00000000-0000-4000-8000-000000000903";
const payload: VideoAnalysisJobPayload = { jobId, projectId };

function setup() {
  const acquire = vi.fn<ProcessingLifecycleRepositoryContract["acquire"]>().mockResolvedValue({
    expiresAt: new Date("2099-07-30T12:00:00.000Z"),
    leaseToken,
    outcome: "acquired",
  });
  const release = vi
    .fn<ProcessingLifecycleRepositoryContract["release"]>()
    .mockResolvedValue("released");
  const renew = vi
    .fn<ProcessingLifecycleRepositoryContract["renew"]>()
    .mockResolvedValue("renewed");
  const updateProgress = vi
    .fn<ProcessingLifecycleRepositoryContract["updateProgress"]>()
    .mockResolvedValue("updated");
  const lifecycle = new ProcessingLifecycleService({
    acquire,
    release,
    renew,
    updateProgress,
  });
  const handle = vi.fn<AnalysisPipelineHandler["handle"]>(async (_jobPayload, context) => {
    await context.updateProgress(ProcessingJobStep.Transcribing, 45);
    return { outcome: "preview_ready" };
  });
  const handler: AnalysisPipelineHandler = { handle };
  const createExecutionId = vi
    .fn<() => string>()
    .mockReturnValueOnce("worker-callback-1")
    .mockReturnValueOnce("worker-callback-2");
  const processor = new AnalysisJobProcessor(lifecycle, handler, { createExecutionId });

  return {
    acquire,
    createExecutionId,
    handle,
    processor,
    release,
    updateProgress,
  };
}

function validJob() {
  return {
    data: payload,
    id: jobId,
    name: ANALYZE_VIDEO_JOB_NAME,
  };
}

describe("AnalysisJobProcessor", () => {
  it("validates the job, acquires a fresh execution lease, and forwards token-bound progress", async () => {
    const { acquire, createExecutionId, handle, processor, updateProgress } = setup();

    await expect(processor.process(validJob())).resolves.toEqual({
      outcome: "preview_ready",
    });
    await expect(processor.process(validJob())).resolves.toEqual({
      outcome: "preview_ready",
    });

    expect(createExecutionId).toHaveBeenCalledTimes(2);
    expect(acquire).toHaveBeenNthCalledWith(1, jobId, projectId, "worker-callback-1");
    expect(acquire).toHaveBeenNthCalledWith(2, jobId, projectId, "worker-callback-2");
    const firstContext = handle.mock.calls[0]?.[1];
    expect(firstContext?.leaseToken).toBe(leaseToken);
    expect(firstContext?.signal).toBeInstanceOf(AbortSignal);
    expect(typeof firstContext?.updateProgress).toBe("function");
    expect(handle).toHaveBeenCalledWith(payload, firstContext);
    expect(updateProgress).toHaveBeenNthCalledWith(
      1,
      jobId,
      "worker-callback-1",
      leaseToken,
      ProcessingJobStep.Transcribing,
      45,
    );
  });

  it.each([
    {
      label: "wrong job name",
      job: { ...validJob(), name: "render_clips" },
    },
    {
      label: "missing BullMQ job ID",
      job: { data: payload, name: ANALYZE_VIDEO_JOB_NAME },
    },
    {
      label: "mismatched durable job ID",
      job: {
        ...validJob(),
        id: "00000000-0000-4000-8000-000000000999",
      },
    },
    {
      label: "non-object payload",
      job: { ...validJob(), data: null },
    },
    {
      label: "extra payload field",
      job: { ...validJob(), data: { ...payload, userId: "untrusted-user" } },
    },
    {
      label: "invalid project ID",
      job: { ...validJob(), data: { ...payload, projectId: "not-a-uuid" } },
    },
  ])("rejects $label before lease acquisition", async ({ job }) => {
    const { acquire, handle, processor } = setup();

    await expect(processor.process(job)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(acquire).not.toHaveBeenCalled();
    expect(handle).not.toHaveBeenCalled();
  });

  it("treats a durable rejection as unrecoverable without entering the pipeline", async () => {
    const { acquire, handle, processor } = setup();
    acquire.mockResolvedValue({
      expiresAt: null,
      leaseToken: null,
      outcome: "rejected",
    });

    await expect(processor.process(validJob())).rejects.toBeInstanceOf(UnrecoverableError);
    expect(handle).not.toHaveBeenCalled();
  });

  it("exposes a busy lease as a retryable processor failure", async () => {
    const { acquire, handle, processor } = setup();
    acquire.mockResolvedValue({
      expiresAt: null,
      leaseToken: null,
      outcome: "busy",
    });

    await expect(processor.process(validJob())).rejects.toBeInstanceOf(AnalysisJobBusyError);
    expect(handle).not.toHaveBeenCalled();
  });

  it("rejects a pipeline result that could falsely complete BullMQ", async () => {
    const { handle, processor } = setup();
    handle.mockResolvedValue(undefined as unknown as { readonly outcome: "preview_ready" });

    await expect(processor.process(validJob())).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it("preserves controlled retry release from the lifecycle boundary", async () => {
    const { handle, processor, release } = setup();
    const retryableError = new RetryableProcessingError("transient pipeline failure");
    handle.mockRejectedValue(retryableError);

    await expect(processor.process(validJob())).rejects.toBe(retryableError);
    expect(release).toHaveBeenCalledWith(jobId, "worker-callback-1", leaseToken);
  });
});
