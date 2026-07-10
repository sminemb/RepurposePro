import type { WorkerConfig } from "@repurposepro/config";
import type { Params } from "nestjs-pino";

export function createLoggingConfig(config: WorkerConfig): Params {
  return {
    pinoHttp: {
      level: config.logLevel,
      redact: {
        paths: ["password", "secret", "token"],
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
