import type { DatabaseClient } from "@repurposepro/db";
import { UnrecoverableError } from "bullmq";
import { describe, expect, it, vi } from "vitest";

import type { GeminiClipRegenerator } from "../services/gemini-clip-regenerator.service";
import { ClipRegenerationProcessor } from "./clip-regeneration.processor";

const jobId = "00000000-0000-4000-8000-000000000901";
const projectId = "00000000-0000-4000-8000-000000000902";
const replacementId = "00000000-0000-4000-8000-000000000903";
const job = { id: jobId, name: "regenerate_clip_candidate", data: { jobId, projectId } };
const frozen = {
  sourceId: "00000000-0000-4000-8000-000000000904",
  transcriptId: "00000000-0000-4000-8000-000000000905",
  sourceDurationSeconds: 60,
  transcript: [
    { startSeconds: 0, endSeconds: 15, text: "The original clip." },
    { startSeconds: 20, endSeconds: 40, text: "Fresh words from the saved transcript." },
  ],
  excludedCandidates: [{ startTime: 0, endTime: 15 }],
};
const candidate = {
  startTime: 20,
  endTime: 40,
  title: "Fresh idea",
  reason: "Complete thought.",
  score: 0.9,
};

function fixture(acquisition: unknown = frozen) {
  const query = vi
    .fn<(sql: string, args: unknown[]) => Promise<{ rows: { result: unknown }[] }>>()
    .mockImplementation(async (sql) => ({
      rows: [
        {
          result: sql.includes("acquire_")
            ? acquisition
            : sql.includes("complete_")
              ? replacementId
              : true,
        },
      ],
    }));
  const end = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const database = { pool: { query, end } } as unknown as DatabaseClient;
  const regenerate = vi.fn<GeminiClipRegenerator["regenerate"]>().mockResolvedValue(candidate);
  const processor = new ClipRegenerationProcessor(database, { regenerate });
  return { processor, query, end, regenerate };
}

describe("ClipRegenerationProcessor", () => {
  it("uses the frozen transcript and derives fresh caption text and timings before publishing", async () => {
    const { processor, query, regenerate } = fixture();
    await processor.process(job);
    expect(regenerate.mock.calls[0]?.[0]).toMatchObject({
      transcript: [
        { startTime: 0, endTime: 15, sequence: 0, text: "The original clip." },
        { startTime: 20, endTime: 40, sequence: 1, text: "Fresh words from the saved transcript." },
      ],
      sourceDurationSeconds: 60,
      excludedCandidates: frozen.excludedCandidates,
    });
    expect(regenerate.mock.calls[0]?.[0].signal).toBeInstanceOf(AbortSignal);
    const publication = query.mock.calls.find(([sql]) => sql.includes("complete_"))!;
    expect(publication[1]).toEqual([
      jobId,
      expect.any(String),
      {
        ...candidate,
        captionLines: [
          { startTime: 20, endTime: 40, text: "Fresh words from the saved transcript." },
        ],
      },
    ]);
    const acquisition = query.mock.calls[0]![1];
    expect(acquisition).toEqual([jobId, projectId, expect.any(String)]);
    expect(publication[1][1]).toBe(acquisition[2]);
    expect(query.mock.calls.some(([sql]) => sql.includes("fail_"))).toBe(false);
  });

  it("skips terminal requests so duplicate queue delivery cannot publish another candidate", async () => {
    const { processor, query, regenerate } = fixture({ terminal: true });
    await processor.process(job);
    expect(regenerate).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledOnce();
  });

  it("does not mutate a job whose lease is owned by another execution", async () => {
    const { processor, query, regenerate } = fixture(null);
    await expect(processor.process(job)).rejects.toThrow("lease unavailable");
    expect(regenerate).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledOnce();
  });

  it("records a retryable Gemini failure without publishing or deleting the original", async () => {
    const { processor, query, regenerate } = fixture();
    const failure = new Error("Gemini unavailable");
    regenerate.mockRejectedValue(failure);
    await expect(processor.process(job)).rejects.toBe(failure);
    expect(query.mock.calls.find(([sql]) => sql.includes("fail_"))?.[1]).toEqual([
      jobId,
      expect.any(String),
      true,
    ]);
    expect(query.mock.calls.some(([sql]) => /complete_|DELETE|UPDATE/.test(sql))).toBe(false);
  });

  it("rejects a lost lease before generation and fences the failure mutation", async () => {
    const { processor, query, regenerate } = fixture();
    query.mockImplementation(async (sql) => ({
      rows: [{ result: sql.includes("acquire_") ? frozen : false }],
    }));
    await expect(processor.process(job)).rejects.toThrow("lease lost");
    expect(regenerate).not.toHaveBeenCalled();
    expect(query.mock.calls.find(([sql]) => sql.includes("fail_"))?.[1]).toEqual([
      jobId,
      expect.any(String),
      false,
    ]);
  });

  it("aborts generation after a failed heartbeat and cannot publish afterward", async () => {
    vi.useFakeTimers();
    try {
      const { processor, query, regenerate } = fixture();
      let touches = 0;
      query.mockImplementation(async (sql) => ({
        rows: [
          {
            result: sql.includes("acquire_")
              ? frozen
              : sql.includes("touch_")
                ? ++touches === 1
                : true,
          },
        ],
      }));
      regenerate.mockImplementation(
        ({ signal }) =>
          new Promise((_resolve, reject) => {
            signal!.addEventListener("abort", () => reject(new Error("Generation aborted")), {
              once: true,
            });
          }),
      );
      const pending = expect(processor.process(job)).rejects.toThrow("lease lost");
      await vi.advanceTimersByTimeAsync(2000);
      await pending;
      expect(query.mock.calls.some(([sql]) => sql.includes("complete_"))).toBe(false);
      expect(query.mock.calls.find(([sql]) => sql.includes("fail_"))?.[1][2]).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats completion rejection as lease loss rather than requesting a stale retry", async () => {
    const { processor, query } = fixture();
    query.mockImplementation(async (sql) => ({
      rows: [
        { result: sql.includes("acquire_") ? frozen : sql.includes("complete_") ? null : true },
      ],
    }));
    await expect(processor.process(job)).rejects.toThrow("lease lost");
    expect(query.mock.calls.find(([sql]) => sql.includes("fail_"))?.[1][2]).toBe(false);
  });

  it.each([
    { ...job, name: "analyze_video" },
    { ...job, id: "not-uuid" },
    { ...job, data: { jobId, projectId: "not-uuid" } },
    { ...job, data: { jobId: projectId, projectId } },
    { ...job, data: { jobId, projectId, sourcePath: "untrusted" } },
    { ...job, data: null },
    { ...job, data: [jobId, projectId] },
  ])("rejects an invalid or mismatched queue contract before database access", async (invalid) => {
    const { processor, query } = fixture();
    await expect(processor.process(invalid)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(query).not.toHaveBeenCalled();
  });

  it("closes its dedicated database pool during module shutdown", async () => {
    const { processor, end } = fixture();
    await processor.onModuleDestroy();
    expect(end).toHaveBeenCalledOnce();
  });
});
