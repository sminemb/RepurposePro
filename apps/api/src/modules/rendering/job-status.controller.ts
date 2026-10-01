import {
  Controller,
  Get,
  Header,
  Param,
  Req,
  UseGuards,
  UnauthorizedException,
} from "@nestjs/common";
import { z } from "zod";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { DatabaseService } from "../infrastructure/database.service";
import { renderHttpError } from "./rendering.service";

@Controller()
@UseGuards(AuthGuard)
export class JobStatusController {
  public constructor(private readonly database: DatabaseService) {}
  @Get(["jobs/:jobId/status", "projects/:projectId/jobs/:jobId/status"])
  @Header("Cache-Control", "private, no-store")
  public async get(
    @Param("jobId") jobId: string,
    @Req() request: AuthenticatedRequest,
    @Param("projectId") projectId?: string,
  ) {
    if (!request.user) throw new UnauthorizedException();
    if (
      !z.uuid().safeParse(jobId).success ||
      (projectId !== undefined && !z.uuid().safeParse(projectId).success)
    )
      throw renderHttpError("VALIDATION_ERROR", request.id);
    const result = await this.database.database.pool.query<{ result: unknown }>(
      "SELECT public.get_owned_project_job_status($1,$2,$3) AS result",
      [request.user.id, jobId, projectId ?? null],
    );
    if (!result.rows[0]?.result) throw renderHttpError("JOB_NOT_FOUND", request.id);
    return { data: result.rows[0].result };
  }
}
