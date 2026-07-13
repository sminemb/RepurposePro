import { ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";
import { MulterError } from "multer";
import type { Response } from "express";

import type { AuthenticatedRequest } from "../auth/auth.guard";

@Catch(MulterError)
export class UploadExceptionFilter implements ExceptionFilter {
  public catch(exception: MulterError, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = host.switchToHttp().getResponse<Response>();
    const isTooLarge = exception.code === "LIMIT_FILE_SIZE";
    const maxUploadBytes = loadApiConfig().maxUploadBytes;
    response
      .status(isTooLarge ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.UNPROCESSABLE_ENTITY)
      .json({
        error: {
          code: isTooLarge ? "UPLOAD_FILE_TOO_LARGE" : "UPLOAD_INVALID_FILE",
          details: isTooLarge ? { maxBytes: maxUploadBytes } : null,
          message: isTooLarge
            ? "This file is larger than 500 MB."
            : "Upload exactly one video file using the file field.",
          requestId: request.id ?? "req_unknown",
        },
      });
  }
}
