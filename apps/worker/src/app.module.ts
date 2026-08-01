import { resolve } from "node:path";

import { Module } from "@nestjs/common";
import { loadWorkerConfig } from "@repurposepro/config";
import { createDatabaseClient } from "@repurposepro/db";
import { LoggerModule } from "nestjs-pino";

import { createLoggingConfig } from "./logging.config";
import {
  ANALYSIS_TRANSCRIPT_REPOSITORY,
  AnalysisTranscriptRepository,
  type AnalysisTranscriptRepositoryContract,
} from "./services/analysis-transcript.repository";
import { AnalysisTranscriptService } from "./services/analysis-transcript.service";
import { TranscriptionAudioExtractor } from "./services/transcription-audio-extractor.service";
import {
  PROCESSING_LIFECYCLE_REPOSITORY,
  ProcessingLifecycleRepository,
} from "./services/processing-lifecycle.repository";
import { ProcessingLifecycleService } from "./services/processing-lifecycle.service";
import { WorkerInfrastructureService } from "./services/worker-infrastructure.service";
import { WhisperTranscriber } from "./services/whisper-transcriber.service";

const config = loadWorkerConfig();

@Module({
  imports: [LoggerModule.forRoot(createLoggingConfig(config))],
  providers: [
    WorkerInfrastructureService,
    ProcessingLifecycleService,
    {
      provide: WhisperTranscriber,
      useFactory: () =>
        new WhisperTranscriber({
          ...config.whisper,
          language: "en",
          scriptPath: resolve(__dirname, "../../python/transcribe.py"),
          storageRoot: config.storageRoot,
        }),
    },
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
    {
      provide: ANALYSIS_TRANSCRIPT_REPOSITORY,
      useFactory: () =>
        new AnalysisTranscriptRepository(
          createDatabaseClient({
            connectionString: config.processingDatabaseUrl,
            poolMax: config.databasePoolMax,
            ssl: config.databaseSsl,
          }),
        ),
    },
    {
      provide: AnalysisTranscriptService,
      inject: [ANALYSIS_TRANSCRIPT_REPOSITORY, TranscriptionAudioExtractor, WhisperTranscriber],
      useFactory: (
        repository: AnalysisTranscriptRepositoryContract,
        extractor: TranscriptionAudioExtractor,
        transcriber: WhisperTranscriber,
      ) => new AnalysisTranscriptService(repository, extractor, transcriber, config.whisper.model),
    },
  ],
})
export class AppModule {}
