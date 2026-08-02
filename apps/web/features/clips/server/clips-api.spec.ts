import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestApiMock } = vi.hoisted(() => ({ requestApiMock: vi.fn() }));

vi.mock("@/lib/server-api", () => ({ requestApi: requestApiMock }));
vi.mock("server-only", () => ({}));

import { getProjectClips } from "./clips-api";

const projectId = "00000000-0000-4000-8000-000000004001";
const validClip = {
  captionLines: [{ endTime: 15, startTime: 0, text: "Caption" }],
  captionPosition: { x: 0.5, y: 0.72 },
  captionStyle: "hormozi",
  captionsEnabled: true,
  crop: null,
  endTime: 15,
  id: "00000000-0000-4000-8000-000000004002",
  previewFontSize: 48,
  rank: 0,
  score: 0.9,
  startTime: 0,
  title: "Opening",
} as const;

describe("getProjectClips", () => {
  beforeEach(() => {
    requestApiMock.mockReset();
    vi.restoreAllMocks();
  });

  it("returns validated primary preview metadata from the encoded endpoint", async () => {
    requestApiMock.mockResolvedValue(
      Response.json({
        data: {
          clips: [validClip],
          projectId,
          sourceDurationSeconds: 30,
        },
      }),
    );

    await expect(getProjectClips(projectId)).resolves.toMatchObject({
      clips: { clips: [{ title: "Opening" }] },
      kind: "success",
    });
    expect(requestApiMock).toHaveBeenCalledWith(`/projects/${projectId}/clips`);
  });

  it("rejects malformed or oversized API results", async () => {
    requestApiMock.mockResolvedValueOnce(
      Response.json({ data: { clips: [], projectId, sourceDurationSeconds: "not-a-number" } }),
    );
    await expect(getProjectClips(projectId)).resolves.toEqual({ kind: "unavailable" });

    requestApiMock.mockResolvedValueOnce(
      Response.json({
        data: {
          clips: Array.from({ length: 11 }, () => ({})),
          projectId,
          sourceDurationSeconds: 30,
        },
      }),
    );
    await expect(getProjectClips(projectId)).resolves.toEqual({ kind: "unavailable" });
  });

  it.each([
    ["score", { ...validClip, score: 1.1 }],
    ["font size", { ...validClip, previewFontSize: 8 }],
    ["source range", { ...validClip, endTime: 31 }],
    [
      "caption range",
      { ...validClip, captionLines: [{ endTime: 20, startTime: 0, text: "Caption" }] },
    ],
    ["crop bounds", { ...validClip, crop: { height: 1, width: 0.3, x: 0.8, y: 0 } }],
  ])("rejects %s outside the clip response contract", async (_name, clip) => {
    requestApiMock.mockResolvedValue(
      Response.json({
        data: { clips: [clip], projectId, sourceDurationSeconds: 30 },
      }),
    );

    await expect(getProjectClips(projectId)).resolves.toEqual({ kind: "unavailable" });
  });

  it.each([
    [401, "unauthenticated"],
    [404, "not_found"],
    [503, "unavailable"],
  ])("maps API status %s to %s", async (status, kind) => {
    requestApiMock.mockResolvedValue(Response.json({}, { status }));
    await expect(getProjectClips(projectId)).resolves.toMatchObject({ kind });
  });

  it("logs request failures with the project identifier", async () => {
    const failure = new Error("request failed");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    requestApiMock.mockRejectedValue(failure);

    await expect(getProjectClips(projectId)).resolves.toEqual({ kind: "unavailable" });
    expect(error).toHaveBeenCalledWith("Project clips request failed.", {
      error: failure,
      projectId,
    });
  });
});
