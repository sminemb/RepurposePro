import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadWorkerConfig } from "@repurposepro/config";
import { createGoogleGeminiClient } from "../apps/worker/src/services/gemini-clip-selector.service";
import { GeminiSummarySelector } from "../apps/worker/src/services/gemini-summary-selector.service";

async function main() {
  const config = loadWorkerConfig(),
    started = Date.now();
  const path = resolve("storage/vs8-verification/live-model.json");
  const result: Record<string, unknown> = {
    date: new Date().toISOString(),
    model: config.gemini.summaryModel ?? config.gemini.model,
  };
  if (!config.gemini.apiKey) result.status = "skipped_no_key";
  else
    try {
      const ideas = [
        "A useful summary preserves the speaker's important ideas.",
        "Begin with enough context for the audience to understand the topic.",
        "Keep examples that explain the main point clearly.",
        "Remove repetition and long pauses.",
        "The conclusion should connect back to the original argument.",
      ];
      const selection = await new GeminiSummarySelector(
        await createGoogleGeminiClient(config.gemini.apiKey),
        { ...config.gemini, model: config.gemini.summaryModel ?? config.gemini.model },
      ).select(
        {
          sourceDurationSeconds: 100,
          transcriptSegments: Array.from({ length: 20 }, (_, sequence) => ({
            sequence,
            startTime: sequence * 5,
            endTime: (sequence + 1) * 5,
            text: ideas[sequence % ideas.length]!,
          })),
        },
        AbortSignal.timeout(120000),
      );
      result.status = "passed";
      result.selectedDurationSeconds = selection.summarySegments.reduce(
        (sum, s) => sum + s.endTime - s.startTime,
        0,
      );
      result.targetDurationSeconds = selection.targetDurationSeconds;
      result.segmentCount = selection.summarySegments.length;
      result.promptVersion = selection.promptVersion;
    } catch (error) {
      result.status = "failed";
      result.errorName = error instanceof Error ? error.name : "UnknownError";
      if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        typeof error.status === "number"
      )
        result.httpStatus = error.status;
      result.errorMessage =
        error instanceof Error
          ? error.message.replaceAll(config.gemini.apiKey, "[redacted]").slice(0, 1000)
          : "Unavailable";
    }
  result.elapsedMs = Date.now() - started;
  await mkdir(resolve("storage/vs8-verification"), { recursive: true });
  await writeFile(path, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
}
void main().catch(() => {
  console.error("Live smoke could not initialize. Check configuration.");
  process.exitCode = 1;
});
