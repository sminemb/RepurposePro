import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  UseGuards,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { framingStatusSchema, type ApiSuccess, type FramingStatus } from "@repurposepro/shared";
import { z } from "zod";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { DatabaseService } from "../infrastructure/database.service";

@Controller("projects/:projectId/framing-analysis")
@UseGuards(AuthGuard)
export class FramingController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  get(@Param("projectId") projectId: string, @Req() request: AuthenticatedRequest) {
    return this.run(projectId, request, false);
  }

  @Post()
  start(@Param("projectId") projectId: string, @Req() request: AuthenticatedRequest) {
    return this.run(projectId, request, true);
  }

  private async run(
    projectId: string,
    request: AuthenticatedRequest,
    start: boolean,
  ): Promise<ApiSuccess<FramingStatus>> {
    if (!request.user) throw new UnauthorizedException();
    if (!z.uuid().safeParse(projectId).success)
      throw new BadRequestException("Invalid project ID.");
    const result = await this.database.database.pool.query<{ result: unknown }>(
      "SELECT public.owned_video_framing($1,$2,$3) AS result",
      [request.user.id, projectId, start],
    );
    if (!result.rows[0]?.result)
      throw new NotFoundException("The source video is unavailable or expired.");
    return { data: framingStatusSchema.parse(result.rows[0].result) };
  }
}
