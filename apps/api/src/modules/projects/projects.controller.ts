import type { ApiListSuccess, ApiSuccess, ProjectSummary } from "@repurposepro/shared";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpStatus,
  Get,
  HttpCode,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UnprocessableEntityException,
  UseFilters,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";

import { AuthGuard } from "../auth/auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.guard";
import {
  parseCreateProjectInput,
  parseListProjectsInput,
  parseProjectId,
  parseSourceVideoUpload,
  ProjectContractValidationError,
  type SourceVideoUploadInput,
} from "./projects.contracts";
import { ProjectUploadError, ProjectsService } from "./projects.service";
import { UploadExceptionFilter } from "./upload-exception.filter";
import { UploadFileInterceptor } from "./upload-file.interceptor";

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

  @Post(":projectId/upload")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(UploadFileInterceptor)
  @UseFilters(UploadExceptionFilter)
  public async upload(
    @Param("projectId") projectId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<{ success: true }>> {
    let parsedProjectId: string;

    try {
      parsedProjectId = this.parseOrThrow(() => parseProjectId(projectId), request);
    } catch (error) {
      if (file) {
        await this.projectsService.discardStagedUpload(file.path);
      }

      throw error;
    }

    let upload: SourceVideoUploadInput;

    try {
      upload = parseSourceVideoUpload(file);
    } catch (error) {
      if (file) {
        await this.projectsService.discardStagedUpload(file.path);
      }

      if (error instanceof ProjectContractValidationError) {
        throw new UnprocessableEntityException({
          error: {
            code: "UPLOAD_INVALID_FILE",
            details: null,
            message: error.message,
            requestId: request.id ?? "req_unknown",
          },
        });
      }

      throw error;
    }

    try {
      await this.projectsService.storeSourceUpload(this.userId(request), parsedProjectId, upload);
    } catch (error) {
      if (error instanceof ProjectUploadError) {
        const response = {
          error: {
            code: error.code,
            details: null,
            message: error.message,
            requestId: request.id ?? "req_unknown",
          },
        };

        if (error.statusCode === 404) {
          throw new NotFoundException(response);
        }

        if (error.statusCode === 409) {
          throw new ConflictException(response);
        }

        throw new InternalServerErrorException(response);
      }

      throw error;
    }

    return { data: { success: true } };
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
