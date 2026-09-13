import { z } from "zod";

import { captionLineSchema, captionPositionSchema, clipPreviewCandidateSchema } from "./clips";

export const captionBaselineLineSchema = captionLineSchema.extend({
  id: z.string().min(1).max(100),
});
export type CaptionBaselineLine = z.output<typeof captionBaselineLineSchema>;

export const captionEditSchema = z
  .object({
    id: z.string().min(1).max(100),
    text: z.string().trim().min(1).max(160),
    highlights: z.array(z.string().trim().min(1).max(64)).max(10),
  })
  .strict();
export const clipEditInputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    startTime: z.number().finite().nonnegative(),
    endTime: z.number().finite().positive(),
    captionsEnabled: z.boolean(),
    captionPosition: captionPositionSchema,
    previewFontSize: z.number().int().min(12).max(96),
    captionEdits: z.array(captionEditSchema).max(2000),
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.captionEdits.map((edit) => edit.id)).size !== input.captionEdits.length) {
      context.addIssue({
        code: "custom",
        message: "Caption edits must have unique line IDs.",
        path: ["captionEdits"],
      });
    }
  });
export type ClipEditInput = z.output<typeof clipEditInputSchema>;
export type CaptionEdit = z.output<typeof captionEditSchema>;

export const clipEditorSchema = z
  .object({
    clip: clipPreviewCandidateSchema,
    baseline: z.array(captionBaselineLineSchema).max(100_000),
    captionEdits: z.array(captionEditSchema).max(2000),
    sourceDurationSeconds: z.number().finite().positive(),
  })
  .strict();
export type ClipEditor = z.output<typeof clipEditorSchema>;
export type ClipEditErrorCode =
  "CLIP_INVALID_TIME_RANGE" | "CLIP_OUTSIDE_SOURCE_DURATION" | "CLIP_INVALID_CAPTION_METADATA";

export function validateClipEdit(
  input: ClipEditInput,
  baseline: readonly CaptionBaselineLine[],
  sourceDuration: number,
): ClipEditErrorCode | null {
  if (input.startTime < 0 || input.endTime <= input.startTime) return "CLIP_INVALID_TIME_RANGE";
  if (input.endTime > sourceDuration) return "CLIP_OUTSIDE_SOURCE_DURATION";
  const ids = new Set(baseline.map((line) => line.id));
  if (input.captionEdits.some((edit) => !ids.has(edit.id))) return "CLIP_INVALID_CAPTION_METADATA";
  return null;
}

export function clipEditorInput(editor: ClipEditor): ClipEditInput {
  const { clip } = editor;
  return {
    expectedRevision: clip.revision ?? 0,
    startTime: clip.startTime,
    endTime: clip.endTime,
    captionsEnabled: clip.captionsEnabled,
    captionPosition: clip.captionPosition,
    previewFontSize: clip.previewFontSize,
    captionEdits: editor.captionEdits,
  };
}

export function projectCaptionLines(
  baseline: readonly CaptionBaselineLine[],
  input: Pick<ClipEditInput, "startTime" | "endTime" | "captionEdits">,
): CaptionBaselineLine[] {
  const edits = new Map(input.captionEdits.map((edit) => [edit.id, edit]));
  return baseline
    .filter((line) => line.endTime > input.startTime && line.startTime < input.endTime)
    .map((line) => ({
      ...line,
      text: edits.get(line.id)?.text ?? line.text,
      highlights: edits.get(line.id)?.highlights ?? [],
      startTime: Math.max(line.startTime, input.startTime),
      endTime: Math.min(line.endTime, input.endTime),
    }));
}
