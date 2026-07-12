import type { CreateProjectInput } from "@repurposepro/shared";
import { ProjectOutputType, ProjectStatus } from "@repurposepro/shared";
import { z } from "zod";

const projectOutputTypes = Object.values(ProjectOutputType);
const projectStatuses = Object.values(ProjectStatus);

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  outputType: z.enum(projectOutputTypes),
});

const listProjectsSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  outputType: z.enum(projectOutputTypes).optional(),
  status: z.enum(projectStatuses).optional(),
});

const cursorSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string().min(1),
});

export type ListProjectsInput = z.output<typeof listProjectsSchema>;

export interface ProjectsCursor {
  readonly createdAt: string;
  readonly id: string;
}

export class ProjectContractValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ProjectContractValidationError";
  }
}

export function parseCreateProjectInput(input: unknown): CreateProjectInput {
  const result = createProjectSchema.safeParse(input);

  if (!result.success) {
    throw new ProjectContractValidationError("Project name must be between 1 and 120 characters.");
  }

  return result.data;
}

export function parseListProjectsInput(input: unknown): ListProjectsInput {
  const result = listProjectsSchema.safeParse(input);

  if (!result.success) {
    throw new ProjectContractValidationError("Invalid project list query.");
  }

  if (result.data.cursor) {
    try {
      decodeProjectsCursor(result.data.cursor);
    } catch {
      throw new ProjectContractValidationError("Invalid project list query.");
    }
  }

  return result.data;
}

export function encodeProjectsCursor(cursor: ProjectsCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeProjectsCursor(value: string): ProjectsCursor {
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    const result = cursorSchema.safeParse(decoded);

    if (!result.success) {
      throw new ProjectContractValidationError("Invalid project cursor.");
    }

    return result.data;
  } catch (error) {
    if (error instanceof ProjectContractValidationError) {
      throw error;
    }

    throw new ProjectContractValidationError("Invalid project cursor.");
  }
}
