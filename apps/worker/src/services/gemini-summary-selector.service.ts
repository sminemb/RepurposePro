import {
  createSummarySelectionPrompt,
  validateSummarySelection,
  MAX_SUMMARY_SEGMENTS,
  type ClipSelectionPromptInput,
} from "@repurposepro/shared";
import type { GeminiModelClient, GeminiClipSelectorOptions } from "./gemini-clip-selector.service";
import type { SelectionAttempts } from "./analysis-retry";

export class GeminiSummarySelectionError extends Error {
  public constructor(
    public readonly reason: "invalid_response" | "request_failed",
    options?: ErrorOptions,
  ) {
    super(
      reason === "request_failed"
        ? "Gemini summary request failed."
        : "Gemini summary selection failed validation after bounded repair.",
      options,
    );
    this.name = "GeminiSummarySelectionError";
  }
}

export class GeminiSummarySelector {
  public constructor(
    private readonly client: GeminiModelClient,
    private readonly options: GeminiClipSelectorOptions,
  ) {}
  public async select(
    input: ClipSelectionPromptInput,
    signal: AbortSignal,
    attempts?: SelectionAttempts,
  ) {
    signal.throwIfAborted();
    if (!input.transcriptSegments.some((s) => s.text.trim()))
      throw new Error("No speech is available for summary selection.");
    let issues: string[] = [];
    const maxRetries = attempts ? 2 : this.options.maxRetries;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      signal.throwIfAborted();
      const durableAttempt = attempts ? await attempts.begin() : attempt + 1;
      const prompt = createSummarySelectionPrompt(input, issues);
      let response: { readonly text?: string };
      try {
        response = await this.client.generateContent({
          model: this.options.model,
          contents: prompt.contents,
          config: {
            abortSignal: signal,
            httpOptions: { retryOptions: { attempts: 1 }, timeout: this.options.timeoutMs },
            maxOutputTokens: 16384,
            responseMimeType: "application/json",
            responseJsonSchema: {
              type: "object",
              additionalProperties: false,
              required: ["summarySegments"],
              properties: {
                summarySegments: {
                  type: "array",
                  minItems: 1,
                  description: `At most ${MAX_SUMMARY_SEGMENTS} chronological source ranges.`,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["startTime", "endTime", "reason"],
                    properties: {
                      startTime: {
                        type: "number",
                        minimum: 0,
                        maximum: input.sourceDurationSeconds,
                      },
                      endTime: { type: "number", minimum: 0, maximum: input.sourceDurationSeconds },
                      reason: {
                        type: "string",
                        description: "Selection reason, 1–500 characters.",
                      },
                    },
                  },
                },
              },
            },
            systemInstruction: prompt.systemInstruction,
            temperature: 0.2,
          },
        });
      } catch (error: unknown) {
        signal.throwIfAborted();
        if (!attempts) throw error;
        await attempts.fail("GEMINI_FAILED");
        if (durableAttempt >= 3)
          throw new GeminiSummarySelectionError("request_failed", { cause: error });
        await attempts.wait(durableAttempt);
        continue;
      }
      signal.throwIfAborted();
      try {
        if (!response.text || Buffer.byteLength(response.text) > 1024 * 1024)
          throw new Error("Missing or oversized summary response.");
        return validateSummarySelection(JSON.parse(response.text), input.sourceDurationSeconds);
      } catch (error) {
        issues = [error instanceof Error ? error.message : "Invalid summary response"];
      }
      await attempts?.fail("INVALID_AI_OUTPUT");
      if (attempts && durableAttempt >= 3) break;
      if (attempt < maxRetries) await attempts?.wait(durableAttempt);
    }
    throw new GeminiSummarySelectionError("invalid_response");
  }
}
