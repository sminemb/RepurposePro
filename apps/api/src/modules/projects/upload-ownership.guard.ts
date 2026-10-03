import { type CanActivate, type ExecutionContext, HttpException, Injectable } from "@nestjs/common";
import { z } from "zod";
import type { AuthenticatedRequest } from "../auth/auth.guard";
import { DatabaseService } from "../infrastructure/database.service";

@Injectable()
export class UploadOwnershipGuard implements CanActivate {
  constructor(private readonly database: DatabaseService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const reject = (status: number, code: string, message: string): never => {
      throw new HttpException(
        { error: { code, message, details: null, requestId: request.id ?? "req_unknown" } },
        status,
      );
    };
    if (!request.user) reject(401, "UNAUTHORIZED", "You need to sign in to access this resource.");
    const projectId = request.params.projectId;
    if (!z.uuid().safeParse(projectId).success)
      reject(400, "VALIDATION_ERROR", "Invalid project ID.");
    const result = await this.database.database.pool.query<{ status: string }>(
      "SELECT status FROM projects WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
      [projectId, request.user!.id],
    );
    if (!result.rows[0]) reject(404, "PROJECT_NOT_FOUND", "Project not found.");
    if (result.rows[0]!.status !== "draft")
      reject(
        409,
        "PROJECT_UPLOAD_NOT_ALLOWED",
        "This project can no longer accept a source video.",
      );
    return true;
  }
}
