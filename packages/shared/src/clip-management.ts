import { z } from "zod";
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
