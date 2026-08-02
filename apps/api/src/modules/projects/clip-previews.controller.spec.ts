import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BadRequestException, GoneException, NotFoundException } from "@nestjs/common";
import type { Response } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequest } from "../auth/auth.guard";
import { ClipPreviewsController } from "./clip-previews.controller";
import { ClipPreviewAccessError, type ClipPreviewsService } from "./clip-previews.service";

const projectId = "00000000-0000-4000-8000-000000003101";
let directory: string;
let videoPath: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "repurposepro-controller-source-"));
  videoPath = join(directory, "video");
  await writeFile(videoPath, Buffer.from("0123456789"));
});

afterAll(async () => {
  await rm(directory, { force: true, recursive: true });
});

describe("ClipPreviewsController", () => {
  it("returns owner-scoped clips and rejects malformed IDs", async () => {
    const { controller, list } = setup();
    list.mockResolvedValue({ clips: [], projectId, sourceDurationSeconds: 30 });

    await expect(controller.list(projectId, request())).resolves.toEqual({
      data: { clips: [], projectId, sourceDurationSeconds: 30 },
    });
    await expect(controller.list("bad-id", request())).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns the same not-found response for cross-user clip denial", async () => {
    const { controller, list } = setup();
    list.mockRejectedValue(new ClipPreviewAccessError("CLIPS_NOT_FOUND"));

    await expect(controller.list(projectId, request("another-user"))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each([
    [undefined, 200, "10", undefined, "0123456789"],
    ["bytes=4-", 206, "6", "bytes 4-9/10", "456789"],
    ["bytes=-3", 206, "3", "bytes 7-9/10", "789"],
  ])(
    "streams complete, open-ended, and suffix responses for %s",
    async (range, status, contentLength, contentRange, expected) => {
      const { controller, getSourceVideoContent } = setup();
      getSourceVideoContent.mockResolvedValue({
        fileSizeBytes: 10,
        mimeType: "video/mp4",
        path: videoPath,
      });
      const response = responseMock();

      const result = await controller.sourceVideoContent(
        projectId,
        range,
        request(),
        response.value,
      );

      expect(response.status).toHaveBeenCalledWith(status);
      expect(response.headers.get("Content-Length")).toBe(contentLength);
      expect(response.headers.get("Content-Range")).toBe(contentRange);
      expect(response.headers.get("Accept-Ranges")).toBe("bytes");
      expect(response.headers.get("Content-Type")).toBe("video/mp4");
      expect(await readStream(result!.getStream())).toBe(expected);
    },
  );

  it("returns 416 with an accurate unsatisfied content range", async () => {
    const { controller, getSourceVideoContent } = setup();
    getSourceVideoContent.mockResolvedValue({
      fileSizeBytes: 10,
      mimeType: "video/mp4",
      path: videoPath,
    });
    const response = responseMock();

    await expect(
      controller.sourceVideoContent(projectId, "bytes=20-", request(), response.value),
    ).resolves.toBeUndefined();
    expect(response.status).toHaveBeenCalledWith(416);
    expect(response.headers.get("Content-Range")).toBe("bytes */10");
    expect(response.end).toHaveBeenCalledOnce();
  });

  it("maps expired and missing files without exposing a path", async () => {
    const { controller, getSourceVideoContent } = setup();
    getSourceVideoContent.mockRejectedValueOnce(new ClipPreviewAccessError("SOURCE_VIDEO_EXPIRED"));
    await expect(
      controller.sourceVideoContent(projectId, undefined, request(), responseMock().value),
    ).rejects.toBeInstanceOf(GoneException);

    getSourceVideoContent.mockRejectedValueOnce(
      new ClipPreviewAccessError("SOURCE_VIDEO_NOT_FOUND"),
    );
    await expect(
      controller.sourceVideoContent(projectId, undefined, request(), responseMock().value),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

function setup() {
  const list = vi.fn();
  const getSourceVideoContent = vi.fn();
  const controller = new ClipPreviewsController({
    getSourceVideoContent,
    list,
  } as unknown as ClipPreviewsService);
  return { controller, getSourceVideoContent, list };
}

function request(userId = "preview-user"): AuthenticatedRequest {
  return { id: "req_preview", user: { id: userId } } as AuthenticatedRequest;
}

function responseMock() {
  const headers = new Map<string, string>();
  const status = vi.fn();
  const end = vi.fn();
  return {
    end,
    headers,
    status,
    value: {
      end,
      setHeader: (name: string, value: number | string) => headers.set(name, String(value)),
      status,
    } as unknown as Response,
  };
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
