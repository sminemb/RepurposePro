import { describe, expect, it } from "vitest";

import {
  decodeProjectsCursor,
  encodeProjectsCursor,
  parseCreateProjectInput,
  parseListProjectsInput,
  parseSourceVideoUpload,
} from "./projects.contracts";

const sourceVideo = {
  mimetype: "video/mp4",
  originalname: "episode.mp4",
  path: "C:/private/staging/upload",
  size: 1024,
};

describe("project contract validation", () => {
  it("trims a valid project name and accepts either supported output type", () => {
    expect(parseCreateProjectInput({ name: "  Creator breakdown  ", outputType: "clips" })).toEqual(
      {
        name: "Creator breakdown",
        outputType: "clips",
      },
    );
  });

  it("rejects empty and overlong project names", () => {
    expect(() => parseCreateProjectInput({ name: "   ", outputType: "clips" })).toThrow(
      "Project name must be between 1 and 120 characters.",
    );
    expect(() => parseCreateProjectInput({ name: "a".repeat(121), outputType: "summary" })).toThrow(
      "Project name must be between 1 and 120 characters.",
    );
  });

  it("uses safe list defaults and accepts documented filters", () => {
    expect(
      parseListProjectsInput({ limit: "5", outputType: "summary", status: "draft" }),
    ).toMatchObject({ limit: 5, outputType: "summary", status: "draft" });
    expect(parseListProjectsInput({})).toMatchObject({ limit: 20 });
  });

  it("rejects malformed pagination parameters", () => {
    expect(() => parseListProjectsInput({ cursor: "invalid", limit: "51" })).toThrow(
      "Invalid project list query.",
    );
  });

  it("round-trips a cursor used for newest-first ordering", () => {
    const cursor = encodeProjectsCursor({
      createdAt: "2026-07-12T09:06:00.000Z",
      id: "project-id",
    });

    expect(decodeProjectsCursor(cursor)).toEqual({
      createdAt: "2026-07-12T09:06:00.000Z",
      id: "project-id",
    });
  });

  it("accepts the selected common creator video containers", () => {
    expect(parseSourceVideoUpload(sourceVideo)).toMatchObject({
      mimeType: "video/mp4",
      originalFileName: "episode.mp4",
    });
    expect(
      parseSourceVideoUpload({
        ...sourceVideo,
        mimetype: "video/quicktime",
        originalname: "episode.mov",
      }),
    ).toMatchObject({ mimeType: "video/quicktime" });
    expect(
      parseSourceVideoUpload({
        ...sourceVideo,
        mimetype: "video/webm",
        originalname: "episode.webm",
      }),
    ).toMatchObject({ mimeType: "video/webm" });
    expect(
      parseSourceVideoUpload({
        ...sourceVideo,
        mimetype: "video/x-matroska",
        originalname: "episode.mkv",
      }),
    ).toMatchObject({ mimeType: "video/x-matroska" });
  });

  it("rejects a missing file and mismatched MIME type or extension", () => {
    expect(() => parseSourceVideoUpload(undefined)).toThrow("Choose a video file to upload.");
    expect(() => parseSourceVideoUpload({ ...sourceVideo, originalname: "episode.exe" })).toThrow(
      "Upload an MP4, MOV, WebM, or MKV video.",
    );
    expect(() => parseSourceVideoUpload({ ...sourceVideo, mimetype: "video/webm" })).toThrow(
      "Upload an MP4, MOV, WebM, or MKV video.",
    );
  });
});
