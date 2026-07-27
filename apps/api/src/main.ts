import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { loadApiConfig } from "@repurposepro/config";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module";
import { describeApiStartupFailure } from "./startup-diagnostics";

let apiPort = 4000;

async function bootstrap(): Promise<void> {
  const config = loadApiConfig();
  apiPort = config.apiPort;
  process.stdout.write(`API startup: initializing application on port ${apiPort}.\n`);
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix("api/v1");
  app.enableCors({
    credentials: true,
    origin: config.appUrl,
  });
  app.enableShutdownHooks();

  process.stdout.write("API startup: connecting required services.\n");
  await app.listen(config.apiPort, "0.0.0.0");
  app.get(Logger).log(`API listening on port ${config.apiPort}. Readiness: /api/v1/health/ready.`);
}

void bootstrap().catch((error: unknown) => {
  process.stderr.write(`${describeApiStartupFailure(error, apiPort)}\n`);
  process.exitCode = 1;
});
