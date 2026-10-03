import { describe, expect, it, vi } from "vitest";
import { GeminiSummarySelector } from "./gemini-summary-selector.service";
import type { GeminiModelClient } from "./gemini-clip-selector.service";

describe("Gemini summary selector", () => {
  const input = {
    sourceDurationSeconds: 100,
    transcriptSegments: [
      { sequence: 0, startTime: 0, endTime: 100, text: "A coherent explanation" },
    ],
  };
  const options = { maxRetries: 2, model: "test-model", timeoutMs: 1000 };
  const valid = JSON.stringify({
    summarySegments: [{ startTime: 10, endTime: 20, reason: "Main idea" }],
  });
  it("repairs an invalid response and returns only a fully valid selection", async () => {
    const generateContent = vi
      .fn<GeminiModelClient["generateContent"]>()
      .mockResolvedValueOnce({ text: '{"summarySegments":[]}' })
      .mockResolvedValueOnce({ text: valid });
    const result = await new GeminiSummarySelector({ generateContent }, options).select(
      input,
      new AbortController().signal,
    );
    expect(result.summarySegments).toHaveLength(1);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[1]![0].contents).toContain("Repair");
  });
  it("shares three calls between transport retry and invalid-response repair", async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(new Error("transport"))
      .mockResolvedValueOnce({ text: "{}" })
      .mockResolvedValueOnce({ text: valid });
    let count = 0;
    const attempts = { begin: vi.fn(async () => ++count), fail: vi.fn(), wait: vi.fn() };
    const result = await new GeminiSummarySelector({ generateContent }, options).select(
      input,
      new AbortController().signal,
      attempts,
    );
    expect(result.summarySegments).toHaveLength(1);
    expect(count).toBe(3);
    expect(attempts.fail.mock.calls).toEqual([["GEMINI_FAILED"], ["INVALID_AI_OUTPUT"]]);
  });
  it("fails after bounded repairs without salvaging partial ranges", async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: "{}" });
    await expect(
      new GeminiSummarySelector({ generateContent }, options).select(
        input,
        new AbortController().signal,
      ),
    ).rejects.toThrow("validation");
    expect(generateContent).toHaveBeenCalledTimes(3);
  });
  it("does not call the model after cancellation", async () => {
    const generateContent = vi.fn();
    const controller = new AbortController();
    controller.abort();
    await expect(
      new GeminiSummarySelector({ generateContent }, options).select(input, controller.signal),
    ).rejects.toThrow();
    expect(generateContent).not.toHaveBeenCalled();
  });
  it("rejects empty speech before spending a model request", async () => {
    const generateContent = vi.fn();
    await expect(
      new GeminiSummarySelector({ generateContent }, options).select(
        { ...input, transcriptSegments: [] },
        new AbortController().signal,
      ),
    ).rejects.toThrow("No speech");
    expect(generateContent).not.toHaveBeenCalled();
  });
  it("propagates transport failure to the paid-analysis lifecycle", async () => {
    const generateContent = vi.fn().mockRejectedValue(new Error("timeout"));
    await expect(
      new GeminiSummarySelector({ generateContent }, options).select(
        input,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ reason: "request_failed", cause: new Error("timeout") });
  });
});
