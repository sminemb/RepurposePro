import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { summaryEditSchema } from "@repurposepro/shared";
import { z } from "zod";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { renderHttpError } from "../rendering/rendering.service";
import { SummaryService } from "./summary.service";
@Controller("projects")
@UseGuards(AuthGuard)
export class SummaryController {
  public constructor(private readonly summaries: SummaryService) {}
  private user(request: AuthenticatedRequest, projectId: string) {
    if (!request.user) throw new UnauthorizedException();
    if (!z.uuid().safeParse(projectId).success)
      throw renderHttpError("VALIDATION_ERROR", request.id);
    return request.user.id;
  }
  @Get(":projectId/summary")
  @Header("Cache-Control", "private, no-store")
  public async get(@Param("projectId") projectId: string, @Req() request: AuthenticatedRequest) {
    return { data: await this.summaries.get(this.user(request, projectId), projectId) };
  }
  @Patch(":projectId/summary")
  @Header("Cache-Control", "private, no-store")
  public async save(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = this.user(request, projectId);
    const input = summaryEditSchema.safeParse(body);
    if (!input.success) throw renderHttpError("VALIDATION_ERROR", request.id);
    return { data: await this.summaries.save(userId, projectId, input.data) };
  }
}
