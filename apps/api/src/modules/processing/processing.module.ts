import { Module } from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";

import { AuthModule } from "../auth/auth.module";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import { RedisService } from "../infrastructure/redis.service";
import {
  ANALYSIS_DISPATCH_REPOSITORY,
  AnalysisDispatchRepository,
} from "./analysis-dispatch.repository";
import {
  ANALYSIS_DISPATCHER_OPTIONS,
  AnalysisDispatcherService,
  createAnalysisDispatcherOptions,
} from "./analysis-dispatcher.service";
import {
  ANALYSIS_QUEUE_EVENTS,
  AnalysisQueueFailureListener,
  createAnalysisQueueEventsClient,
} from "./analysis-queue-failure.listener";
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
import {
  PROCESSING_FAILURE_REPOSITORY,
  ProcessingFailureRepository,
} from "./processing-failure.repository";
import { ProcessingFailureService } from "./processing-failure.service";
import { ProcessingStartService } from "./processing-start.service";
import { processingDatabaseProvider } from "./scoped-database.provider";
import {
  PROCESSING_STATUS_REPOSITORY,
  ProcessingStatusRepository,
} from "./processing-status.repository";
import { ProcessingStatusService } from "./processing-status.service";

@Module({
  controllers: [ProcessingController],
  imports: [AuthModule, InfrastructureModule],
  providers: [
    ProcessingStartService,
    ProcessingStartRepository,
    AnalysisDispatchRepository,
    AnalysisDispatcherService,
    AnalysisQueueFailureListener,
    ProcessingFailureRepository,
    ProcessingFailureService,
    processingDatabaseProvider,
    ProcessingStatusService,
    ProcessingStatusRepository,
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
      provide: ANALYSIS_DISPATCH_REPOSITORY,
      useExisting: AnalysisDispatchRepository,
    },
    {
      provide: ANALYSIS_DISPATCHER_OPTIONS,
      useFactory: createAnalysisDispatcherOptions,
    },
    {
      provide: PROCESSING_FAILURE_REPOSITORY,
      useExisting: ProcessingFailureRepository,
    },
    {
      provide: PROCESSING_STATUS_REPOSITORY,
      useExisting: ProcessingStatusRepository,
    },
    {
      provide: ANALYSIS_QUEUE_GATEWAY,
      inject: [RedisService],
      useFactory: (redisService: RedisService) =>
        new BullMqAnalysisQueueGateway(redisService.connection, loadApiConfig().bullmqPrefix),
    },
    {
      provide: ANALYSIS_QUEUE_EVENTS,
      inject: [RedisService],
      useFactory: (redisService: RedisService) =>
        createAnalysisQueueEventsClient(redisService.connection, loadApiConfig().bullmqPrefix),
    },
  ],
})
export class ProcessingModule {}
