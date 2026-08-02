import { z } from "zod";

export interface CaptionLine {
  readonly endTime: number;
  readonly startTime: number;
  readonly text: string;
}

export interface CaptionPosition {
  readonly x: number;
  readonly y: number;
}

export interface ClipCrop {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface ClipPreviewCandidate {
  readonly captionLines: readonly CaptionLine[];
  readonly captionPosition: CaptionPosition;
  readonly captionStyle: "hormozi";
  readonly captionsEnabled: true;
  readonly crop: ClipCrop | null;
  readonly endTime: number;
  readonly id: string;
  readonly previewFontSize: number;
  readonly rank: number;
  readonly score: number;
  readonly startTime: number;
  readonly title: string;
}

export interface ProjectClipList {
  readonly clips: readonly ClipPreviewCandidate[];
  readonly projectId: string;
  readonly sourceDurationSeconds: number;
}

export const captionLineSchema = z
  .object({
    endTime: z.number().finite().positive(),
    startTime: z.number().finite().nonnegative(),
    text: z.string().min(1).max(160),
  })
  .strict();

export const captionPositionSchema = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
  })
  .strict();

export const clipCropSchema = z
  .object({
    height: z.number().finite().positive().max(1),
    width: z.number().finite().positive().max(1),
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
  })
  .strict();

export const clipPreviewCandidateSchema = z
  .object({
    captionLines: z.array(captionLineSchema).min(1).max(200),
    captionPosition: captionPositionSchema,
    captionStyle: z.literal("hormozi"),
    captionsEnabled: z.literal(true),
    crop: clipCropSchema.nullable(),
    endTime: z.number().finite().positive(),
    id: z.uuid(),
    previewFontSize: z.number().int().min(12).max(96),
    rank: z.number().int().min(0).max(9),
    score: z.number().finite().min(0).max(1),
    startTime: z.number().finite().nonnegative(),
    title: z.string().min(1).max(120),
  })
  .strict()
  .superRefine((candidate, context) => {
    if (candidate.endTime <= candidate.startTime) {
      context.addIssue({ code: "custom", message: "Clip timestamps are invalid." });
    }
    if (
      candidate.captionLines.some(
        (line) =>
          line.startTime < candidate.startTime - 0.001 ||
          line.endTime <= line.startTime ||
          line.endTime > candidate.endTime + 0.001,
      )
    ) {
      context.addIssue({ code: "custom", message: "Caption timestamps are invalid." });
    }
    if (
      candidate.crop &&
      (candidate.crop.x + candidate.crop.width > 1 || candidate.crop.y + candidate.crop.height > 1)
    ) {
      context.addIssue({ code: "custom", message: "Clip crop is invalid." });
    }
  });

export const projectClipListSchema = z
  .object({
    clips: z.array(clipPreviewCandidateSchema).max(10),
    projectId: z.uuid(),
    sourceDurationSeconds: z.coerce.number().finite().positive(),
  })
  .strip()
  .superRefine((list, context) => {
    if (list.clips.some((clip) => clip.endTime > list.sourceDurationSeconds + 0.001)) {
      context.addIssue({ code: "custom", message: "Clip exceeds source duration." });
    }
  });
