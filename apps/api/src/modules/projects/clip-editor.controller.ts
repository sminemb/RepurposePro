import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { clipEditInputSchema, type ApiSuccess, type ClipEditor } from "@repurposepro/shared";
import { z } from "zod";

import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { ClipEditorError, ClipEditorService } from "./clip-editor.service";

@Controller("projects/:projectId/clips/:clipId")
@UseGuards(AuthGuard)
export class ClipEditorController {
  public constructor(private readonly editor: ClipEditorService) {}

  @Get()
  public async get(
    @Param("projectId") projectId: string,
    @Param("clipId") clipId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ClipEditor>> {
    const userId = this.authorize(projectId, clipId, request);
    try {
      return { data: await this.editor.get(userId, projectId, clipId) };
    } catch (error: unknown) {
      throw this.httpError(error, request);
    }
  }

  @Patch()
  public async save(
    @Param("projectId") projectId: string,
    @Param("clipId") clipId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ClipEditor>> {
    const userId = this.authorize(projectId, clipId, request);
    const parsed = clipEditInputSchema.safeParse(body);
    if (!parsed.success)
      throw this.httpError(new ClipEditorError("CLIP_INVALID_CAPTION_METADATA"), request);
    try {
      return { data: await this.editor.save(userId, projectId, clipId, parsed.data) };
    } catch (error: unknown) {
      throw this.httpError(error, request);
    }
  }

  private authorize(projectId: string, clipId: string, request: AuthenticatedRequest): string {
    if (!request.user)
      throw new UnauthorizedException({
        error: {
          code: "UNAUTHORIZED",
          message: "Sign in to edit clips.",
          details: null,
          requestId: request.id ?? "req_unknown",
        },
      });
    if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(clipId).success) {
      throw new BadRequestException({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid project or clip ID.",
          details: null,
          requestId: request.id ?? "req_unknown",
        },
      });
    }
    return request.user.id;
  }

  private httpError(error: unknown, request: AuthenticatedRequest): unknown {
    if (!(error instanceof ClipEditorError)) return error;
    const response = {
      error: {
        code: error.code,
        message: error.message,
        details: null,
        requestId: request.id ?? "req_unknown",
      },
    };
    if (error.code === "CLIP_NOT_FOUND") return new NotFoundException(response);
    if (error.code === "CLIP_EDIT_CONFLICT") return new ConflictException(response);
    return new BadRequestException(response);
  }
}
