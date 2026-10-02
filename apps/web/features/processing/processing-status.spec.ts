import type { ProjectProcessingStatus } from "@repurposepro/shared";
import { describe, expect, it } from "vitest";
import { isProjectProcessingStatus, isTerminalProcessingStatus } from "./processing-status";

const snapshot: ProjectProcessingStatus = {
  projectId: "project",
  status: "failed",
  currentJob: {
    id: "job",
    status: "failed",
    step: "failed",
    progress: null,
    failure: {
      code: "WHISPER_FAILED",
      message: "Transcription failed.",
      refundStatus: "pending",
      refundedCredits: 0,
      refundCompletedAt: null,
    },
  },
};
describe("refund status validation", () => {
  it("keeps polling a pending refund even when processing has failed", () => {
    expect(isTerminalProcessingStatus(snapshot)).toBe(false);
    expect(
      isTerminalProcessingStatus({
        ...snapshot,
        currentJob: {
          ...snapshot.currentJob!,
          failure: {
            ...snapshot.currentJob!.failure!,
            refundStatus: "completed",
            refundedCredits: 11,
            refundCompletedAt: "2026-10-02T12:00:00.000Z",
          },
        },
      }),
    ).toBe(true);
  });
  it("rejects malformed credit amounts and fabricated pending completion", () => {
    expect(
      isProjectProcessingStatus(
        {
          ...snapshot,
          currentJob: {
            ...snapshot.currentJob!,
            failure: { ...snapshot.currentJob!.failure!, refundedCredits: -1 },
          },
        },
        "project",
      ),
    ).toBe(false);
    expect(
      isProjectProcessingStatus(
        {
          ...snapshot,
          currentJob: {
            ...snapshot.currentJob!,
            failure: { ...snapshot.currentJob!.failure!, refundedCredits: 11 },
          },
        },
        "project",
      ),
    ).toBe(false);
  });
});
