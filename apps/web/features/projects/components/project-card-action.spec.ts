import { describe, expect, it } from "vitest";

import { getProjectCardAction } from "./project-card-action";

describe("getProjectCardAction", () => {
  it("routes pre-processing projects to upload", () => {
    expect(getProjectCardAction("project-1", "uploaded")).toEqual({
      href: "/projects/project-1/upload",
      label: "Continue project",
    });
  });

  it.each(["queued", "transcribing", "analyzing", "rendering"] as const)(
    "routes %s projects to their persisted processing page",
    (status) => {
      expect(getProjectCardAction("project/1", status)).toEqual({
        href: "/projects/project%2F1/processing",
        label: "View processing",
      });
    },
  );
});
