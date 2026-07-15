import type { CreateProjectInput } from "@repurposepro/shared";
import { ProjectOutputType, ProjectStatus } from "@repurposepro/shared";
import { extname } from "node:path";
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

const projectIdSchema = z.string().uuid();

const sourceVideoFormats = {
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
} as const;

export type ListProjectsInput = z.output<typeof listProjectsSchema>;

export interface ProjectsCursor {
  readonly createdAt: string;
  readonly id: string;
}

export interface SourceVideoUploadInput {
  readonly fileSizeBytes: number;
  readonly mimeType: (typeof sourceVideoFormats)[keyof typeof sourceVideoFormats];
  readonly originalFileName: string;
  readonly stagedPath: string;
}

export interface SourceVideoFile {
  readonly mimetype: string;
  readonly originalname: string;
  readonly path: string;
  readonly size: number;
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

export function parseProjectId(input: unknown): string {
  const result = projectIdSchema.safeParse(input);

  if (!result.success) {
    throw new ProjectContractValidationError("Invalid project ID.");
  }

  return result.data;
}

function decodeMultipartFilenameEscapes(fileName: string): string {
  return fileName.replace(/%22|%27/gi, (escape) => (escape.toLowerCase() === "%22" ? '"' : "'"));
}

export function parseSourceVideoUpload(file: SourceVideoFile | undefined): SourceVideoUploadInput {
  if (!file) {
    throw new ProjectContractValidationError("Choose a video file to upload.");
  }

  const originalFileName = decodeMultipartFilenameEscapes(file.originalname);
  const extension = extname(originalFileName).toLowerCase() as keyof typeof sourceVideoFormats;
  const expectedMimeType = sourceVideoFormats[extension];

  if (!expectedMimeType || file.mimetype !== expectedMimeType || file.size <= 0 || !file.path) {
    throw new ProjectContractValidationError("Upload an MP4, MOV, WebM, or MKV video.");
  }

  return {
    fileSizeBytes: file.size,
    mimeType: expectedMimeType,
    originalFileName,
    stagedPath: file.path,
  };
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
