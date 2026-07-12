import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import type {
  ApiListSuccess,
  CreateProjectInput,
  ProjectSummary,
} from "@repurposepro/shared";
import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../infrastructure/database.service";
import { schema } from "@repurposepro/db";

import {
  decodeProjectsCursor,
  encodeProjectsCursor,
  type ListProjectsInput,
} from "./projects.contracts";

const { projects } = schema;

@Injectable()
export class ProjectsService {
  public constructor(private readonly databaseService: DatabaseService) {}

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
