import "reflect-metadata";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import type { Response } from "express";
import { describe, it, expect, vi } from "vitest";
import type { AuthenticatedRequest } from "../auth/auth.guard";
import { RenderingController } from "./rendering.controller";
import { RenderingService, renderHttpError } from "./rendering.service";
const project = "00000000-0000-4000-8000-000000000001",
  clip = "00000000-0000-4000-8000-000000000002";
const input = { type: "clips", clipIds: [clip], expectedRevision: 4 };
const request = { id: "render-request", user: { id: "owner" } } as AuthenticatedRequest;
describe("render HTTP boundary", () => {
  it("streams an authorized file privately with a safe attachment filename and exact length", async () => {
    await mkdir(resolve("storage"), { recursive: true });
    const directory = await mkdtemp(resolve("storage/vs6-download-test-"));
    vi.stubEnv("STORAGE_ROOT", directory);
    try {
      const path = join(directory, "clip.mp4");
      await writeFile(path, "fixture");
      const download = vi
        .fn()
        .mockResolvedValue({ storagePath: path, fileName: 'title"\r\n.mp4', fileSizeBytes: 7 });
      const controller = new RenderingController({ download } as unknown as RenderingService);
      const setHeader = vi.fn();
      const file = await controller.download(project, clip, request, {
        setHeader,
      } as unknown as Response);
      expect(download).toHaveBeenCalledWith("owner", project, clip);
      expect(setHeader).toHaveBeenCalledWith("Content-Type", "video/mp4");
      expect(setHeader).toHaveBeenCalledWith("Content-Length", 7);
      expect(setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
      expect(setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
      expect(setHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        'attachment; filename="title___.mp4"',
      );
      const chunks: Buffer[] = [];
      for await (const chunk of file.getStream()) chunks.push(chunk as Buffer);
      expect(Buffer.concat(chunks).toString()).toBe("fixture");
    } finally {
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("rejects storage outside the configured root before exposing download headers", async () => {
    await mkdir(resolve("storage"), { recursive: true });
    const directory = await mkdtemp(resolve("storage/vs6-containment-test-"));
    const ownedRoot = join(directory, "owned");
    await mkdir(ownedRoot);
    vi.stubEnv("STORAGE_ROOT", ownedRoot);
    try {
      const path = join(directory, "foreign.mp4");
      await writeFile(path, "foreign");
      const controller = new RenderingController({
        download: vi
          .fn()
          .mockResolvedValue({ storagePath: path, fileName: "clip.mp4", fileSizeBytes: 7 }),
      } as unknown as RenderingService);
      const setHeader = vi.fn();
      await expect(
        controller.download(project, clip, request, { setHeader } as unknown as Response),
      ).rejects.toMatchObject({ status: 404 });
      expect(setHeader).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("requires authentication and rejects invalid single clip requests", async () => {
    const start = vi.fn();
    const controller = new RenderingController({ start } as unknown as RenderingService);
    await expect(
      controller.start(project, input, undefined, {} as AuthenticatedRequest),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      controller.start(project, { ...input, clipIds: [clip, clip] }, undefined, request),
    ).rejects.toMatchObject({ status: 400 });
    await expect(controller.start(project, input, "bad/key", request)).rejects.toMatchObject({
      status: 400,
    });
    expect(start).not.toHaveBeenCalled();
  });
  it("returns the persisted job and maps render conflicts", async () => {
    const result = { jobId: clip, status: "queued", outputCount: 1 };
    const start = vi.fn().mockResolvedValue(result);
    const controller = new RenderingController({ start } as unknown as RenderingService);
    expect(await controller.start(project, input, "attempt", request)).toEqual({ data: result });
    expect(start).toHaveBeenCalledWith("owner", project, input, "attempt", "render-request");
    expect(renderHttpError("CLIP_EDIT_CONFLICT").getStatus()).toBe(409);
    expect(renderHttpError("OUTPUT_EXPIRED").getStatus()).toBe(410);
    expect(renderHttpError("OUTPUT_NOT_FOUND").getStatus()).toBe(404);
  });
  it("rejects expired and deleted exports before storage access", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          result: {
            storagePath: "private",
            fileName: "x.mp4",
            fileSizeBytes: 1,
            status: "ready",
            deleted: false,
            expiresAt: new Date(0).toISOString(),
          },
        },
      ],
    });
    const service = new RenderingService({ database: { pool: { query } } } as never);
    await expect(service.download("owner", project, clip)).rejects.toMatchObject({ status: 410 });
    query.mockResolvedValue({ rows: [{ result: null }] });
    await expect(service.download("stranger", project, clip)).rejects.toMatchObject({
      status: 404,
    });
  });
});
