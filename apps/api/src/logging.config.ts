import { randomUUID } from "node:crypto";

import { RequestMethod } from "@nestjs/common";
import {
  safeRequestId,
  safeLogContext,
  safeLogSerializers,
  type ApiConfig,
} from "@repurposepro/config";
import type { Params } from "nestjs-pino";

export function createLoggingConfig(config: ApiConfig): Params {
  return {
    forRoutes: [{ path: "{*splat}", method: RequestMethod.ALL }],
    pinoHttp: {
      autoLogging: true,
      wrapSerializers: false,
      serializers: safeLogSerializers,
      formatters: { log: safeLogContext },
      customSuccessMessage: () => "request_completed",
      customErrorMessage: () => "request_failed",
      genReqId(request, response): string {
        const incomingRequestId = request.headers["x-request-id"];
        const requestId = safeRequestId(incomingRequestId) ?? `req_${randomUUID()}`;

        response.setHeader("x-request-id", requestId);
        return requestId;
      },
      level: config.logLevel,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "res.headers.set-cookie",
          "password",
          "secret",
          "token",
        ],
        censor: "[REDACTED]",
      },
      transport: config.logPretty
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              singleLine: true,
              translateTime: "SYS:standard",
            },
          }
        : undefined,
    },
  };
}
