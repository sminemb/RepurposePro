import { describe, expect, it } from "vitest";

import { getProjectCardAction } from "./project-card-action";

describe("getProjectCardAction", () => {
  it("routes pre-processing projects to upload", () => {
    expect(getProjectCardAction("project-1", "uploaded")).toEqual({
      href: "/projects/project-1/upload",
      label: "Continue project",
    });
  });

  it.each(["queued", "transcribing", "analyzing"] as const)(
    "routes %s projects to their persisted processing page",
    (status) => {
      expect(getProjectCardAction("project/1", status)).toEqual({
        href: "/projects/project%2F1/processing",
        label: "View processing",
      });
    },
  );

  it("routes renders and completed exports to downloads", () => {
    expect(getProjectCardAction("project/1", "rendering")).toEqual({
      href: "/projects/project%2F1/outputs",
      label: "View render",
    });
    expect(getProjectCardAction("project/1", "completed")).toEqual({
      href: "/projects/project%2F1/outputs",
      label: "View exports",
    });
  });

  it("routes preview-ready projects to browser clips", () => {
    expect(getProjectCardAction("project/1", "preview_ready")).toEqual({
      href: "/projects/project%2F1/clips",
      label: "Review clips",
    });
  });
});
