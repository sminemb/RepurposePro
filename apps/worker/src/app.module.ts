import { GeminiClipRegenerator } from "./services/gemini-clip-regenerator.service";
import { GeminiSummarySelector } from "./services/gemini-summary-selector.service";
import { ClipRegenerationProcessor } from "./processors/clip-regeneration.processor";
import { resolve } from "node:path";
import { RenderWorkerService } from "./services/render-worker.service";
import { FaceTracker } from "./services/face-tracker.service";
import { FramingService } from "./services/framing.service";
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
    {
      provide: RenderWorkerService,
      useFactory: () =>
        new RenderWorkerService(
          createDatabaseClient({
            connectionString: config.processingDatabaseUrl,
            poolMax: config.databasePoolMax,
            ssl: config.databaseSsl,
          }),
          config,
        ),
    },
    {
      provide: FaceTracker,
      useFactory: () =>
        new FaceTracker({
          ...config.framing,
          ffmpegPath: config.ffmpegPath,
          storageRoot: config.storageRoot,
          scriptPath: resolve(__dirname, "../python/face_tracks.py"),
        }),
    },
    {
      provide: FramingService,
      inject: [FaceTracker],
      useFactory: (tracker: FaceTracker) =>
        new FramingService(
          createDatabaseClient({
            connectionString: config.processingDatabaseUrl,
            poolMax: config.databasePoolMax,
            ssl: config.databaseSsl,
          }),
          tracker,
          { redisUrl: config.redisUrl, prefix: config.bullmqPrefix },
        ),
    },
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
      provide: ClipRegenerationProcessor,
      useFactory: async () => {
        const client: GeminiModelClient = config.gemini.apiKey
          ? await createGoogleGeminiClient(config.gemini.apiKey)
          : {
              generateContent: async () => {
                throw new Error("Gemini is unavailable.");
              },
            };
        return new ClipRegenerationProcessor(
          createDatabaseClient({
            connectionString: config.processingDatabaseUrl,
            poolMax: config.databasePoolMax,
            ssl: config.databaseSsl,
          }),
          new GeminiClipRegenerator(client, config.gemini),
        );
      },
    },
    {
      provide: GeminiSummarySelector,
      useFactory: async () =>
        new GeminiSummarySelector(
          config.gemini.apiKey
            ? await createGoogleGeminiClient(config.gemini.apiKey)
            : {
                generateContent: async () => {
                  throw new Error("Gemini is unavailable.");
                },
              },
          { ...config.gemini, model: config.gemini.summaryModel ?? config.gemini.model },
        ),
    },
    {
      provide: ANALYSIS_PIPELINE_HANDLER,
      inject: [
        ANALYSIS_TRANSCRIPT_REPOSITORY,
        AnalysisTranscriptService,
        GeminiClipSelector,
        FramingService,
        GeminiSummarySelector,
      ],
      useFactory: (
        repository: AnalysisTranscriptRepositoryContract,
        transcripts: AnalysisTranscriptService,
        selector: GeminiClipSelector,
        framing: FramingService,
        summarySelector: GeminiSummarySelector,
      ): AnalysisPipelineHandler =>
        new AnalysisPipelineService(repository, transcripts, selector, framing, summarySelector),
    },
    {
      provide: AnalysisQueueConsumerService,
      inject: [AnalysisJobProcessor, ClipRegenerationProcessor],
      useFactory: (processor: AnalysisJobProcessor, regeneration: ClipRegenerationProcessor) =>
        new AnalysisQueueConsumerService(processor, {
          prefix: config.bullmqPrefix,
          redisUrl: config.redisUrl,
          regenerate: (job) => regeneration.process(job),
        }),
    },
  ],
})
export class AppModule {}
