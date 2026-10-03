import { z } from "zod";
import { clipPreviewCandidateSchema } from "./clips";
import { framingTracksSchema } from "./framing";

export const VIDEO_RENDER_QUEUE = "video-render-queue";
export const RENDER_CLIP_JOB = "render_clips";
export const RENDER_SUMMARY_JOB = "render_summary";
export const renderSummaryInputSchema = z
  .object({ type: z.literal("summary"), expectedRevision: z.number().int().nonnegative() })
  .strict();
const legacyRenderClipInputSchema = z
  .object({
    type: z.literal("clips"),
    clipIds: z.tuple([z.uuid().transform((id) => id.toLowerCase())]),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export const batchRenderClipInputSchema = z
  .object({
    type: z.literal("clips"),
    clipIds: z
      .array(z.uuid().transform((id) => id.toLowerCase()))
      .min(1)
      .max(10),
    expectedRevisions: z.record(
      z.uuid().transform((id) => id.toLowerCase()),
      z.number().int().nonnegative(),
    ),
  })
  .strict()
  .refine(
    (input) =>
      new Set(input.clipIds).size === input.clipIds.length &&
      Object.keys(input.expectedRevisions).length === input.clipIds.length &&
      input.clipIds.every((id) => input.expectedRevisions[id] !== undefined),
    "Provide each selected clip and its saved revision exactly once.",
  );
export const renderClipInputSchema = z.union([
  legacyRenderClipInputSchema,
  batchRenderClipInputSchema,
]);
export type RenderClipInput = z.infer<typeof renderClipInputSchema>;
export const renderInputSchema = z.union([renderClipInputSchema, renderSummaryInputSchema]);
export type RenderInput = z.infer<typeof renderInputSchema>;
export const renderStartSchema = z.object({
  jobId: z.uuid(),
  status: z.enum(["queued", "active", "completed", "failed"]),
  outputCount: z.number().int().min(1).max(10),
});
export type RenderStart = z.infer<typeof renderStartSchema>;
export const renderSnapshotSchema = z
  .object({
    clip: clipPreviewCandidateSchema,
    tracks: framingTracksSchema.nullable(),
    sourceId: z.uuid(),
    sourcePath: z.string().min(1),
    sourceExpiresAt: z.coerce.date(),
    sourceFileSizeBytes: z.coerce.number().int().positive(),
    sourceWidth: z.number().int().positive(),
    sourceHeight: z.number().int().positive(),
    projectId: z.uuid(),
    userId: z.string().min(1),
  })
  .strict();
export type RenderSnapshot = z.infer<typeof renderSnapshotSchema>;
const clipOutputMetadataSchema = z
  .object({
    id: z.uuid(),
    renderJobId: z.uuid(),
    clipId: z.uuid(),
    type: z.literal("clip"),
    title: z.string(),
    durationSeconds: z.coerce.number().positive(),
    fileSizeBytes: z.coerce.number().int().positive(),
    width: z.literal(1080),
    height: z.literal(1920),
    status: z.enum(["ready", "failed", "expired", "deleted"]),
    createdAt: z.string(),
    expiresAt: z.string(),
    deletedAt: z.string().nullable().optional().default(null),
  })
  .strip();
export const outputMetadataSchema = z.discriminatedUnion("type", [
  clipOutputMetadataSchema,
  clipOutputMetadataSchema.extend({
    type: z.literal("summary"),
    clipId: z.null(),
    width: z.number().int().positive().multipleOf(2),
    height: z.number().int().positive().multipleOf(2),
  }),
]);
export type OutputMetadata = z.infer<typeof outputMetadataSchema>;
export const outputListSchema = z.array(outputMetadataSchema);
