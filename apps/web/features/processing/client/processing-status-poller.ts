import type { ProjectProcessingStatus } from "@repurposepro/shared";

import { isPreviewReady, isTerminalProcessingStatus } from "../processing-status";

export interface ProcessingStatusPollerOptions {
  readonly getVisibilityState: () => DocumentVisibilityState;
  readonly intervalMs?: number;
  readonly load: (signal: AbortSignal) => Promise<ProjectProcessingStatus>;
  readonly onFailure: () => void;
  readonly onPreviewReady: (snapshot: ProjectProcessingStatus) => void;
  readonly onSnapshot: (snapshot: ProjectProcessingStatus) => void;
  readonly subscribeVisibility: (listener: () => void) => () => void;
  readonly timeoutMs?: number;
}

export interface ProcessingStatusPoller {
  start(): void;
  stop(): void;
}

export function createProcessingStatusPoller(
  options: ProcessingStatusPollerOptions,
): ProcessingStatusPoller {
  const intervalMs = options.intervalMs ?? 3_000;
  const timeoutMs = options.timeoutMs ?? 10_000;
  let abortController: AbortController | undefined;
  let generation = 0;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribeVisibility: (() => void) | undefined;

  const clearTimer = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const stop = (): void => {
    if (!running && !unsubscribeVisibility) return;
    running = false;
    generation += 1;
    clearTimer();
    abortController?.abort();
    abortController = undefined;
    unsubscribeVisibility?.();
    unsubscribeVisibility = undefined;
  };

  const schedule = (currentGeneration: number): void => {
    if (!running || generation !== currentGeneration || options.getVisibilityState() === "hidden") {
      return;
    }
    clearTimer();
    timer = setTimeout(() => {
      timer = undefined;
      void poll();
    }, intervalMs);
  };

  const poll = async (): Promise<void> => {
    if (!running || options.getVisibilityState() === "hidden") return;
    const currentGeneration = generation;
    const currentAbortController = new AbortController();
    abortController = currentAbortController;
    let deadlineTriggered = false;
    let onAbort: (() => void) | undefined;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;

    try {
      const timeoutError = new Error("Processing status request timed out.");
      const deadline = new Promise<never>((_resolve, reject) => {
        deadlineTimer = setTimeout(() => {
          deadlineTriggered = true;
          currentAbortController.abort(timeoutError);
          reject(timeoutError);
        }, timeoutMs);
      });
      const cancellation = new Promise<never>((_resolve, reject) => {
        onAbort = () => {
          const reason = currentAbortController.signal.reason as unknown;
          reject(
            reason instanceof Error ? reason : new Error("Polling stopped.", { cause: reason }),
          );
        };
        currentAbortController.signal.addEventListener("abort", onAbort, { once: true });
      });
      const snapshot = await Promise.race([
        options.load(currentAbortController.signal),
        deadline,
        cancellation,
      ]);
      if (!running || generation !== currentGeneration || currentAbortController.signal.aborted) {
        return;
      }
      options.onSnapshot(snapshot);
      if (isPreviewReady(snapshot)) {
        options.onPreviewReady(snapshot);
        stop();
        return;
      }
      if (isTerminalProcessingStatus(snapshot)) {
        stop();
        return;
      }
    } catch {
      if (
        running &&
        generation === currentGeneration &&
        (deadlineTriggered || !currentAbortController.signal.aborted)
      ) {
        options.onFailure();
      }
    } finally {
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
      if (onAbort) currentAbortController.signal.removeEventListener("abort", onAbort);
      if (abortController === currentAbortController) abortController = undefined;
      schedule(currentGeneration);
    }
  };

  const visibilityChanged = (): void => {
    if (!running) return;
    generation += 1;
    clearTimer();
    abortController?.abort();
    abortController = undefined;
    if (options.getVisibilityState() !== "hidden") void poll();
  };

  return {
    start: () => {
      if (running) return;
      running = true;
      generation += 1;
      unsubscribeVisibility = options.subscribeVisibility(visibilityChanged);
      if (options.getVisibilityState() !== "hidden") void poll();
    },
    stop,
  };
}
