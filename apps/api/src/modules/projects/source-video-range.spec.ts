import { describe, expect, it } from "vitest";

import { createSourceVideoResponsePlan } from "./source-video-range";

describe("createSourceVideoResponsePlan", () => {
  it("returns a complete response when no range is requested", () => {
    expect(createSourceVideoResponsePlan(undefined, 10)).toEqual({
      contentLength: 10,
      contentRange: null,
      end: 9,
      start: 0,
      status: 200,
    });
  });

  it.each([
    ["bytes=2-5", 2, 5, 4],
    ["bytes=4-", 4, 9, 6],
    ["bytes=-3", 7, 9, 3],
    ["bytes=-20", 0, 9, 10],
    ["bytes=7-20", 7, 9, 3],
  ])("returns a satisfiable single range for %s", (header, start, end, contentLength) => {
    expect(createSourceVideoResponsePlan(header, 10)).toEqual({
      contentLength,
      contentRange: `bytes ${start}-${end}/10`,
      end,
      start,
      status: 206,
    });
  });

  it.each(["bytes=10-", "bytes=5-3", "bytes=-0", "bytes=0-1,3-4", "items=0-1", "bytes=-"])(
    "returns 416 for %s",
    (header) => {
      expect(createSourceVideoResponsePlan(header, 10)).toEqual({
        contentRange: "bytes */10",
        status: 416,
      });
    },
  );
});
