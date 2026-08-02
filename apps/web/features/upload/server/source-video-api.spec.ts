import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SourceVideoMetadata } from "@repurposepro/shared";

const { requestApiMock } = vi.hoisted(() => ({ requestApiMock: vi.fn() }));

vi.mock("@/lib/server-api", () => ({ requestApi: requestApiMock }));
vi.mock("server-only", () => ({}));

import { getSavedSourceVideo } from "./source-video-api";

const sourceVideo: SourceVideoMetadata = {
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
};

describe("getSavedSourceVideo", () => {
  beforeEach(() => requestApiMock.mockReset());

  it("returns persisted metadata from the encoded project endpoint", async () => {
    requestApiMock.mockResolvedValue(Response.json({ data: sourceVideo }));

    await expect(getSavedSourceVideo("project/1")).resolves.toEqual({
      kind: "success",
      metadata: sourceVideo,
    });
    expect(requestApiMock).toHaveBeenCalledWith("/projects/project%2F1/video");
  });

  it("treats a missing source video as an upload-ready project", async () => {
    requestApiMock.mockResolvedValue(Response.json({ error: {} }, { status: 404 }));

    await expect(getSavedSourceVideo("project-1")).resolves.toEqual({ kind: "missing" });
  });

  it("separates expired authentication from source video availability failures", async () => {
    requestApiMock.mockResolvedValue(Response.json({ error: {} }, { status: 401 }));

    await expect(getSavedSourceVideo("project-1")).resolves.toEqual({
      kind: "unauthenticated",
    });
  });

  it.each([
    ["a malformed success payload", Response.json({ data: { fileName: "episode.mp4" } })],
    ["an unavailable API response", Response.json({ error: {} }, { status: 503 })],
  ])("does not enable a new upload after %s", async (_scenario, response) => {
    requestApiMock.mockResolvedValue(response);

    await expect(getSavedSourceVideo("project-1")).resolves.toMatchObject({
      kind: "unavailable",
    });
  });

  it("does not enable a new upload when the metadata response cannot be read", async () => {
    requestApiMock.mockResolvedValue({
      json: () => Promise.reject(new Error("network unavailable")),
      ok: true,
      status: 200,
    });

    await expect(getSavedSourceVideo("project-1")).resolves.toMatchObject({
      kind: "unavailable",
    });
  });
});
