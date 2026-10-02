import { Injectable } from "@nestjs/common";
import { summaryStateSchema, type SummaryEdit } from "@repurposepro/shared";
import { DatabaseService } from "../infrastructure/database.service";
import { renderHttpError } from "../rendering/rendering.service";
@Injectable()
export class SummaryService {
  public constructor(private readonly database: DatabaseService) {}
  public async get(userId: string, projectId: string) {
    const result = await this.database.database.pool.query<{ result: unknown }>(
      "SELECT public.get_owned_summary($1,$2) AS result",
      [userId, projectId],
    );
    if (!result.rows[0]?.result) throw renderHttpError("SUMMARY_NOT_FOUND");
    return summaryStateSchema.parse(result.rows[0].result);
  }
  public async save(userId: string, projectId: string, input: SummaryEdit) {
    const result = await this.database.database.pool.query<{ result: unknown }>(
      "SELECT public.save_owned_summary($1,$2,$3,$4) AS result",
      [userId, projectId, input.expectedRevision, JSON.stringify(input.segments)],
    );
    const data = result.rows[0]?.result;
    if (data && typeof data === "object" && "error" in data && typeof data.error === "string")
      throw renderHttpError(data.error);
    return summaryStateSchema.parse(data);
  }
}
