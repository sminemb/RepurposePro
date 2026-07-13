import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs";
import { join } from "node:path";

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { loadApiConfig } from "@repurposepro/config";
import { diskStorage } from "multer";
import type { Observable } from "rxjs";

@Injectable()
export class UploadFileInterceptor implements NestInterceptor {
  private readonly delegate: NestInterceptor;

  public constructor() {
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
        filename: (_request, _file, callback) => callback(null, randomUUID()),
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
