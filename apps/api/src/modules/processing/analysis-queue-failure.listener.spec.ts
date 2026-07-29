import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AnalysisQueueFailureListener,
  type AnalysisQueueEventsClient,
} from "./analysis-queue-failure.listener";
import { ANALYSIS_RETRIES_EXHAUSTED } from "./processing-failure.service";

describe("AnalysisQueueFailureListener", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("finalizes automatic refunds only when BullMQ reports terminal retry exhaustion", async () => {
    let exhausted: ((args: { readonly jobId: string }, eventId: string) => void) | undefined;
    const close = vi.fn().mockResolvedValue(undefined);
    const waitUntilReady = vi.fn().mockResolvedValue(undefined);
    const on = vi.fn(
      (
        event: "error" | "retries-exhausted",
        listener:
          ((error: Error) => void) | ((args: { readonly jobId: string }, eventId: string) => void),
      ) => {
        if (event === "retries-exhausted") {
          exhausted = listener as (args: { readonly jobId: string }, eventId: string) => void;
        }
        return client;
      },
    );
    const client = {
      close,
      on,
      waitUntilReady,
    } as unknown as AnalysisQueueEventsClient;
    const handleTerminalFailure = vi.fn().mockResolvedValue({
      outcome: "refunded",
      refundedCredits: 11,
    });
    const listener = new AnalysisQueueFailureListener({ handleTerminalFailure } as never, client);

    await listener.onModuleInit();
    exhausted?.({ jobId: "00000000-0000-4000-8000-000000000751" }, "1785290000000-0");
    await vi.waitFor(() => expect(handleTerminalFailure).toHaveBeenCalledOnce());

    expect(handleTerminalFailure).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000751",
      ANALYSIS_RETRIES_EXHAUSTED,
      "queue-event:1785290000000-0",
    );
    await listener.onModuleDestroy();
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps retrying a transient refund finalization failure without another queue event", async () => {
    vi.useFakeTimers();
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    let exhausted: ((args: { readonly jobId: string }, eventId: string) => void) | undefined;
    const client = {
      close: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(
        (
          event: "error" | "retries-exhausted",
          listener:
            | ((error: Error) => void)
            | ((args: { readonly jobId: string }, eventId: string) => void),
        ) => {
          if (event === "retries-exhausted") {
            exhausted = listener as (args: { readonly jobId: string }, eventId: string) => void;
          }
          return client;
        },
      ),
      waitUntilReady: vi.fn().mockResolvedValue(undefined),
    } as unknown as AnalysisQueueEventsClient;
    const handleTerminalFailure = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary database failure"))
      .mockResolvedValue({ outcome: "refunded", refundedCredits: 11 });
    const listener = new AnalysisQueueFailureListener({ handleTerminalFailure } as never, client);
    const jobId = "00000000-0000-4000-8000-000000000752";

    await listener.onModuleInit();
    exhausted?.({ jobId }, "1785290000001-0");
    await vi.advanceTimersByTimeAsync(0);
    expect(handleTerminalFailure).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(handleTerminalFailure).toHaveBeenCalledTimes(2);
    expect(handleTerminalFailure).toHaveBeenLastCalledWith(
      jobId,
      ANALYSIS_RETRIES_EXHAUSTED,
      "queue-event:1785290000001-0",
    );
    await listener.onModuleDestroy();
  });
});
