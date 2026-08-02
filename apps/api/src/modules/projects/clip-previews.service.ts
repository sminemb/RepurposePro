import { stat } from "node:fs/promises";
import { resolve } from "node:path";

import { Injectable, Logger } from "@nestjs/common";
import { projectClipListSchema, type ProjectClipList } from "@repurposepro/shared";
import { z } from "zod";

import { DatabaseService } from "../infrastructure/database.service";
import { LocalStorageService } from "../storage/local-storage.service";

const sourceRowSchema = z.object({
  expiresAt: z.coerce.date(),
  fileSizeBytes: z.coerce.number().int().positive(),
  mimeType: z.enum(["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"]),
  originalFileName: z.string().min(1),
  storagePath: z.string().min(1),
});

export type ClipPreviewAccessErrorCode =
  "CLIPS_NOT_FOUND" | "SOURCE_VIDEO_EXPIRED" | "SOURCE_VIDEO_NOT_FOUND";

export class ClipPreviewAccessError extends Error {
  public constructor(public readonly code: ClipPreviewAccessErrorCode) {
    super(
      code === "SOURCE_VIDEO_EXPIRED"
        ? "The source video has expired."
        : code === "CLIPS_NOT_FOUND"
          ? "Clip previews were not found."
          : "The source video is unavailable.",
    );
    this.name = "ClipPreviewAccessError";
  }
}

export interface SourceVideoContent {
  readonly fileSizeBytes: number;
  readonly mimeType: string;
  readonly path: string;
}

interface ClipListRow {
  readonly clips: unknown;
  readonly projectId: unknown;
  readonly sourceDurationSeconds: unknown;
}

interface SourceContentRow {
  readonly expiresAt: unknown;
  readonly fileSizeBytes: unknown;
  readonly mimeType: unknown;
  readonly originalFileName: unknown;
  readonly storagePath: unknown;
}

@Injectable()
export class ClipPreviewsService {
  private readonly logger = new Logger(ClipPreviewsService.name);

  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly localStorageService: LocalStorageService,
  ) {}

  public async list(userId: string, projectId: string): Promise<ProjectClipList> {
    const result = await this.databaseService.database.pool.query<ClipListRow>(
      `SELECT
        project_id AS "projectId",
        source_duration_seconds AS "sourceDurationSeconds",
        clips
       FROM public.list_owned_project_clip_candidates($1, $2)`,
      [userId, projectId],
    );
    if (result.rows.length === 0) throw new ClipPreviewAccessError("CLIPS_NOT_FOUND");
    const parsed = projectClipListSchema.safeParse(result.rows[0]);
    if (!parsed.success) throw new Error("Clip preview persistence returned an invalid result.");
    return parsed.data;
  }

  public async getSourceVideoContent(
    userId: string,
    projectId: string,
  ): Promise<SourceVideoContent> {
    const result = await this.databaseService.database.pool.query<SourceContentRow>(
      `SELECT
        storage_path AS "storagePath",
        mime_type AS "mimeType",
        file_size_bytes AS "fileSizeBytes",
        expires_at AS "expiresAt",
        original_file_name AS "originalFileName"
       FROM public.get_owned_source_video_content($1, $2)`,
      [userId, projectId],
    );
    if (result.rows.length === 0) {
      throw new ClipPreviewAccessError("SOURCE_VIDEO_NOT_FOUND");
    }
    const parsed = sourceRowSchema.safeParse(result.rows[0]);
    if (!parsed.success) throw new Error("Source video persistence returned an invalid result.");
    if (parsed.data.expiresAt.getTime() <= Date.now()) {
      throw new ClipPreviewAccessError("SOURCE_VIDEO_EXPIRED");
    }

    try {
      const source = await this.localStorageService.readSourceUpload(userId, projectId);
      const details = await stat(source.videoPath);
      if (
        !details.isFile() ||
        details.size !== parsed.data.fileSizeBytes ||
        source.manifest.fileSizeBytes !== parsed.data.fileSizeBytes ||
        source.manifest.mimeType !== parsed.data.mimeType ||
        !samePath(source.videoPath, parsed.data.storagePath)
      ) {
        throw new ClipPreviewAccessError("SOURCE_VIDEO_NOT_FOUND");
      }
      return {
        fileSizeBytes: parsed.data.fileSizeBytes,
        mimeType: parsed.data.mimeType,
        path: source.videoPath,
      };
    } catch (error: unknown) {
      if (error instanceof ClipPreviewAccessError) throw error;
      this.logger.error({
        error,
        event: "clip_preview_source_validation_failed",
        projectId,
        userId,
      });
      throw new ClipPreviewAccessError("SOURCE_VIDEO_NOT_FOUND");
    }
  }
}

function samePath(left: string, right: string): boolean {
  const resolvedLeft = resolve(left);
  const resolvedRight = resolve(right);
  return process.platform === "win32"
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight;
}
