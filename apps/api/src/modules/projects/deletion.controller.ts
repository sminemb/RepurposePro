import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  HttpCode,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { bulkClipDeleteInputSchema } from "@repurposepro/shared";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { DeletionError, DeletionService } from "./deletion.service";

@Controller("projects")
@UseGuards(AuthGuard)
export class DeletionController {
  private readonly logger = new Logger(DeletionController.name);
  constructor(private readonly deletion: DeletionService) {}

  @Delete(":projectId")
  @HttpCode(204)
  async project(@Param("projectId") projectId: string, @Req() request: AuthenticatedRequest) {
    const user = this.authorize(projectId, request);
    return this.run(() => this.deletion.project(user, projectId), request);
  }

  @Post(":projectId/clips/bulk-delete")
  @HttpCode(204)
  async clips(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = this.authorize(projectId, request);
    const input = bulkClipDeleteInputSchema.safeParse(body);
    if (!input.success) throw this.error("VALIDATION_ERROR", request, 400);
    return this.run(() => this.deletion.clips(user, projectId, input.data), request);
  }

  private authorize(project: string, request: AuthenticatedRequest) {
    if (!request.user) throw new UnauthorizedException();
    if (!z.uuid().safeParse(project).success) throw this.error("VALIDATION_ERROR", request, 400);
    return request.user.id;
  }
  private async run(action: () => Promise<void>, request: AuthenticatedRequest) {
    try {
      await action();
    } catch (error) {
      if (error instanceof DeletionError) {
        throw this.error(
          error.code,
          request,
          error.code.endsWith("NOT_FOUND")
            ? 404
            : ["PROJECT_BUSY", "CLIP_BUSY", "CLIP_EDIT_CONFLICT"].includes(error.code)
              ? 409
              : error.code === "VALIDATION_ERROR"
                ? 400
                : 500,
        );
      }
      this.logger.error({ event: "deletion_failed", requestId: request.id });
      throw this.error("PROJECT_DELETE_FAILED", request, 500);
    }
  }
  private error(code: string, request: AuthenticatedRequest, status: number) {
    const body = {
      error: {
        code,
        message: new DeletionError(code).message,
        details: null,
        requestId: request.id ?? "req_unknown",
      },
    };
    return status === 404
      ? new NotFoundException(body)
      : status === 409
        ? new ConflictException(body)
        : status === 400
          ? new BadRequestException(body)
          : new InternalServerErrorException(body);
  }
}
