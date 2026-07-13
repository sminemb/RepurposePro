import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSourceVideoMetadataEndpoint,
  createUploadEndpoint,
  getSourceVideoMetadata,
  toUploadProgress,
} from "./upload-video";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createUploadEndpoint", () => {
  it("targets the project-scoped multipart upload endpoint", () => {
    expect(createUploadEndpoint("http://localhost:4000/api/v1/", "project/123")).toBe(
      "http://localhost:4000/api/v1/projects/project%2F123/upload",
    );
  });
});

describe("createSourceVideoMetadataEndpoint", () => {
  it("targets the owned source-video metadata endpoint", () => {
    expect(createSourceVideoMetadataEndpoint("http://localhost:4000/api/v1/", "project/123")).toBe(
      "http://localhost:4000/api/v1/projects/project%2F123/video",
    );
  });
});

describe("getSourceVideoMetadata", () => {
  it("uses the authenticated endpoint and unwraps its success envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            durationSeconds: 60.001,
            expiresAt: "2026-07-20T02:00:00.000Z",
            fileName: "episode.mp4",
            fileSizeBytes: 1024,
            fps: 30,
            hasAudio: true,
            height: 1080,
            id: "video-1",
            requiredCredits: 2,
            width: 1920,
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getSourceVideoMetadata({ apiUrl: "http://localhost:4000/api/v1", projectId: "project-1" }),
    ).resolves.toMatchObject({ fileName: "episode.mp4", requiredCredits: 2 });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/projects/project-1/video",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
  });

  it("uses the API error message so metadata loading can be retried without another upload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "Project or source video not found." } }), {
          status: 404,
        }),
      ),
    );

    await expect(
      getSourceVideoMetadata({ apiUrl: "http://localhost:4000/api/v1", projectId: "project-1" }),
    ).rejects.toThrow("Project or source video not found.");
  });

  it("uses a metadata-specific fallback when the error response is not usable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Unexpected failure", { status: 500 })),
    );

    await expect(
      getSourceVideoMetadata({ apiUrl: "http://localhost:4000/api/v1", projectId: "project-1" }),
    ).rejects.toThrow("We could not load your validated video details. Try again.");
  });

  it("allows metadata loading to be retried without another upload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("Temporary failure", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { fileName: "episode.mp4", requiredCredits: 2 } }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getSourceVideoMetadata({ apiUrl: "http://localhost:4000/api/v1", projectId: "project-1" }),
    ).rejects.toThrow("We could not load your validated video details. Try again.");
    await expect(
      getSourceVideoMetadata({ apiUrl: "http://localhost:4000/api/v1", projectId: "project-1" }),
    ).resolves.toMatchObject({ fileName: "episode.mp4", requiredCredits: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
