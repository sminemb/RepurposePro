import { Module } from "@nestjs/common";
import { loadWorkerConfig } from "@repurposepro/config";
import { createDatabaseClient } from "@repurposepro/db";
import { LoggerModule } from "nestjs-pino";

import { createLoggingConfig } from "./logging.config";
import { TranscriptionAudioExtractor } from "./services/transcription-audio-extractor.service";
import {
  PROCESSING_LIFECYCLE_REPOSITORY,
  ProcessingLifecycleRepository,
} from "./services/processing-lifecycle.repository";
import { ProcessingLifecycleService } from "./services/processing-lifecycle.service";
import { WorkerInfrastructureService } from "./services/worker-infrastructure.service";

const config = loadWorkerConfig();

@Module({
  imports: [LoggerModule.forRoot(createLoggingConfig(config))],
  providers: [
    WorkerInfrastructureService,
    ProcessingLifecycleService,
    {
      provide: TranscriptionAudioExtractor,
      useFactory: () =>
        new TranscriptionAudioExtractor({
          ffmpegPath: config.ffmpegPath,
          storageRoot: config.storageRoot,
        }),
    },
    {
      provide: PROCESSING_LIFECYCLE_REPOSITORY,
      useFactory: () =>
        new ProcessingLifecycleRepository(
          createDatabaseClient({
            connectionString: config.processingDatabaseUrl,
            poolMax: config.databasePoolMax,
            ssl: config.databaseSsl,
          }),
        ),
    },
  ],
})
export class AppModule {}
