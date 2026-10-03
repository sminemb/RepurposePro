import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { safeRequestId } from "@repurposepro/config";

interface ErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly details: unknown;
    readonly message: string;
    readonly requestId: string;
  };
}

@Catch()
export class UnexpectedExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(UnexpectedExceptionFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = safeRequestId(request.id) ?? "req_unknown";

    if (exception instanceof HttpException) {
      const existingResponse = exception.getResponse();
      if (isErrorEnvelope(existingResponse)) {
        response.status(exception.getStatus()).json(existingResponse);
        return;
      }
      if (exception.getStatus() < 500 || exception.getStatus() === 503) {
        const status = exception.getStatus();
        const codes: Record<number, [string, string]> = {
          400: ["VALIDATION_ERROR", "Check your request and try again."],
          401: ["UNAUTHORIZED", "Sign in again to continue."],
          403: ["FORBIDDEN", "This request is not allowed."],
          404: ["RESOURCE_NOT_FOUND", "This resource is unavailable."],
          409: ["CONFLICT", "Refresh the saved state and try again."],
          410: ["RESOURCE_EXPIRED", "This resource has expired."],
          413: ["PAYLOAD_TOO_LARGE", "This request is too large."],
          422: ["VALIDATION_ERROR", "Check your request and try again."],
          429: ["RATE_LIMIT_EXCEEDED", "Too many requests. Wait a minute and try again."],
          503: [
            "SERVICE_UNAVAILABLE",
            "This service is temporarily unavailable. Try again shortly.",
          ],
        };
        const [code, message] = codes[status] ?? [
          "REQUEST_FAILED",
          "We could not complete this request.",
        ];
        response.status(status).json({ error: { code, message, details: null, requestId } });
        return;
      }
    }

    const safeIdentifiers = safeRequestIdentifiers(request.params);
    this.logger.error({
      errorName: "UnexpectedError",
      event: "unexpected_api_error",
      method: request.method,
      ...safeIdentifiers,
      requestId,
      route: safeRequestRoute(request),
    });
    response.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        details: null,
        message: "We could not complete this request.",
        requestId,
      },
    });
  }
}

function safeRequestRoute(request: Request): string {
  const routePath = (
    request as unknown as {
      readonly route?: { readonly path?: unknown };
    }
  ).route?.path;
  return typeof routePath === "string" && /^[a-zA-Z0-9_:/{}*.-]{1,200}$/.test(routePath)
    ? routePath
    : "unmatched";
}

function isErrorEnvelope(value: string | object): value is ErrorEnvelope {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }

  const error = value.error;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string" &&
    "details" in error &&
    "requestId" in error &&
    typeof error.requestId === "string"
  );
}

function safeRequestIdentifiers(params: Request["params"]): Record<string, string> {
  const safe: Record<string, string> = {};

  for (const key of ["clipId", "jobId", "outputId", "projectId"]) {
    const value = params?.[key];
    if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) {
      safe[key] = value;
    }
  }

  return safe;
}
