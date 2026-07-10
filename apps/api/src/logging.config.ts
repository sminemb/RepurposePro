import { randomUUID } from "node:crypto";

import { RequestMethod } from "@nestjs/common";
import type { ApiConfig } from "@repurposepro/config";
import type { Params } from "nestjs-pino";

export function createLoggingConfig(config: ApiConfig): Params {
  return {
    forRoutes: [{ path: "{*splat}", method: RequestMethod.ALL }],
    pinoHttp: {
      autoLogging: true,
      genReqId(request, response): string {
        const incomingRequestId = request.headers["x-request-id"];
        const requestId =
          typeof incomingRequestId === "string" && incomingRequestId.length > 0
            ? incomingRequestId
            : `req_${randomUUID()}`;

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
