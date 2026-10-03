import { UnrecoverableError } from "bullmq";
import { z } from "zod";

export interface QueueInput {
  id?: string;
  name: string;
  data: unknown;
}
function record(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype
  );
}
export function resourceQueuePayload(job: QueueInput, names: readonly string[]) {
  const payload = z.object({ jobId: z.uuid(), projectId: z.uuid() }).strict().safeParse(job.data);
  if (
    !names.includes(job.name) ||
    !record(job.data) ||
    !payload.success ||
    job.id !== payload.data.jobId
  )
    throw new UnrecoverableError("Invalid resource queue contract.");
  return payload.data;
}
export function framingQueueId(job: QueueInput): string {
  const payload = z.object({ id: z.uuid() }).strict().safeParse(job.data);
  if (
    job.name !== "track_faces" ||
    !record(job.data) ||
    !payload.success ||
    job.id !== payload.data.id
  )
    throw new UnrecoverableError("Invalid framing queue contract.");
  return payload.data.id;
}
export function validateCleanupQueue(job: QueueInput): void {
  if (
    job.name !== "cleanup_expired_project_files" ||
    !job.id ||
    job.id.length > 200 ||
    !record(job.data) ||
    Object.keys(job.data).length !== 0
  )
    throw new UnrecoverableError("Invalid cleanup queue contract.");
}
