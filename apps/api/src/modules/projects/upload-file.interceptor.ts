import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs";
import { join } from "node:path";

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { loadApiConfig } from "@repurposepro/config";
import { diskStorage } from "multer";
import type { Observable } from "rxjs";
import { DatabaseService } from "../infrastructure/database.service";
import type { AuthenticatedRequest } from "../auth/auth.guard";

@Injectable()
export class UploadFileInterceptor implements NestInterceptor {
  private readonly delegate: NestInterceptor;

  public constructor(database: DatabaseService) {
    const config = loadApiConfig();
    const stagingDirectory = join(config.storageRoot, ".staging");
    const Interceptor = FileInterceptor("file", {
      limits: { fileSize: config.maxUploadBytes, files: 1 },
      storage: diskStorage({
        destination: (_request, _file, callback) => {
          mkdir(stagingDirectory, { recursive: true }, (error) =>
            callback(error, stagingDirectory),
          );
        },
        filename: (request, _file, callback) => {
          const token = randomUUID();
          const owned = request as AuthenticatedRequest;
          const projectId = owned.params.projectId;
          if (!owned.user || typeof projectId !== "string") {
            callback(new Error("Upload owner unavailable."), "");
            return;
          }
          void database.database.pool
            .query<{ id: string | null }>(
              "SELECT public.register_upload_storage_target($1,$2,$3,$4,$5) AS id",
              [
                owned.user.id,
                projectId,
                token,
                join(stagingDirectory, token).replaceAll("\\", "/"),
                config.fileRetentionDays,
              ],
            )
            .then((result) => {
              if (!result.rows[0]?.id) throw new Error("Upload is unavailable for this project.");
              if (request.destroyed || request.res?.destroyed) {
                void database.database.pool
                  .query("SELECT public.touch_upload_storage_target($1,true)", [token])
                  .catch(() => undefined);
                throw new Error("Upload was interrupted.");
              }
              let stopped = false;
              const timer = setInterval(() => {
                void database.database.pool
                  .query<{ valid: boolean }>(
                    "SELECT public.touch_upload_storage_target($1,false) AS valid",
                    [token],
                  )
                  .then((next) => {
                    if (!stopped && !next.rows[0]?.valid)
                      request.destroy(new Error("Upload lease lost."));
                  })
                  .catch(() => {
                    if (!stopped) request.destroy(new Error("Upload lease unavailable."));
                  });
              }, 20_000);
              const release = () => {
                if (stopped) return;
                stopped = true;
                clearInterval(timer);
                void database.database.pool
                  .query("SELECT public.touch_upload_storage_target($1,true)", [token])
                  .catch(() => undefined);
              };
              request.res?.once("finish", release);
              request.res?.once("close", release);
              request.once("aborted", release);
              callback(null, token);
            })
            .catch(() => callback(new Error("Upload could not be registered."), ""));
        },
      }),
    });

    this.delegate = new Interceptor();
  }

  public intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> | Promise<Observable<unknown>> {
    return this.delegate.intercept(context, next);
  }
}
