import { ProcessingJobStep } from "@repurposepro/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ProcessingLeaseLostError,
  type ProcessingLeaseContext,
  ProcessingLifecycleService,
  RetryableProcessingError,
} from "./processing-lifecycle.service";
import type { ProcessingLifecycleRepositoryContract } from "./processing-lifecycle.repository";

const expiresAt = new Date("2026-07-30T09:01:00.000Z");
const jobId = "00000000-0000-4000-8000-000000000801";
const leaseToken = "00000000-0000-4000-8000-000000000802";
const projectId = "00000000-0000-4000-8000-000000000803";
const workerId = "worker-test";

function setup() {
  const acquire = vi.fn<ProcessingLifecycleRepositoryContract["acquire"]>().mockResolvedValue({
    expiresAt,
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
  const repository: ProcessingLifecycleRepositoryContract = {
    acquire,
    release,
    renew,
    updateProgress,
  };
  const service = new ProcessingLifecycleService(repository, {
    heartbeatIntervalMs: 15_000,
    heartbeatRetryMs: 1_000,
    leaseLifetimeMs: 60_000,
    leaseSafetyMs: 1_000,
  });

  return { acquire, release, renew, service, updateProgress };
}

describe("ProcessingLifecycleService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T09:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("acquires before entering the protected handler and supplies the lease token to progress", async () => {
    const { acquire, service, updateProgress } = setup();
    const handler = vi.fn(async (context: ProcessingLeaseContext) => {
      expect(acquire).toHaveBeenCalledOnce();
      expect(context.workerId).toBe(workerId);
      await context.updateProgress(ProcessingJobStep.Transcribing, 45);
      return "done";
    });

    await expect(service.execute(jobId, projectId, workerId, handler)).resolves.toEqual({
      outcome: "completed",
      value: "done",
    });

    expect(updateProgress).toHaveBeenCalledWith(
      jobId,
      workerId,
      leaseToken,
      ProcessingJobStep.Transcribing,
      45,
    );
  });

  it("heartbeats every 15 seconds without overlapping renewals", async () => {
    const { renew, service } = setup();
    let finishHandler: (() => void) | undefined;
    let finishRenewal: (() => void) | undefined;
    renew.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRenewal = () => resolve("renewed");
        }),
    );
    const execution = service.execute(
      jobId,
      projectId,
      workerId,
      () =>
        new Promise((resolve) => {
          finishHandler = () => resolve("done");
        }),
    );

    await vi.advanceTimersByTimeAsync(15_000);
    expect(renew).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(renew).toHaveBeenCalledOnce();

    finishRenewal?.();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(renew).toHaveBeenCalledTimes(2);

    finishRenewal?.();
    finishHandler?.();
    await expect(execution).resolves.toMatchObject({ outcome: "completed" });
  });

  it("aborts protected work immediately when renewal loses the token", async () => {
    const { renew, service } = setup();
    renew.mockResolvedValue("lost");
    const execution = service.execute(jobId, projectId, workerId, ({ signal }) => {
      return new Promise((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () =>
            reject(
              signal.reason instanceof Error
                ? signal.reason
                : new Error("Processing execution was aborted."),
            ),
          { once: true },
        );
      });
    });
    const rejection = expect(execution).rejects.toBeInstanceOf(ProcessingLeaseLostError);

    await vi.advanceTimersByTimeAsync(15_000);

    await rejection;
  });

  it("retries transient renewal errors only before the known lease safety boundary", async () => {
    const { renew, service } = setup();
    renew.mockRejectedValue(new Error("temporary database outage"));
    const execution = service.execute(jobId, projectId, workerId, ({ signal }) => {
      return new Promise((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () =>
            reject(
              signal.reason instanceof Error
                ? signal.reason
                : new Error("Processing execution was aborted."),
            ),
          { once: true },
        );
      });
    });
    const rejection = expect(execution).rejects.toBeInstanceOf(ProcessingLeaseLostError);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(renew).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(43_000);
    expect(renew.mock.calls.length).toBeGreaterThan(1);
    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
  });

  it("releases the exact lease before surfacing a retryable handler failure", async () => {
    const { release, service } = setup();

    await expect(
      service.execute(jobId, projectId, workerId, async () => {
        throw new RetryableProcessingError("retry this handler");
      }),
    ).rejects.toBeInstanceOf(RetryableProcessingError);

    expect(release).toHaveBeenCalledWith(jobId, workerId, leaseToken);
  });

  it("does not enter the handler when another worker owns a valid lease", async () => {
    const { acquire, service } = setup();
    acquire.mockResolvedValue({
      expiresAt: null,
      leaseToken: null,
      outcome: "busy",
    });
    const handler = vi.fn();

    await expect(service.execute(jobId, projectId, workerId, handler)).resolves.toEqual({
      outcome: "not_acquired",
      reason: "busy",
    });
    expect(handler).not.toHaveBeenCalled();
  });
});
