import { createReadStream } from "node:fs";

import type { Response } from "express";
import type { ApiSuccess, ProjectClipList } from "@repurposepro/shared";
import {
  BadRequestException,
  Controller,
  Get,
  GoneException,
  Headers,
  NotFoundException,
  Param,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";

import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import {
  ClipPreviewAccessError,
  ClipPreviewsService,
  type SourceVideoContent,
} from "./clip-previews.service";
import { parseProjectId, ProjectContractValidationError } from "./projects.contracts";
import { createSourceVideoResponsePlan } from "./source-video-range";

@Controller("projects")
@UseGuards(AuthGuard)
export class ClipPreviewsController {
  public constructor(private readonly clipPreviews: ClipPreviewsService) {}

  @Get(":projectId/clips")
  public async list(
    @Param("projectId") projectId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ProjectClipList>> {
    const parsedProjectId = this.projectId(projectId, request);
    try {
      return { data: await this.clipPreviews.list(this.userId(request), parsedProjectId) };
    } catch (error: unknown) {
      if (error instanceof ClipPreviewAccessError) {
        throw this.notFound(error, request);
      }
      throw error;
    }
  }

  @Get(":projectId/source-video/content")
  public async sourceVideoContent(
    @Param("projectId") projectId: string,
    @Headers("range") range: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile | undefined> {
    const parsedProjectId = this.projectId(projectId, request);
    let source: SourceVideoContent;
    try {
      source = await this.clipPreviews.getSourceVideoContent(this.userId(request), parsedProjectId);
    } catch (error: unknown) {
      if (error instanceof ClipPreviewAccessError) {
        if (error.code === "SOURCE_VIDEO_EXPIRED") {
          throw new GoneException(this.errorBody(error, request));
        }
        throw this.notFound(error, request);
      }
      throw error;
    }

    const plan = createSourceVideoResponsePlan(range, source.fileSizeBytes);
    response.setHeader("Accept-Ranges", "bytes");
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Content-Disposition", "inline");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (plan.status === 416) {
      response.status(416);
      response.setHeader("Content-Length", "0");
      response.setHeader("Content-Range", plan.contentRange);
      response.end();
      return undefined;
    }

    response.status(plan.status);
    response.setHeader("Content-Length", plan.contentLength.toString());
    response.setHeader("Content-Type", source.mimeType);
    if (plan.contentRange) response.setHeader("Content-Range", plan.contentRange);
    return new StreamableFile(createReadStream(source.path, { end: plan.end, start: plan.start }));
  }

  private errorBody(error: ClipPreviewAccessError, request: AuthenticatedRequest) {
    return {
      error: {
        code: error.code,
        details: null,
        message: error.message,
        requestId: request.id ?? "req_unknown",
      },
    };
  }

  private notFound(error: ClipPreviewAccessError, request: AuthenticatedRequest) {
    return new NotFoundException(this.errorBody(error, request));
  }

  private projectId(projectId: string, request: AuthenticatedRequest): string {
    try {
      return parseProjectId(projectId);
    } catch (error: unknown) {
      if (error instanceof ProjectContractValidationError) {
        throw new BadRequestException({
          error: {
            code: "VALIDATION_ERROR",
            details: null,
            message: error.message,
            requestId: request.id ?? "req_unknown",
          },
        });
      }
      throw error;
    }
  }

  private userId(request: AuthenticatedRequest): string {
    if (!request.user) {
      throw new UnauthorizedException({
        error: {
          code: "UNAUTHORIZED",
          details: null,
          message: "You need to sign in to access this resource.",
          requestId: request.id ?? "req_unknown",
        },
      });
    }
    return request.user.id;
  }
}
