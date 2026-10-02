import { describe, expect, it } from "vitest";

import { PROCESSING_FAILURES, isProcessingFailureCode } from "./processing-failure";

describe("processing failure policy", () => {
  it("recognizes safe failure codes without accepting arbitrary diagnostics", () => {
    expect(isProcessingFailureCode("WHISPER_FAILED")).toBe(true);
    expect(isProcessingFailureCode("C:/private/source.mp4 failed")).toBe(false);
    expect(isProcessingFailureCode(null)).toBe(false);
  });

  it("explains eligible analysis failures and excludes cancellation", () => {
    expect(PROCESSING_FAILURES.WHISPER_FAILED.message).toContain("transcription");
    expect(PROCESSING_FAILURES.INVALID_AI_OUTPUT.message).toContain("usable preview");
    expect(PROCESSING_FAILURES.STORAGE_FAILED.refundEligible).toBe(true);
    expect(PROCESSING_FAILURES.USER_CANCELLED.refundEligible).toBe(false);
    for (const failure of Object.values(PROCESSING_FAILURES)) {
      expect(failure.message.length).toBeLessThan(500);
      expect(failure.message).not.toMatch(/stack|stderr|FFmpeg|Whisper|Gemini/u);
    }
  });
});
