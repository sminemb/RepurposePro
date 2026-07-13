import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import {
  calculateRequiredCredits,
  type ApiListSuccess,
  type CreateProjectInput,
  type ProjectSummary,
  type SourceVideoMetadata,
} from "@repurposepro/shared";
import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../infrastructure/database.service";
import { LocalStorageService } from "../storage/local-storage.service";
import { VideoProbeError, VideoProbeService } from "../storage/video-probe.service";
import { schema } from "@repurposepro/db";

import {
  decodeProjectsCursor,
  encodeProjectsCursor,
  type ListProjectsInput,
  type SourceVideoUploadInput,
} from "./projects.contracts";

const { projects, uploadedVideos } = schema;

export class ProjectUploadError extends Error {
  public constructor(
    public readonly code:
      | "PROJECT_NOT_FOUND"
      | "PROJECT_UPLOAD_NOT_ALLOWED"
      | "UPLOAD_INVALID_VIDEO"
      | "UPLOAD_PROBE_FAILED"
      | "UPLOAD_STORAGE_FAILED",
    public readonly statusCode: 404 | 409 | 422 | 500,
    message: string,
  ) {
    super(message);
    this.name = "ProjectUploadError";
  }
}

@Injectable()
export class ProjectsService {
  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly localStorageService: LocalStorageService,
    private readonly videoProbeService: VideoProbeService,
  ) {}

  public async create(userId: string, input: CreateProjectInput): Promise<ProjectSummary> {
    const [project] = await this.databaseService.database.db
      .insert(projects)
      .values({
        name: input.name,
        outputType: input.outputType,
        userId,
      })
      .returning();

    if (!project) {
      throw new Error("Project creation did not return a project.");
    }

    return this.toSummary(project);
  }

  public async list(
    userId: string,
    input: ListProjectsInput,
  ): Promise<ApiListSuccess<ProjectSummary>> {
    const conditions = [eq(projects.userId, userId), isNull(projects.deletedAt)];

    if (input.outputType) {
      conditions.push(eq(projects.outputType, input.outputType));
    }

    if (input.status) {
      conditions.push(eq(projects.status, input.status));
    }

    if (input.cursor) {
      const cursor = decodeProjectsCursor(input.cursor);
      const cursorCreatedAt = new Date(cursor.createdAt);
      const cursorCondition = or(
        lt(projects.createdAt, cursorCreatedAt),
        and(eq(projects.createdAt, cursorCreatedAt), lt(projects.id, cursor.id)),
      );

      if (!cursorCondition) {
        throw new Error("Unable to build the project cursor query.");
      }

      conditions.push(cursorCondition);
    }

    const rows = await this.databaseService.database.db
      .select()
      .from(projects)
      .where(and(...conditions))
      .orderBy(desc(projects.createdAt), desc(projects.id))
      .limit(input.limit + 1);
    const hasMore = rows.length > input.limit;
    const page = rows.slice(0, input.limit);
    const lastProject = page.at(-1);

    return {
      data: page.map((project) => this.toSummary(project)),
      meta: {
        nextCursor:
          hasMore && lastProject
            ? encodeProjectsCursor({
                createdAt: lastProject.createdAt.toISOString(),
                id: lastProject.id,
              })
            : null,
      },
    };
  }

  public async storeSourceUpload(
    userId: string,
    projectId: string,
    upload: SourceVideoUploadInput,
  ): Promise<void> {
    let project: typeof projects.$inferSelect | undefined;

    try {
      [project] = await this.databaseService.database.db
        .select()
        .from(projects)
        .where(
          and(eq(projects.id, projectId), eq(projects.userId, userId), isNull(projects.deletedAt)),
        )
        .limit(1);
    } catch {
      await this.discardStagedUpload(upload.stagedPath);
      throw new ProjectUploadError(
        "UPLOAD_STORAGE_FAILED",
        500,
        "We could not store this video. Please try again.",
      );
    }

    if (!project) {
      await this.discardStagedUpload(upload.stagedPath);
      throw new ProjectUploadError("PROJECT_NOT_FOUND", 404, "Project not found.");
    }

    if (project.status !== "draft") {
      await this.discardStagedUpload(upload.stagedPath);
      throw new ProjectUploadError(
        "PROJECT_UPLOAD_NOT_ALLOWED",
        409,
        "This project can no longer accept a source video.",
      );
    }

    try {
      await this.localStorageService.commitSourceUpload({ ...upload, projectId, userId });
      const source = await this.localStorageService.readSourceUpload(userId, projectId);
      const metadata = await this.videoProbeService.probe(source.videoPath);
      const expiresAt = new Date(
        Date.now() + this.videoProbeService.fileRetentionDays * 24 * 60 * 60 * 1000,
      );

      await this.databaseService.database.db.transaction(async (transaction) => {
        const [updatedProject] = await transaction
          .update(projects)
          .set({ status: "uploaded" })
          .where(
            and(
              eq(projects.id, projectId),
              eq(projects.userId, userId),
              eq(projects.status, "draft"),
              isNull(projects.deletedAt),
            ),
          )
          .returning({ id: projects.id });

        if (!updatedProject) {
          throw new ProjectUploadError(
            "PROJECT_UPLOAD_NOT_ALLOWED",
            409,
            "This project can no longer accept a source video.",
          );
        }

        await transaction.insert(uploadedVideos).values({
          audioCodec: metadata.audioCodec,
          durationSeconds: metadata.durationSeconds.toString(),
          expiresAt,
          fileSizeBytes: source.manifest.fileSizeBytes,
          fps: metadata.fps?.toString() ?? null,
          hasAudio: metadata.hasAudio,
          height: metadata.height,
          mimeType: source.manifest.mimeType,
          originalFileName: source.manifest.originalFileName,
          projectId,
          storagePath: source.videoPath,
          videoCodec: metadata.videoCodec,
          width: metadata.width,
        });
      });
    } catch (error) {
      await this.removeSourceUpload(userId, projectId);

      if (error instanceof ProjectUploadError) {
        throw error;
      }

      if (error instanceof VideoProbeError) {
        if (error.failure === "probe_failed") {
          throw new ProjectUploadError("UPLOAD_PROBE_FAILED", 500, error.message);
        }

        throw new ProjectUploadError("UPLOAD_INVALID_VIDEO", 422, error.message);
      }

      await this.discardStagedUpload(upload.stagedPath);
      throw new ProjectUploadError(
        "UPLOAD_STORAGE_FAILED",
        500,
        "We could not store this video. Please try again.",
      );
    }
  }

  public async getSourceVideo(userId: string, projectId: string): Promise<SourceVideoMetadata> {
    const [video] = await this.databaseService.database.db
      .select({
        durationSeconds: uploadedVideos.durationSeconds,
        expiresAt: uploadedVideos.expiresAt,
        fileSizeBytes: uploadedVideos.fileSizeBytes,
        fps: uploadedVideos.fps,
        hasAudio: uploadedVideos.hasAudio,
        height: uploadedVideos.height,
        id: uploadedVideos.id,
        originalFileName: uploadedVideos.originalFileName,
        width: uploadedVideos.width,
      })
      .from(uploadedVideos)
      .innerJoin(projects, eq(projects.id, uploadedVideos.projectId))
      .where(
        and(
          eq(projects.userId, userId),
          eq(uploadedVideos.projectId, projectId),
          isNull(projects.deletedAt),
          isNull(uploadedVideos.deletedAt),
        ),
      )
      .limit(1);

    if (!video) {
      throw new ProjectUploadError("PROJECT_NOT_FOUND", 404, "Project or source video not found.");
    }

    const durationSeconds = Number(video.durationSeconds);

    return {
      durationSeconds,
      expiresAt: video.expiresAt.toISOString(),
      fileName: video.originalFileName,
      fileSizeBytes: video.fileSizeBytes,
      fps: video.fps === null ? null : Number(video.fps),
      hasAudio: video.hasAudio,
      height: video.height,
      id: video.id,
      requiredCredits: calculateRequiredCredits(durationSeconds),
      width: video.width,
    };
  }

  public async discardStagedUpload(stagedPath: string): Promise<void> {
    try {
      await this.localStorageService.discardStagedUpload(stagedPath);
    } catch {
      // Cleanup must never replace a safe user-facing upload error.
    }
  }

  private async removeSourceUpload(userId: string, projectId: string): Promise<void> {
    try {
      await this.localStorageService.removeSourceUpload(userId, projectId);
    } catch {
      // Cleanup must never replace a safe user-facing upload error.
    }
  }

  private toSummary(project: typeof projects.$inferSelect): ProjectSummary {
    return {
      clipCount: 0,
      createdAt: project.createdAt.toISOString(),
      expiresAt: null,
      id: project.id,
      name: project.name,
      outputType: project.outputType,
      status: project.status,
    };
  }
}
