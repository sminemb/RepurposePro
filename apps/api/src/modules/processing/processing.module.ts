import { Module } from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";

import { AuthModule } from "../auth/auth.module";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import { RedisService } from "../infrastructure/redis.service";
import { ANALYSIS_QUEUE_GATEWAY, BullMqAnalysisQueueGateway } from "./analysis-queue.gateway";
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
    {
      provide: ANALYSIS_QUEUE_GATEWAY,
      inject: [RedisService],
      useFactory: (redisService: RedisService) =>
        new BullMqAnalysisQueueGateway(redisService.connection, loadApiConfig().bullmqPrefix),
    },
  ],
})
export class ProcessingModule {}
