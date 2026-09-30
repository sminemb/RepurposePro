import { z } from "zod";
import { clipPreviewCandidateSchema } from "./clips";
import { framingTracksSchema } from "./framing";

export const VIDEO_RENDER_QUEUE = "video-render-queue";
export const RENDER_CLIP_JOB = "render_clips";
export const renderClipInputSchema = z
  .object({
    type: z.literal("clips"),
    clipIds: z.tuple([z.uuid()]),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export type RenderClipInput = z.infer<typeof renderClipInputSchema>;
export const renderStartSchema = z.object({
  jobId: z.uuid(),
  status: z.enum(["queued", "active", "completed", "failed"]),
  outputCount: z.literal(1),
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
export const outputMetadataSchema = z
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
  })
  .strip();
export type OutputMetadata = z.infer<typeof outputMetadataSchema>;
export const outputListSchema = z.array(outputMetadataSchema);
