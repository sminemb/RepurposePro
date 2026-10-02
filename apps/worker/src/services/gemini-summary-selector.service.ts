import {
  createSummarySelectionPrompt,
  validateSummarySelection,
  MAX_SUMMARY_SEGMENTS,
  type ClipSelectionPromptInput,
} from "@repurposepro/shared";
import type { GeminiModelClient, GeminiClipSelectorOptions } from "./gemini-clip-selector.service";

export class GeminiSummarySelector {
  public constructor(
    private readonly client: GeminiModelClient,
    private readonly options: GeminiClipSelectorOptions,
  ) {}
  public async select(input: ClipSelectionPromptInput, signal: AbortSignal) {
    signal.throwIfAborted();
    if (!input.transcriptSegments.some((s) => s.text.trim()))
      throw new Error("No speech is available for summary selection.");
    let issues: string[] = [];
    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      signal.throwIfAborted();
      const prompt = createSummarySelectionPrompt(input, issues);
      const response = await this.client.generateContent({
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
                    startTime: { type: "number", minimum: 0, maximum: input.sourceDurationSeconds },
                    endTime: { type: "number", minimum: 0, maximum: input.sourceDurationSeconds },
                    reason: { type: "string", description: "Selection reason, 1–500 characters." },
                  },
                },
              },
            },
          },
          systemInstruction: prompt.systemInstruction,
          temperature: 0.2,
        },
      });
      signal.throwIfAborted();
      try {
        if (!response.text || Buffer.byteLength(response.text) > 1024 * 1024)
          throw new Error("Missing or oversized summary response.");
        return validateSummarySelection(JSON.parse(response.text), input.sourceDurationSeconds);
      } catch (error) {
        issues = [error instanceof Error ? error.message : "Invalid summary response"];
      }
    }
    throw new Error("Gemini summary selection failed validation after bounded repair.");
  }
}
