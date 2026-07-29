import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { loadApiConfig } from "@repurposepro/config";
import { LoggerModule } from "nestjs-pino";

import { AuthModule } from "./modules/auth/auth.module";
import { BillingModule } from "./modules/billing/billing.module";
import { HealthModule } from "./modules/health/health.module";
import { InfrastructureModule } from "./modules/infrastructure/infrastructure.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { ProcessingModule } from "./modules/processing/processing.module";
import { createLoggingConfig } from "./logging.config";
import { UnexpectedExceptionFilter } from "./common/filters/unexpected-exception.filter";

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
  providers: [
    {
      provide: APP_FILTER,
      useClass: UnexpectedExceptionFilter,
    },
  ],
})
export class AppModule {}
