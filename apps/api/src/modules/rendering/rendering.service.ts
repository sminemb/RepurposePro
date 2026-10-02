import { Injectable, HttpException } from "@nestjs/common";
import { renderStartSchema, outputMetadataSchema, type RenderInput } from "@repurposepro/shared";
import { z } from "zod";
import { DatabaseService } from "../infrastructure/database.service";

export function renderHttpError(code: string, requestId = "req_unknown"): HttpException {
  const status =
    code === "PROJECT_NOT_FOUND" ||
    code === "SUMMARY_NOT_FOUND" ||
    code === "JOB_NOT_FOUND" ||
    code === "RENDER_CLIP_NOT_FOUND" ||
    code === "OUTPUT_NOT_FOUND" ||
    code === "OUTPUT_FILE_MISSING"
      ? 404
      : code === "OUTPUT_EXPIRED" || code === "OUTPUT_DELETED" || code === "SOURCE_VIDEO_EXPIRED"
        ? 410
        : code === "VALIDATION_ERROR"
          ? 400
          : 409;
  const messages: Record<string, string> = {
    SUMMARY_EDIT_CONFLICT:
      "This summary changed elsewhere. Reload the saved version before continuing.",
    SUMMARY_INVALID_RANGES:
      "Selected segments must stay within the source and remain chronological without overlap.",
    SUMMARY_EMPTY_SELECTION: "Restore at least one segment before rendering your summary.",
    CLIP_EDIT_CONFLICT: "This clip changed elsewhere. Reload its saved version before rendering.",
    RENDER_ALREADY_RUNNING: "A render or replacement is already running. Wait for it to finish.",
    RENDER_CLIP_NOT_SELECTED:
      "A requested clip is no longer selected. Reload the editor before exporting.",
    RENDER_FRAMING_PENDING:
      "Person tracking is still running. Wait for it to finish or use manual framing.",
    SOURCE_VIDEO_EXPIRED: "The source video has expired.",
    OUTPUT_EXPIRED: "This export has expired.",
    OUTPUT_DELETED: "This export was deleted.",
    OUTPUT_FILE_MISSING: "This export's file is unavailable.",
  };
  return new HttpException(
    {
      error: {
        code,
        details: null,
        requestId,
        message:
          messages[code] ??
          "This render or export is unavailable. Check the project and try again.",
      },
    },
    status,
  );
}

@Injectable()
export class RenderingService {
  public constructor(private readonly database: DatabaseService) {}
  public async start(
    userId: string,
    projectId: string,
    input: RenderInput,
    key: string,
    requestId: string,
  ) {
    if (input.type === "summary") {
      const result = await this.database.database.pool.query<{ result: unknown }>(
        "SELECT public.start_owned_summary_render($1,$2,$3,$4) AS result",
        [userId, projectId, input.expectedRevision, key],
      );
      const data = result.rows[0]?.result;
      if (data && typeof data === "object" && "error" in data && typeof data.error === "string")
        throw renderHttpError(data.error, requestId);
      return renderStartSchema.parse(data);
    }
    const result = await this.database.database.pool.query<{ result: unknown }>(
      "SELECT public.start_owned_clip_batch_render($1,$2,$3,$4) AS result",
      [
        userId,
        projectId,
        "expectedRevisions" in input
          ? input.expectedRevisions
          : { [input.clipIds[0]]: input.expectedRevision },
        key,
      ],
    );
    const data = result.rows[0]?.result;
    if (data && typeof data === "object" && "error" in data && typeof data.error === "string")
      throw renderHttpError(data.error, requestId);
    return renderStartSchema.parse(data);
  }
  public async list(userId: string, projectId: string) {
    const result = await this.database.database.pool.query<{ result: unknown }>(
      "SELECT public.list_owned_render_outputs($1,$2) AS result",
      [userId, projectId],
    );
    if (result.rows[0]?.result == null) throw renderHttpError("PROJECT_NOT_FOUND");
    return z.array(outputMetadataSchema).parse(result.rows[0].result);
  }
  public async download(userId: string, projectId: string, outputId: string) {
    const result = await this.database.database.pool.query<{ result: unknown }>(
      "SELECT public.get_owned_render_output($1,$2,$3) AS result",
      [userId, projectId, outputId],
    );
    if (!result.rows[0]?.result) throw renderHttpError("OUTPUT_NOT_FOUND");
    const output = z
      .object({
        storagePath: z.string(),
        fileName: z.string(),
        fileSizeBytes: z.coerce.number().positive(),
        expiresAt: z.coerce.date(),
        deleted: z.boolean(),
        status: z.string(),
      })
      .parse(result.rows[0].result);
    if (output.deleted) throw renderHttpError("OUTPUT_DELETED");
    if (output.expiresAt.getTime() <= Date.now() || output.status === "expired")
      throw renderHttpError("OUTPUT_EXPIRED");
    if (output.status !== "ready") throw renderHttpError("OUTPUT_NOT_FOUND");
    return output;
  }
}
