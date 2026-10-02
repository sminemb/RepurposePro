import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";
import type { DatabaseClient } from "@repurposepro/db";
import { loadWorkerConfig } from "@repurposepro/config";
import { SummaryRenderer } from "./summary-renderer.service";
import { runMedia, probeMedia } from "./render-ffmpeg";
import type * as MediaModule from "./render-ffmpeg";

vi.mock("./render-ffmpeg", async (original) => {
  const actual = await original<typeof MediaModule>();
  return { ...actual, runMedia: vi.fn(), probeMedia: vi.fn() };
});

describe("summary subprocess publication fences", () => {
  it.each(["lease-loss", "publication-loss"] as const)(
    "cleans private staging after %s",
    async (mode) => {
      await mkdir(resolve("storage"), { recursive: true });
      const root = await mkdtemp(resolve("storage/summary-fence-")),
        source = join(root, "source.mp4");
      await writeFile(source, "fixture");
      const jobId = randomUUID(),
        projectId = randomUUID();
      const snapshot = {
        segments: [{ startTime: 1, endTime: 3 }],
        sourceId: randomUUID(),
        sourcePath: source,
        sourceExpiresAt: new Date(Date.now() + 60000),
        sourceFileSizeBytes: 7,
        projectId,
        userId: "fence-user",
        title: "Fence",
      };
      let touches = 0,
        finalPath: string | undefined,
        signal: AbortSignal | undefined;
      const query = vi.fn(async (sql: string, args: unknown[]) => {
        if (sql.includes("register_job_storage_target")) return { rows: [{ id: randomUUID() }] };
        let result: unknown = true;
        if (sql.includes("acquire_summary_render")) result = snapshot;
        if (sql.includes("touch_summary_render")) result = mode !== "lease-loss" || ++touches === 1;
        if (sql.includes("complete_summary_render")) {
          finalPath = (args[2] as { storagePath: string }).storagePath;
          result = null;
        }
        if (sql.includes("clip_render_output_exists")) result = false;
        return { rows: [{ result }] };
      });
      vi.mocked(probeMedia).mockImplementation(async (_binary, path) => ({
        streams: [
          {
            codec_type: "video",
            codec_name: "h264",
            width: 640,
            height: 360,
            sample_aspect_ratio: "1:1",
          },
          { codec_type: "audio", codec_name: "aac", width: 0, height: 0 },
        ],
        format: { duration: path === source ? "20" : "2" },
      }));
      vi.mocked(runMedia).mockImplementation(async (_binary, _args, options) => {
        signal = options.signal;
        if (mode === "publication-loss") {
          await writeFile(join(options.cwd!, "output.mp4"), "fixture");
          return "";
        }
        return new Promise((_resolve, reject) =>
          signal!.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }),
        );
      });
      try {
        await expect(
          new SummaryRenderer({ pool: { query } } as unknown as DatabaseClient, {
            ...loadWorkerConfig(),
            storageRoot: root,
          }).process(jobId, projectId),
        ).rejects.toThrow(mode === "lease-loss" ? "cancelled" : "publication lease lost");
        expect(await readdir(join(root, ".render-staging"))).toEqual([]);
        if (mode === "lease-loss") {
          expect(signal?.aborted).toBe(true);
          expect(query.mock.calls.some(([sql]) => sql.includes("complete_summary_render"))).toBe(
            false,
          );
        } else {
          expect(finalPath).toContain(jobId);
          await expect(stat(finalPath!)).rejects.toMatchObject({ code: "ENOENT" });
        }
        expect(query.mock.calls.some(([sql]) => sql.includes("fail_summary_render"))).toBe(true);
      } finally {
        await rm(root, { recursive: true, force: true });
        vi.clearAllMocks();
      }
    },
  );
});
