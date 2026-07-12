import type { ApiListSuccess, ApiSuccess, ProjectSummary } from "@repurposepro/shared";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";

import { AuthGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.guard";
import {
  parseCreateProjectInput,
  parseListProjectsInput,
  ProjectContractValidationError,
} from "./projects.contracts";
import { ProjectsService } from "./projects.service";

@Controller("projects")
@UseGuards(AuthGuard)
export class ProjectsController {
  public constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @HttpCode(201)
  public async create(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ProjectSummary>> {
    const input = this.parseOrThrow(() => parseCreateProjectInput(body), request);

    return { data: await this.projectsService.create(this.userId(request), input) };
  }

  @Get()
  public list(
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiListSuccess<ProjectSummary>> {
    const input = this.parseOrThrow(() => parseListProjectsInput(query), request);

    return this.projectsService.list(this.userId(request), input);
  }

  private parseOrThrow<T>(parse: () => T, request: AuthenticatedRequest): T {
    try {
      return parse();
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
