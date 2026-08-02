import {
  CLIP_SELECTION_PROMPT_VERSION,
  createClipSelectionPrompt,
  createClipSelectionRepairPrompt,
  type ClipSelectionPromptInput,
} from "@repurposepro/shared";
import { z } from "zod";

const MAX_RESPONSE_BYTES = 1024 * 1024;
const OVERLAP_DEDUPLICATION_RATIO = 0.8;
const TIMESTAMP_TOLERANCE_SECONDS = 0.001;
const TRANSPORT_ATTEMPTS = 1;

const rawCandidateSchema = z
  .object({
    endTime: z.number().finite().positive(),
    reason: z.string().trim().min(1).max(500),
    score: z.number().finite().min(0).max(1),
    startTime: z.number().finite().nonnegative(),
    title: z.string().trim().min(1).max(120),
  })
  .strict();

const rawResponseSchema = z
  .object({
    backup: z.array(rawCandidateSchema).max(10),
    primary: z.array(rawCandidateSchema).max(10),
  })
  .strict();

export type GeneratedClipCandidate = z.output<typeof rawCandidateSchema>;

export interface GeneratedClipSelection {
  readonly backup: readonly GeneratedClipCandidate[];
  readonly primary: readonly GeneratedClipCandidate[];
  readonly promptVersion: typeof CLIP_SELECTION_PROMPT_VERSION;
}

export interface GeminiModelClient {
  generateContent(parameters: GeminiGenerateContentParameters): Promise<{ readonly text?: string }>;
}

export interface GeminiGenerateContentParameters {
  readonly config: {
    readonly abortSignal: AbortSignal;
    readonly httpOptions: {
      readonly retryOptions: { readonly attempts: number };
      readonly timeout: number;
    };
    readonly maxOutputTokens: number;
    readonly responseJsonSchema: Record<string, unknown>;
    readonly responseMimeType: "application/json";
    readonly systemInstruction: string;
    readonly temperature: number;
  };
  readonly contents: string;
  readonly model: string;
}

export interface GeminiClipSelectorOptions {
  readonly maxRetries: number;
  readonly model: string;
  readonly timeoutMs: number;
}

export type GeminiClipSelectionFailureReason =
  "invalid_response" | "no_usable_candidates" | "request_failed";

export class GeminiClipSelectionError extends Error {
  public constructor(
    public readonly reason: GeminiClipSelectionFailureReason,
    options?: ErrorOptions,
  ) {
    super("Gemini clip selection failed.", options);
    this.name = "GeminiClipSelectionError";
  }
}

export class GeminiClipSelector {
  public constructor(
    private readonly client: GeminiModelClient,
    private readonly options: GeminiClipSelectorOptions,
  ) {}

  public async select(
    input: ClipSelectionPromptInput,
    signal: AbortSignal,
  ): Promise<GeneratedClipSelection> {
    let prompt = createClipSelectionPrompt(input);
    let best: SelectionValidation | undefined;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt += 1) {
      if (signal.aborted) throwAbortReason(signal);

      let response: { readonly text?: string };
      try {
        response = await this.client.generateContent({
          config: {
            abortSignal: signal,
            httpOptions: {
              retryOptions: { attempts: TRANSPORT_ATTEMPTS },
              timeout: this.options.timeoutMs,
            },
            maxOutputTokens: 8192,
            responseJsonSchema: clipSelectionJsonSchema(input.sourceDurationSeconds),
            responseMimeType: "application/json",
            systemInstruction: prompt.systemInstruction,
            temperature: 0.2,
          },
          contents: prompt.contents,
          model: this.options.model,
        });
      } catch (error: unknown) {
        if (signal.aborted) throwAbortReason(signal);
        throw new GeminiClipSelectionError("request_failed", { cause: error });
      }

      const validated = validateResponse(response.text, input.sourceDurationSeconds);
      if (isBetterSelection(validated, best)) {
        best = validated;
      }
      if (validated.selection.primary.length >= targetPrimaryCount(input.sourceDurationSeconds)) {
        return validated.selection;
      }
      if (attempt < this.options.maxRetries) {
        prompt = createClipSelectionRepairPrompt(input, validated.issues);
      }
    }

    if (best && best.selection.primary.length > 0) {
      return best.selection;
    }
    throw new GeminiClipSelectionError("no_usable_candidates");
  }
}

export async function createGoogleGeminiClient(apiKey: string): Promise<GeminiModelClient> {
  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey });
  return {
    generateContent: (parameters) => client.models.generateContent(parameters),
  };
}

interface SelectionValidation {
  readonly issues: readonly string[];
  readonly selection: GeneratedClipSelection;
}

interface ClassifiedCandidate extends GeneratedClipCandidate {
  readonly originalIndex: number;
  readonly source: "backup" | "primary";
}

