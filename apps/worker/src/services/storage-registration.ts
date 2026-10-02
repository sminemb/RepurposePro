import type { DatabaseClient } from "@repurposepro/db";
export async function registerJobAsset(
  database: DatabaseClient,
  jobId: string,
  token: string,
  path: string,
  kind: "audio" | "render_temp",
  days = 7,
): Promise<void> {
  const result = await database.pool.query<{ id: string | null }>(
    "SELECT public.register_job_storage_target($1,$2,$3,$4,$5) AS id",
    [jobId, token, path.replaceAll("\\", "/"), kind, days],
  );
  if (!result.rows[0]?.id) throw new Error("Media asset registration lease lost.");
}
