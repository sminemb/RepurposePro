import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { assertSafeStoragePath, loadApiConfig } from "@repurposepro/config";
import { diskStorage } from "multer";
import { MulterError } from "multer";
import { parseSourceVideoUpload } from "./projects.contracts";
import type { Observable } from "rxjs";
import { DatabaseService } from "../infrastructure/database.service";
import type { AuthenticatedRequest } from "../auth/auth.guard";

@Injectable()
export class UploadFileInterceptor implements NestInterceptor {
  private readonly delegate: NestInterceptor;

  public constructor(database: DatabaseService) {
    const config = loadApiConfig();
    const stagingDirectory = join(config.storageRoot, ".staging");
    const storage = diskStorage({
      destination: (_request, file, callback) => {
        void (async () => {
          await assertSafeStoragePath(config.storageRoot, stagingDirectory, true);
          await mkdir(stagingDirectory, { recursive: true });
          await assertSafeStoragePath(config.storageRoot, stagingDirectory);
        })().then(
          () =>
            callback(
              file.stream.destroyed ? new Error("Upload interrupted.") : null,
              stagingDirectory,
            ),
          () => callback(new Error("Upload storage unavailable."), ""),
        );
      },
      filename: (request, file, callback) => {
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
            if (!result.rows[0]?.id) throw new Error("Upload unavailable.");
            const release = () => {
              clearInterval(timer);
              void database.database.pool
                .query("SELECT public.touch_upload_storage_target($1,true)", [token])
                .catch(() => undefined);
            };
            const timer = setInterval(() => {
              void database.database.pool
                .query<{ valid: boolean }>(
                  "SELECT public.touch_upload_storage_target($1,false) AS valid",
                  [token],
                )
                .then((next) => {
                  if (!next.rows[0]?.valid) request.destroy(new Error("Upload lease lost."));
                })
                .catch(() => request.destroy(new Error("Upload lease unavailable.")));
            }, 20_000);
            let released = false;
            const stop = () => {
              if (!released) {
                released = true;
                release();
              }
            };
            request.res?.once("finish", stop);
            request.res?.once("close", stop);
            request.once("aborted", stop);
            // A fully received IncomingMessage is normally destroyed while registration awaits
            // PostgreSQL. Only an incomplete destroyed request represents an interrupted upload.
            if (
              (request.destroyed && !request.complete) ||
              request.res?.destroyed ||
              file.stream.destroyed
            ) {
              stop();
              callback(new Error("Upload interrupted."), "");
              return;
            }
            callback(null, token);
          })
          .catch(() => callback(new Error("Upload could not be registered."), ""));
      },
    });
    // Multer may abort before asynchronous durable registration assigns a path.
    storage._removeFile = (_request, file, callback) => {
      if (!file.path) {
        callback(null);
        return;
      }
      void assertSafeStoragePath(config.storageRoot, file.path, true)
        .then((path) => rm(path, { force: true }))
        .then(
          () => callback(null),
          () => callback(new Error("Upload cleanup unavailable.")),
        );
    };
    const Interceptor = FileInterceptor("file", {
      fileFilter: (_request, file, callback) => {
        try {
          parseSourceVideoUpload({ ...file, size: 1, path: "pending" });
          callback(null, true);
        } catch {
          callback(new MulterError("LIMIT_UNEXPECTED_FILE", "file"), false);
        }
      },
      limits: {
        fileSize: config.maxUploadBytes,
        files: 1,
        fields: 0,
        // Busboy 1.6 emits partsLimit when it reaches this count, not only when exceeded.
        // files/fields still reject a second part; leave room for the valid first file.
        parts: 2,
        fieldNameSize: 100,
        headerPairs: 100,
      },
      storage,
    });

    this.delegate = new Interceptor();
  }

  public async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    try {
      return await this.delegate.intercept(context, next);
    } catch (error) {
      if (error instanceof HttpException && [400, 413].includes(error.getStatus())) {
        const tooLarge = error.getStatus() === 413;
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        throw new HttpException(
          {
            error: {
              code: tooLarge ? "UPLOAD_FILE_TOO_LARGE" : "UPLOAD_INVALID_FILE",
              details: tooLarge ? { maxBytes: loadApiConfig().maxUploadBytes } : null,
              message: tooLarge
                ? "This file is larger than 500 MB."
                : "Upload exactly one supported video file using the file field.",
              requestId: request.id ?? "req_unknown",
            },
          },
          tooLarge ? 413 : 422,
        );
      }
      throw error;
    }
  }
}
