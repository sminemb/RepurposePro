import { randomUUID } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { Response } from "express";
import {
  Body,
  Controller,
  Get,
  Headers,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";
import { renderInputSchema } from "@repurposepro/shared";
import { z } from "zod";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { RenderingService, renderHttpError } from "./rendering.service";

@Controller("projects")
@UseGuards(AuthGuard)
export class RenderingController {
  public constructor(private readonly rendering: RenderingService) {}
  private user(request: AuthenticatedRequest, projectId: string, outputId?: string) {
    if (!request.user) throw new UnauthorizedException();
    if (
      !z.uuid().safeParse(projectId).success ||
      (outputId && !z.uuid().safeParse(outputId).success)
    )
      throw renderHttpError("VALIDATION_ERROR", request.id);
    return request.user.id;
  }
  @Post(":projectId/render")
  @HttpCode(202)
  @Header("Cache-Control", "private, no-store")
  public async start(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = this.user(request, projectId);
    const input = renderInputSchema.safeParse(body);
    if (!input.success || (key !== undefined && !/^[a-zA-Z0-9_-]{1,100}$/.test(key)))
      throw renderHttpError("VALIDATION_ERROR", request.id);
    return {
      data: await this.rendering.start(
        userId,
        projectId,
        input.data,
        key ?? randomUUID(),
        request.id ?? "req_unknown",
      ),
    };
  }
  @Get(":projectId/outputs")
  @Header("Cache-Control", "private, no-store")
  public async list(@Param("projectId") projectId: string, @Req() request: AuthenticatedRequest) {
    return { data: await this.rendering.list(this.user(request, projectId), projectId) };
  }
  @Get(":projectId/outputs/:outputId/download")
  public async download(
    @Param("projectId") projectId: string,
    @Param("outputId") outputId: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const output = await this.rendering.download(
      this.user(request, projectId, outputId),
      projectId,
      outputId,
    );
    let handle;
    try {
      const root = await realpath(resolve(loadApiConfig().storageRoot));
      const path = await realpath(output.storagePath);
      const contained = relative(root, path);
      if (isAbsolute(contained) || contained === ".." || contained.startsWith(`..${sep}`))
        throw new Error("Invalid storage path");
      handle = await open(path, "r");
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size !== output.fileSizeBytes)
        throw new Error("Output file mismatch");
    } catch {
      await handle?.close();
      throw renderHttpError("OUTPUT_FILE_MISSING", request.id);
    }
    response.setHeader("Content-Type", "video/mp4");
    response.setHeader("Content-Length", output.fileSizeBytes);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const safeName = output.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 150) || "clip.mp4";
    response.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    return new StreamableFile(handle.createReadStream({ autoClose: true }));
  }
}
