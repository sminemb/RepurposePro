import { Injectable, Logger } from "@nestjs/common";
import { clipEditorSchema, type ClipEditor, type ClipEditInput } from "@repurposepro/shared";

import { DatabaseService } from "../infrastructure/database.service";

export class ClipEditorError extends Error {
  public constructor(public readonly code: string) {
    super(
      code === "CLIP_EDIT_CONFLICT"
        ? "This clip was changed elsewhere. Reload its saved version before saving again."
        : code === "CLIP_NOT_FOUND"
          ? "This clip is no longer available."
          : code === "CLIP_INVALID_TIME_RANGE"
            ? "End time must be after start time."
            : code === "CLIP_OUTSIDE_SOURCE_DURATION"
              ? "The clip must stay within the source video."
              : "Check the caption settings and try again.",
    );
    this.name = "ClipEditorError";
  }
}

@Injectable()
export class ClipEditorService {
  private readonly logger = new Logger(ClipEditorService.name);
  public constructor(private readonly databaseService: DatabaseService) {}

  public async get(userId: string, projectId: string, clipId: string): Promise<ClipEditor> {
    const result = await this.databaseService.database.pool.query<{ result: unknown }>(
      "SELECT public.get_owned_clip_editor($1, $2, $3) AS result",
      [userId, projectId, clipId],
    );
    if (!result.rows[0]?.result) throw new ClipEditorError("CLIP_NOT_FOUND");
    return clipEditorSchema.parse(result.rows[0].result);
  }

  public async save(
    userId: string,
    projectId: string,
    clipId: string,
    input: ClipEditInput,
  ): Promise<ClipEditor> {
    const result = await this.databaseService.database.pool.query<{
      result: { outcome: string; editor?: unknown };
    }>("SELECT public.save_owned_clip_editor($1, $2, $3, $4::jsonb) AS result", [
      userId,
      projectId,
      clipId,
      JSON.stringify(input),
    ]);
    const saved = result.rows[0]?.result;
    if (!saved) throw new Error("Clip edit persistence returned no result.");
    if (saved.outcome !== "saved") {
      this.logger.warn({ event: "clip_edit_rejected", projectId, clipId, code: saved.outcome });
      throw new ClipEditorError(saved.outcome);
    }
    const editor = clipEditorSchema.parse(saved.editor);
    this.logger.log({
      event: "clip_edit_saved",
      projectId,
      clipId,
      revision: editor.clip.revision,
    });
    return editor;
  }
}
