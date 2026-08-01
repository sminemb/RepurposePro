import { describe, expect, it, vi } from "vitest";

import {
  GeminiClipSelector,
  type GeminiGenerateContentParameters,
  type GeminiModelClient,
} from "./gemini-clip-selector.service";

const input = {
  sourceDurationSeconds: 60,
  transcriptSegments: [
    { endTime: 30, sequence: 0, startTime: 0, text: "A timestamped segment." },
    { endTime: 60, sequence: 1, startTime: 30, text: "Another timestamped segment." },
  ],
};

function clip(
  title: string,
  startTime: number,
  endTime: number,
  score: number,
): Record<string, unknown> {
  return { endTime, reason: `${title} is compelling.`, score, startTime, title };
}

function response(primary: unknown[], backup: unknown[] = []): string {
  return JSON.stringify({ backup, primary });
}

function selector(
  outputs: readonly string[],
  maxRetries = 2,
): {
  readonly client: GeminiModelClient;
  readonly select: GeminiClipSelector["select"];
  readonly generateContent: ReturnType<typeof vi.fn>;
} {
  const generateContent = vi.fn(async () => ({
    text: outputs[generateContent.mock.calls.length - 1],
  }));
  const client: GeminiModelClient = { generateContent };
  const service = new GeminiClipSelector(client, {
    maxRetries,
    model: "gemini-3.5-flash-lite",
    timeoutMs: 60_000,
  });
  return { client, generateContent, select: service.select.bind(service) };
}

describe("GeminiClipSelector", () => {
  it("requests application/json with JSON Schema and the clips-v1 transcript-only prompt", async () => {
    const output = response([clip("Only clip", 0, 15, 0.9)]);
    const { generateContent, select } = selector([output]);

    await select(
      { sourceDurationSeconds: 15, transcriptSegments: input.transcriptSegments.slice(0, 1) },
      new AbortController().signal,
    );

    const request = generateContent.mock.calls[0]?.[0] as GeminiGenerateContentParameters;
    expect(request.model).toBe("gemini-3.5-flash-lite");
    expect(request.config).toMatchObject({
      httpOptions: { retryOptions: { attempts: 3 }, timeout: 60_000 },
      responseMimeType: "application/json",
      temperature: 0.2,
    });
    expect(request.config?.responseJsonSchema).toMatchObject({
      additionalProperties: false,
      properties: {
        backup: { maxItems: 10, type: "array" },
        primary: { maxItems: 10, type: "array" },
      },
      type: "object",
    });
    expect(request.contents).toContain('<transcript_data version="clips-v1">');
    expect(request.contents).not.toContain("storagePath");
  });

  it("deduplicates at 80% overlap, keeps the higher score, and promotes backups", async () => {
    const output = response(
      [clip("Lower overlap", 0, 15, 0.5), clip("Higher overlap", 1, 16, 0.9)],
      [clip("Backup", 15, 30, 0.8)],
    );
    const { select } = selector([output]);

    const result = await select(
      { ...input, sourceDurationSeconds: 30 },
      new AbortController().signal,
    );

    expect(result.promptVersion).toBe("clips-v1");
    expect(result.primary.map((candidate) => candidate.title)).toEqual([
      "Higher overlap",
      "Backup",
    ]);
    expect(result.backup).toEqual([]);
  });

  it("repairs invalid and undersized responses up to two times", async () => {
    const invalid = response([clip("Outside source", 50, 70, 0.9)]);
    const undersized = response([clip("One", 0, 15, 0.9)]);
    const complete = response([
      clip("One", 0, 15, 0.9),
      clip("Two", 15, 30, 0.8),
      clip("Three", 30, 45, 0.7),
      clip("Four", 45, 60, 0.6),
    ]);
    const { generateContent, select } = selector([invalid, undersized, complete]);

    const result = await select(input, new AbortController().signal);

    expect(result.primary).toHaveLength(4);
    expect(generateContent).toHaveBeenCalledTimes(3);
    const repairRequest = generateContent.mock.calls[1]?.[0] as GeminiGenerateContentParameters;
    expect(repairRequest.contents).toContain("previous response was rejected");
  });

  it("accepts the best usable partial result after repair attempts are exhausted", async () => {
    const one = response([clip("One", 0, 15, 0.9)]);
    const { generateContent, select } = selector([one, one, one]);

    const result = await select(input, new AbortController().signal);

    expect(result.primary.map((candidate) => candidate.title)).toEqual(["One"]);
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it("fails safely when every response has zero usable candidates", async () => {
    const invalid = response([clip("Too short", 0, 5, 0.9)]);
    const { select } = selector(["not-json", invalid, response([])]);

    await expect(select(input, new AbortController().signal)).rejects.toMatchObject({
      message: "Gemini clip selection failed.",
      reason: "no_usable_candidates",
    });
  });

  it("independently rejects oversized arrays and preserves abort reasons", async () => {
    const oversized = response(
      Array.from({ length: 11 }, (_, index) => clip(`Clip ${index}`, 0, 15, 0.9)),
    );
    const { generateContent, select } = selector([oversized, response([]), response([])]);

    await expect(select(input, new AbortController().signal)).rejects.toMatchObject({
      reason: "no_usable_candidates",
    });
    expect(generateContent).toHaveBeenCalledTimes(3);

    const controller = new AbortController();
    const leaseLoss = new Error("Processing execution lease was lost.");
    controller.abort(leaseLoss);
    await expect(select(input, controller.signal)).rejects.toBe(leaseLoss);
  });
});
