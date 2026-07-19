import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import {
  ANALYSIS_RATE_LIMIT_CLIENT,
  AnalysisRateLimitGuard,
  ArcjetAnalysisRateLimitClient,
} from "./analysis-rate-limit.guard";
import { ProcessingController } from "./processing.controller";
import {
  PROCESSING_START_REPOSITORY,
  ProcessingStartRepository,
} from "./processing-start.repository";
import { ProcessingStartService } from "./processing-start.service";

@Module({
  controllers: [ProcessingController],
  imports: [AuthModule, InfrastructureModule],
  providers: [
    ProcessingStartService,
    ProcessingStartRepository,
    AnalysisRateLimitGuard,
    {
      provide: ANALYSIS_RATE_LIMIT_CLIENT,
      useClass: ArcjetAnalysisRateLimitClient,
    },
    {
      provide: PROCESSING_START_REPOSITORY,
      useExisting: ProcessingStartRepository,
    },
  ],
})
export class ProcessingModule {}
