import { Module } from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";
import { LoggerModule } from "nestjs-pino";

import { HealthModule } from "./modules/health/health.module";
import { InfrastructureModule } from "./modules/infrastructure/infrastructure.module";
import { createLoggingConfig } from "./logging.config";

const config = loadApiConfig();

@Module({
  imports: [LoggerModule.forRoot(createLoggingConfig(config)), InfrastructureModule, HealthModule],
})
export class AppModule {}