function validateResponse(text: string | undefined, sourceDuration: number): SelectionValidation {
  const empty = (): SelectionValidation => ({
    issues: ["The response did not contain valid structured JSON."],
    selection: { backup: [], primary: [], promptVersion: CLIP_SELECTION_PROMPT_VERSION },
  });
  if (!text || Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    return empty();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return empty();
  }
  const response = rawResponseSchema.safeParse(parsed);
  if (!response.success) {
    return {
      ...empty(),
      issues: response.error.issues.map(
        (issue) => `${issue.path.join(".") || "response"}: ${issue.message}`,
      ),
    };
  }

  const issues: string[] = [];
  const classified = [
    ...response.data.primary.map((candidate, originalIndex) => ({
      ...candidate,
      originalIndex,
      source: "primary" as const,
    })),
    ...response.data.backup.map((candidate, originalIndex) => ({
      ...candidate,
      originalIndex,
      source: "backup" as const,
    })),
  ].filter((candidate) => {
    const duration = candidate.endTime - candidate.startTime;
    const minimumDuration = Math.min(15, sourceDuration);
    const maximumDuration = Math.min(180, sourceDuration);
    const valid =
      candidate.endTime > candidate.startTime &&
      candidate.endTime <= sourceDuration + TIMESTAMP_TOLERANCE_SECONDS &&
      duration >= minimumDuration - TIMESTAMP_TOLERANCE_SECONDS &&
      duration <= maximumDuration + TIMESTAMP_TOLERANCE_SECONDS;
    if (!valid) {
      issues.push(
        `${candidate.source}.${candidate.originalIndex}: timestamps must fit the source and duration bounds.`,
      );
    }
    return valid;
  });

  const deduplicated = deduplicateCandidates(classified);
  const primary = deduplicated
    .filter((candidate) => candidate.source === "primary")
    .map(stripClassification);
  const backup = deduplicated
    .filter((candidate) => candidate.source === "backup")
    .map(stripClassification);
  const target = targetPrimaryCount(sourceDuration);

  while (primary.length < target && backup.length > 0) {
    primary.push(backup.shift()!);
  }
  if (primary.length < target) {
    issues.push(`primary: expected ${target} usable candidates but received ${primary.length}.`);
  }

  return {
    issues,
    selection: {
      backup: backup.slice(0, 10),
      primary: primary.slice(0, 10),
      promptVersion: CLIP_SELECTION_PROMPT_VERSION,
    },
  };
}

function deduplicateCandidates(candidates: readonly ClassifiedCandidate[]): ClassifiedCandidate[] {
  const ranked = [...candidates].sort(
    (left, right) =>
      right.score - left.score ||
      Number(left.source === "backup") - Number(right.source === "backup") ||
      left.originalIndex - right.originalIndex,
  );
  const retained: ClassifiedCandidate[] = [];
  for (const candidate of ranked) {
    if (
      retained.some(
        (existing) => overlapOfShorter(candidate, existing) >= OVERLAP_DEDUPLICATION_RATIO,
      )
    ) {
      continue;
    }
    retained.push(candidate);
  }
  return retained;
}

function overlapOfShorter(left: GeneratedClipCandidate, right: GeneratedClipCandidate): number {
  const overlap = Math.max(
    0,
    Math.min(left.endTime, right.endTime) - Math.max(left.startTime, right.startTime),
  );
  const shorterDuration = Math.min(left.endTime - left.startTime, right.endTime - right.startTime);
  return shorterDuration <= 0 ? 0 : overlap / shorterDuration;
}

function stripClassification(candidate: ClassifiedCandidate): GeneratedClipCandidate {
  return {
    endTime: candidate.endTime,
    reason: candidate.reason,
    score: candidate.score,
    startTime: candidate.startTime,
    title: candidate.title,
  };
}

export function targetPrimaryCount(sourceDuration: number): number {
  if (!(sourceDuration > 0)) return 1;
  const minimumDuration = Math.min(15, sourceDuration);
  return Math.min(5, Math.max(1, Math.floor(sourceDuration / minimumDuration)));
}

function isBetterSelection(
  candidate: SelectionValidation,
  current: SelectionValidation | undefined,
): boolean {
  if (!current) return true;
  if (candidate.selection.primary.length !== current.selection.primary.length) {
    return candidate.selection.primary.length > current.selection.primary.length;
  }
  const candidateScore = candidate.selection.primary.reduce((sum, clip) => sum + clip.score, 0);
  const currentScore = current.selection.primary.reduce((sum, clip) => sum + clip.score, 0);
  return candidateScore > currentScore;
}

function clipSelectionJsonSchema(sourceDuration: number): Record<string, unknown> {
  const candidate = {
    additionalProperties: false,
    properties: {
      endTime: { maximum: sourceDuration, minimum: 0, type: "number" },
      reason: { type: "string" },
      score: { maximum: 1, minimum: 0, type: "number" },
      startTime: { maximum: sourceDuration, minimum: 0, type: "number" },
      title: { type: "string" },
    },
    propertyOrdering: ["title", "startTime", "endTime", "score", "reason"],
    required: ["title", "startTime", "endTime", "score", "reason"],
    type: "object",
  };
  return {
    additionalProperties: false,
    properties: {
      primary: { items: candidate, maxItems: 10, type: "array" },
      backup: { items: candidate, maxItems: 10, type: "array" },
    },
    propertyOrdering: ["primary", "backup"],
    required: ["primary", "backup"],
    type: "object",
  };
}

function throwAbortReason(signal: AbortSignal): never {
  throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}
