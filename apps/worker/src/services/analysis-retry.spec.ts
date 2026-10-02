import { describe, expect, it, vi } from "vitest";
import { beginAnalysisAttempt, classifyAnalysisFailure, selectionAttempts } from "./analysis-retry";
import type { ProcessingLeaseContext } from "./processing-lifecycle.service";

describe("paid analysis retry control", () => {
  it("classifies stage failures without trusting diagnostics", () => {
    expect(classifyAnalysisFailure({ name: "WhisperTranscriptionError", reason: "timeout" })).toBe(
      "WHISPER_FAILED",
    );
    expect(
      classifyAnalysisFailure({ name: "WhisperTranscriptionError", reason: "storage_failed" }),
    ).toBe("STORAGE_FAILED");
    expect(
      classifyAnalysisFailure({
        name: "TranscriptionAudioExtractionError",
        reason: "ffmpeg_failed",
      }),
    ).toBe("AUDIO_EXTRACTION_FAILED");
    expect(
      classifyAnalysisFailure({ name: "GeminiClipSelectionError", reason: "no_usable_candidates" }),
    ).toBe("INVALID_AI_OUTPUT");
    expect(classifyAnalysisFailure(new Error("private/source.mp4"))).toBe(
      "WORKER_PERMANENT_FAILURE",
    );
  });
  it("does not reset an exhausted durable budget or accept stale ownership", async () => {
    const context = {
      beginAttempt: vi
        .fn()
        .mockResolvedValue({ outcome: "exhausted", attempt: 3, failureCode: "GEMINI_FAILED" }),
      signal: new AbortController().signal,
    } as unknown as ProcessingLeaseContext;
    await expect(beginAnalysisAttempt(context, "selection")).rejects.toMatchObject({
      code: "GEMINI_FAILED",
    });
    context.beginAttempt = vi
      .fn()
      .mockResolvedValue({ outcome: "lost", attempt: 0, failureCode: null });
    await expect(beginAnalysisAttempt(context, "selection")).rejects.toMatchObject({
      name: "ProcessingLeaseLostError",
    });
  });
  it("respects aborts during backoff and records safe selection errors", async () => {
    const controller = new AbortController();
    const failure = vi.fn().mockResolvedValue(undefined);
    const context = {
      signal: controller.signal,
      beginAttempt: vi.fn(),
      recordAttemptFailure: failure,
    } as unknown as ProcessingLeaseContext;
    const attempts = selectionAttempts(context)!;
    await attempts.fail("INVALID_AI_OUTPUT");
    expect(failure).toHaveBeenCalledWith("selection", "INVALID_AI_OUTPUT");
    controller.abort(new Error("lease lost"));
    await expect(attempts.wait(1)).rejects.toThrow();
  });
});
