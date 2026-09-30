import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@repurposepro/db";
import { FramingService } from "./framing.service";
import type { FaceTracker } from "./face-tracker.service";

describe("FramingService", () => {
  const data = { version: "mediapipe-v1", width: 1920, height: 1080, tracks: [] };
  const setup = (claimed: boolean, fail = false) => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: claimed ? [{ source_path: "source.mp4" }] : [] })
      .mockResolvedValue({ rows: [{ finish_video_framing: true }] });
    const analyze = fail
      ? vi.fn().mockRejectedValue(new Error("failed"))
      : vi.fn().mockResolvedValue(data);
    const service = new FramingService(
      { pool: { query } } as unknown as DatabaseClient,
      { analyze } as unknown as FaceTracker,
      { redisUrl: "redis://localhost", prefix: "test" },
    );
    return { query, analyze, service };
  };
  it("does not run a duplicate claim", async () => {
    const { service, analyze } = setup(false);
    await service.process("id");
    expect(analyze).not.toHaveBeenCalled();
  });
  it("persists a validated result with the lease token", async () => {
    const { service, query } = setup(true);
    await service.process("id");
    const token = (query.mock.calls[0]?.[1] as readonly string[])[1];
    expect(query.mock.calls[1]?.[1]).toEqual(["id", token, JSON.stringify(data)]);
  });
  it("records detector failures so users can retry without billing", async () => {
    const { service, query } = setup(true, true);
    await service.process("id");
    expect(query.mock.calls[1]?.[0]).toContain("finish_video_framing($1,$2,NULL)");
  });
});
