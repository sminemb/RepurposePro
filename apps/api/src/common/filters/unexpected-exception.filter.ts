import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";

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
    const requestId = typeof request.id === "string" ? request.id : "req_unknown";

    if (exception instanceof HttpException) {
      const existingResponse = exception.getResponse();
      if (isErrorEnvelope(existingResponse)) {
        response.status(exception.getStatus()).json(existingResponse);
        return;
      }
    }

    const safeIdentifiers = safeRequestIdentifiers(request.params);
    this.logger.error({
      errorName: exception instanceof Error ? exception.name : "UnknownError",
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
  return typeof routePath === "string" ? routePath : request.path;
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
    if (typeof value === "string" && value.length <= 128) {
      safe[key] = value;
    }
  }

  return safe;
}
