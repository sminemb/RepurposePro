import { z } from "zod";
export const bulkClipDeleteInputSchema = z
  .object({
    clips: z
      .array(
        z
          .object({
            id: z.uuid(),
            expectedRevision: z.number().int().min(0).max(2147483647),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .refine(
    ({ clips }) => new Set(clips.map((clip) => clip.id.toLowerCase())).size === clips.length,
    "Choose each clip only once.",
  );
export type BulkClipDeleteInput = z.infer<typeof bulkClipDeleteInputSchema>;
export const clipRegenerationResultSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("backup_candidate"), replacementClipId: z.uuid() }).strict(),
  z
    .object({
      source: z.literal("gemini_regeneration"),
      jobId: z.uuid(),
      status: z.enum(["queued", "active", "completed", "failed"]),
      replacementClipId: z.uuid().optional(),
    })
    .strict(),
]);
export type ClipRegenerationResult = z.infer<typeof clipRegenerationResultSchema>;
