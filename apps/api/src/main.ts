import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { loadApiConfig } from "@repurposepro/config";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const config = loadApiConfig();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix("api/v1");
  app.enableCors({
    credentials: true,
    origin: config.appUrl,
  });
  app.enableShutdownHooks();

  await app.listen(config.apiPort, "0.0.0.0");
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup error.";
  process.stderr.write(`API failed to start: ${message}\n`);
  process.exitCode = 1;
});
