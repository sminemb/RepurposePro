import { describe, expect, it } from "vitest";

import { createUploadEndpoint, toUploadProgress } from "./upload-video";

describe("createUploadEndpoint", () => {
  it("targets the project-scoped multipart upload endpoint", () => {
    expect(createUploadEndpoint("http://localhost:4000/api/v1/", "project/123")).toBe(
      "http://localhost:4000/api/v1/projects/project%2F123/upload",
    );
  });
});

describe("toUploadProgress", () => {
  it("rounds trustworthy byte progress down to a whole percentage", () => {
    expect(toUploadProgress(499, 1_000)).toEqual({
      loadedBytes: 499,
      percent: 49,
      totalBytes: 1_000,
    });
  });

  it("does not invent a percentage when the total is unavailable", () => {
    expect(toUploadProgress(400, 0)).toEqual({ loadedBytes: 400, percent: null, totalBytes: null });
  });
});
