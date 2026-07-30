import { describe, expect, it, vi } from "vitest";

import {
  AnalysisQueueFailureListener,
  type AnalysisQueueEventsClient,
} from "./analysis-queue-failure.listener";
import { ANALYSIS_RETRIES_EXHAUSTED } from "./processing-failure.service";

type QueueEventListener = (
  args: { readonly jobId: string },
  eventId: string,
) => Promise<void> | void;

function setup() {
  const eventListeners = new Map<string, QueueEventListener>();
  const close = vi.fn().mockResolvedValue(undefined);
  const on = vi.fn((event: string, listener: QueueEventListener) => {
    eventListeners.set(event, listener);
    return client;
  });
  const client = {
    close,
    on,
    waitUntilReady: vi.fn().mockResolvedValue(undefined),
  } as unknown as AnalysisQueueEventsClient;
  const recordTerminalFailure = vi.fn().mockResolvedValue("persisted");
  const listener = new AnalysisQueueFailureListener({ recordTerminalFailure } as never, client);

  return { close, eventListeners, listener, on, recordTerminalFailure };
}

describe("AnalysisQueueFailureListener", () => {
  it("persists terminal retry exhaustion before returning from the event handler", async () => {
    const { close, eventListeners, listener, recordTerminalFailure } = setup();

    await listener.onModuleInit();
    await eventListeners.get("retries-exhausted")?.(
      { jobId: "00000000-0000-4000-8000-000000000751" },
      "1785290000000-0",
    );

    expect(recordTerminalFailure).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000751",
      ANALYSIS_RETRIES_EXHAUSTED,
      "queue-event:1785290000000-0",
    );
    await listener.onModuleDestroy();
    expect(close).toHaveBeenCalledOnce();
  });

  it("persists duplicate retry-exhausted events instead of relying on process timers", async () => {
    const { eventListeners, listener, recordTerminalFailure } = setup();
    const jobId = "00000000-0000-4000-8000-000000000752";

    await listener.onModuleInit();
    await eventListeners.get("retries-exhausted")?.({ jobId }, "1785290000001-0");
    await eventListeners.get("retries-exhausted")?.({ jobId }, "1785290000002-0");

    expect(recordTerminalFailure).toHaveBeenCalledTimes(2);
    expect(recordTerminalFailure).toHaveBeenLastCalledWith(
      jobId,
      ANALYSIS_RETRIES_EXHAUSTED,
      "queue-event:1785290000002-0",
    );
    await listener.onModuleDestroy();
  });

  it("uses QueueEvents only for errors and terminal retry exhaustion", async () => {
    const { listener, on } = setup();

    await listener.onModuleInit();

    expect(on).toHaveBeenCalledTimes(2);
    expect(on).toHaveBeenCalledWith("error", expect.any(Function));
    expect(on).toHaveBeenCalledWith("retries-exhausted", expect.any(Function));
    expect(on).not.toHaveBeenCalledWith("active", expect.any(Function));
    expect(on).not.toHaveBeenCalledWith("progress", expect.any(Function));
    await listener.onModuleDestroy();
  });
});
