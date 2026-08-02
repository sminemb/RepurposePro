import { Module } from "@nestjs/common";
import { loadWorkerConfig } from "@repurposepro/config";
import { createDatabaseClient } from "@repurposepro/db";
import { LoggerModule } from "nestjs-pino";

import { createLoggingConfig } from "./logging.config";
import {
  ANALYSIS_PIPELINE_HANDLER,
  AnalysisJobProcessor,
  type AnalysisPipelineHandler,
} from "./processors/analysis-job.processor";
import { AnalysisPipelineService } from "./services/analysis-pipeline.service";
import { AnalysisQueueConsumerService } from "./services/analysis-queue-consumer.service";
import {
  ANALYSIS_TRANSCRIPT_REPOSITORY,
  AnalysisTranscriptRepository,
  type AnalysisTranscriptRepositoryContract,
} from "./services/analysis-transcript.repository";
import { AnalysisTranscriptService } from "./services/analysis-transcript.service";
import {
  createGoogleGeminiClient,
  GeminiClipSelector,
  type GeminiModelClient,
} from "./services/gemini-clip-selector.service";
import {
  PROCESSING_LIFECYCLE_REPOSITORY,
  ProcessingLifecycleRepository,
} from "./services/processing-lifecycle.repository";
import { ProcessingLifecycleService } from "./services/processing-lifecycle.service";
import { TranscriptionAudioExtractor } from "./services/transcription-audio-extractor.service";
import { WorkerInfrastructureService } from "./services/worker-infrastructure.service";
import { WhisperTranscriber } from "./services/whisper-transcriber.service";
import { resolveWhisperScriptPath } from "./whisper-script-path";

const config = loadWorkerConfig();

@Module({
  imports: [LoggerModule.forRoot(createLoggingConfig(config))],
  providers: [
    WorkerInfrastructureService,
    ProcessingLifecycleService,
    AnalysisJobProcessor,
    {
      provide: WhisperTranscriber,
      useFactory: () =>
        new WhisperTranscriber({
          ...config.whisper,
          language: "en",
          scriptPath: resolveWhisperScriptPath(__dirname),
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
      // Keep this pool separate: each repository owns its client's init/destroy lifecycle.
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
      // Sharing the lifecycle pool would make both repositories close the same client at shutdown.
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
    {
      provide: GeminiClipSelector,
      useFactory: async () => {
        const client: GeminiModelClient = config.gemini.apiKey
          ? await createGoogleGeminiClient(config.gemini.apiKey)
          : {
              generateContent: async () => {
                throw new Error("GEMINI_API_KEY is not configured.");
              },
            };
        return new GeminiClipSelector(client, config.gemini);
      },
    },
    {
      provide: ANALYSIS_PIPELINE_HANDLER,
      inject: [ANALYSIS_TRANSCRIPT_REPOSITORY, AnalysisTranscriptService, GeminiClipSelector],
      useFactory: (
        repository: AnalysisTranscriptRepositoryContract,
        transcripts: AnalysisTranscriptService,
        selector: GeminiClipSelector,
      ): AnalysisPipelineHandler => new AnalysisPipelineService(repository, transcripts, selector),
    },
    {
      provide: AnalysisQueueConsumerService,
      inject: [AnalysisJobProcessor],
      useFactory: (processor: AnalysisJobProcessor) =>
        new AnalysisQueueConsumerService(processor, {
          prefix: config.bullmqPrefix,
          redisUrl: config.redisUrl,
        }),
    },
  ],
})
export class AppModule {}
