import type { ApiSuccess, ProcessingStartResult } from "@repurposepro/shared";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";

import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { parseProjectId, ProjectContractValidationError } from "../projects/projects.contracts";
import { AnalysisRateLimitGuard } from "./analysis-rate-limit.guard";
import { parseStartAnalysisInput, ProcessingContractValidationError } from "./processing.contracts";
import { ProcessingStartError, ProcessingStartService } from "./processing-start.service";

@Controller("projects")
@UseGuards(AuthGuard)
export class ProcessingController {
  public constructor(private readonly processingStartService: ProcessingStartService) {}

  @Post(":projectId/analyze")
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(AnalysisRateLimitGuard)
  public async start(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ProcessingStartResult>> {
    let parsedProjectId: string;

    try {
      parsedProjectId = parseProjectId(projectId);
    } catch (error) {
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

    try {
      parseStartAnalysisInput(body);
    } catch (error) {
      if (error instanceof ProcessingContractValidationError) {
        throw new UnprocessableEntityException({
          error: {
            code: "PROCESSING_CONFIRMATION_REQUIRED",
            details: null,
            message: error.message,
            requestId: request.id ?? "req_unknown",
          },
        });
      }

      throw error;
    }

    try {
      return {
        data: await this.processingStartService.start(
          this.userId(request),
          parsedProjectId,
          request.id ?? "req_unknown",
        ),
      };
    } catch (error) {
      if (error instanceof ProcessingStartError) {
        throw this.toHttpException(error, request);
      }

      throw error;
    }
  }

  private toHttpException(
    error: ProcessingStartError,
    request: AuthenticatedRequest,
  ): ConflictException | NotFoundException | ServiceUnavailableException {
    const response = {
      error: {
        code: error.code,
        details: null,
        message: error.message,
        requestId: request.id ?? "req_unknown",
      },
    };

    if (error.statusCode === 404) {
      return new NotFoundException(response);
    }

    if (error.statusCode === 503) {
      return new ServiceUnavailableException(response);
    }

    return new ConflictException(response);
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
