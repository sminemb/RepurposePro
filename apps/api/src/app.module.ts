import { Module } from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";
import { LoggerModule } from "nestjs-pino";

import { AuthModule } from "./modules/auth/auth.module";
import { BillingModule } from "./modules/billing/billing.module";
import { HealthModule } from "./modules/health/health.module";
import { InfrastructureModule } from "./modules/infrastructure/infrastructure.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { ProcessingModule } from "./modules/processing/processing.module";
import { createLoggingConfig } from "./logging.config";

const config = loadApiConfig();

@Module({
  imports: [
    LoggerModule.forRoot(createLoggingConfig(config)),
    InfrastructureModule,
    HealthModule,
    AuthModule,
    BillingModule,
    ProjectsModule,
    ProcessingModule,
  ],
})
export class AppModule {}
