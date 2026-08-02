import type { ProjectProcessingStatus } from "@repurposepro/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createProcessingStatusPoller } from "./processing-status-poller";

const projectId = "00000000-0000-4000-8000-000000002101";
const active: ProjectProcessingStatus = {
  currentJob: {
    id: "00000000-0000-4000-8000-000000002102",
    progress: 45,
    status: "active",
    step: "transcribing",
  },
  projectId,
  status: "transcribing",
};
const previewReady: ProjectProcessingStatus = {
  currentJob: { ...active.currentJob!, progress: 100, status: "completed", step: "preview_ready" },
  projectId,
  status: "preview_ready",
};

describe("processing status poller", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("polls immediately and then every three seconds without overlapping", async () => {
    let resolveLoad: ((snapshot: ProjectProcessingStatus) => void) | undefined;
    const harness = setupPoller([active], {
      load: vi.fn(
        () =>
          new Promise<ProjectProcessingStatus>((resolve) => {
            resolveLoad = resolve;
          }),
      ),
    });
    harness.poller.start();
    await settle();
    expect(harness.load).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(3_000);
    expect(harness.load).toHaveBeenCalledOnce();

    resolveLoad?.(active);
    await settle();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(harness.load).toHaveBeenCalledTimes(2);
    harness.poller.stop();
  });

  it("aborts a hung load at the deadline, reports failure, and resumes polling", async () => {
    let firstSignal: AbortSignal | undefined;
    const load = vi.fn((signal: AbortSignal) => {
      firstSignal ??= signal;
      return new Promise<ProjectProcessingStatus>(() => undefined);
    });
    const harness = setupPoller([active], { load, timeoutMs: 1_000 });
    harness.poller.start();
    await settle();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(firstSignal?.aborted).toBe(true);
    expect(harness.onFailure).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(load).toHaveBeenCalledTimes(2);
    harness.poller.stop();
  });

  it("does not report ordinary cancellation as a deadline failure", async () => {
    let signal: AbortSignal | undefined;
    const harness = setupPoller([active], {
      load: vi.fn((currentSignal: AbortSignal) => {
        signal = currentSignal;
        return new Promise<ProjectProcessingStatus>(() => undefined);
      }),
      timeoutMs: 1_000,
    });
    harness.poller.start();
    await settle();

    harness.poller.stop();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(signal?.aborted).toBe(true);
    expect(harness.onFailure).not.toHaveBeenCalled();
  });

  it("pauses while hidden and refreshes immediately when visible again", async () => {
    const harness = setupPoller();
    harness.poller.start();
    await settle();
    harness.setVisibility("hidden");

    await vi.advanceTimersByTimeAsync(12_000);
    expect(harness.load).toHaveBeenCalledOnce();
    harness.setVisibility("visible");
    await settle();
    expect(harness.load).toHaveBeenCalledTimes(2);
    harness.poller.stop();
  });

  it("stops and redirects exactly once when previews become ready", async () => {
    const harness = setupPoller([active, previewReady]);
    harness.poller.start();
    await settle();
    await vi.advanceTimersByTimeAsync(3_000);

    expect(harness.onPreviewReady).toHaveBeenCalledOnce();
    expect(harness.onSnapshot).toHaveBeenLastCalledWith(previewReady);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(harness.load).toHaveBeenCalledTimes(2);
  });

  it("stops on a non-preview terminal state", async () => {
    const failed: ProjectProcessingStatus = {
      currentJob: { ...active.currentJob!, status: "failed", step: "failed" },
      projectId,
      status: "failed",
    };
    const harness = setupPoller([failed]);
    harness.poller.start();
    await settle();
    await vi.advanceTimersByTimeAsync(12_000);

    expect(harness.load).toHaveBeenCalledOnce();
    expect(harness.onPreviewReady).not.toHaveBeenCalled();
  });
});

function setupPoller(
  responses: readonly ProjectProcessingStatus[] = [active],
  options: {
    readonly load?: (signal: AbortSignal) => Promise<ProjectProcessingStatus>;
    readonly timeoutMs?: number;
  } = {},
) {
  let visibility: DocumentVisibilityState = "visible";
  let visibilityListener: (() => void) | undefined;
  let responseIndex = 0;
  const load = vi.fn(
    options.load ?? (async () => responses[responseIndex++] ?? responses.at(-1) ?? active),
  );
  const onPreviewReady = vi.fn();
  const onFailure = vi.fn();
  const onSnapshot = vi.fn();
  const poller = createProcessingStatusPoller({
    getVisibilityState: () => visibility,
    load,
    onFailure,
    onPreviewReady,
    onSnapshot,
    subscribeVisibility: (listener) => {
      visibilityListener = listener;
      return () => {
        visibilityListener = undefined;
      };
    },
    timeoutMs: options.timeoutMs,
  });

  return {
    load,
    onFailure,
    onPreviewReady,
    onSnapshot,
    poller,
    setVisibility: (next: DocumentVisibilityState) => {
      visibility = next;
      visibilityListener?.();
    },
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
