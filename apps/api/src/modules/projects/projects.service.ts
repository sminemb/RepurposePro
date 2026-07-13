import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import type { ApiListSuccess, CreateProjectInput, ProjectSummary } from "@repurposepro/shared";
import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../infrastructure/database.service";
import { LocalStorageService } from "../storage/local-storage.service";
import { schema } from "@repurposepro/db";

import {
  decodeProjectsCursor,
  encodeProjectsCursor,
  type ListProjectsInput,
  type SourceVideoUploadInput,
} from "./projects.contracts";

const { projects } = schema;

export class ProjectUploadError extends Error {
  public constructor(
    public readonly code:
      "PROJECT_NOT_FOUND" | "PROJECT_UPLOAD_NOT_ALLOWED" | "UPLOAD_STORAGE_FAILED",
    public readonly statusCode: 404 | 409 | 500,
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
    } catch {
      await this.discardStagedUpload(upload.stagedPath);
      throw new ProjectUploadError(
        "UPLOAD_STORAGE_FAILED",
        500,
        "We could not store this video. Please try again.",
      );
    }
  }

  public async discardStagedUpload(stagedPath: string): Promise<void> {
    try {
      await this.localStorageService.discardStagedUpload(stagedPath);
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
