import { describe, expect, it } from "vitest";

import { getProjectStatusPresentation } from "./status-badge-config";

describe("getProjectStatusPresentation", () => {
  it.each([
    ["draft", "Draft"],
    ["queued", "Queued"],
    ["transcribing", "Transcribing"],
    ["analyzing", "Analyzing"],
    ["completed", "Completed"],
    ["failed", "Failed"],
  ] as const)("maps %s to %s", (status, label) => {
    expect(getProjectStatusPresentation(status).label).toBe(label);
  });
});
