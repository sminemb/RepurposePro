import { z } from "zod";
import { ProcessingJobStatus, type AdminCollection } from "@repurposepro/shared";

const opaqueId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
const cursorSchema = z.object({ createdAt: z.string().datetime(), id: opaqueId }).strict();
export type AdminCursor = z.infer<typeof cursorSchema>;
export function encodeAdminCursor(cursor: AdminCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}
export function decodeAdminCursor(value: string): AdminCursor {
  if (!/^[A-Za-z0-9_-]{1,1024}$/.test(value)) throw new Error("Invalid cursor.");
  return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
}
export function parseAdminRange(value: unknown) {
  return z
    .object({ range: z.enum(["7d", "30d", "90d"]).default("30d") })
    .strict()
    .parse(value).range;
}
export function parseAdminSearch(value: unknown): string {
  return z
    .object({
      q: z
        .string()
        .trim()
        .min(1)
        .max(320)
        .refine((q) => z.email().safeParse(q).success || opaqueId.safeParse(q).success),
    })
    .strict()
    .parse(value).q;
}
export function parseAdminId(value: unknown): string {
  return opaqueId.parse(value);
}
const listSchema = z
  .object({
    cursor: z.string().max(1024).transform(decodeAdminCursor).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    userId: opaqueId.optional(),
    projectId: z.uuid().optional(),
    status: z.string().optional(),
  })
  .strict();
export type AdminListInput = z.infer<typeof listSchema>;
export function parseAdminList(collection: AdminCollection, value: unknown): AdminListInput {
  const input = listSchema.parse(value);
  if (collection !== "users" && input.cursor && !z.uuid().safeParse(input.cursor.id).success)
    throw new Error("Invalid cursor ID.");
  if (
    (collection === "users" && input.userId) ||
    (collection !== "jobs" && input.projectId) ||
    (collection === "ledger" && !input.userId)
  )
    throw new Error("Invalid filters.");
  if (input.status !== undefined) {
    const statuses =
      collection === "jobs"
        ? Object.values(ProcessingJobStatus)
        : collection === "payments"
          ? ["pending", "paid", "failed", "refunded"]
          : [];
    if (!statuses.includes(input.status)) throw new Error("Invalid status.");
  }
  return input;
}
