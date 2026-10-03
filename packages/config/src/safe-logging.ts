export function safeRequestId(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : undefined;
}
const fields = new Set([
  "event",
  "action",
  "outcome",
  "code",
  "failureCode",
  "classification",
  "errorName",
  "context",
  "workerId",
  "executionId",
  "intentId",
  "requestId",
  "jobId",
  "projectId",
  "clipId",
  "outputId",
  "targetId",
  "sourceId",
  "userId",
  "step",
  "kind",
  "method",
  "route",
  "retry",
  "refunded",
  "fallback",
  "attempt",
  "attemptCount",
  "progress",
  "durationMs",
  "durationSeconds",
  "deleted",
  "failed",
  "pending",
  "deferred",
  "count",
  "responseTime",
]);

/** Unknown objects and provider errors must never become log context. */
export function safeLogContext(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (["req", "res", "err"].includes(key)) {
      result[key] = item;
      continue;
    }
    if (!fields.has(key)) continue;
    if (key === "requestId") {
      const requestId = safeRequestId(item);
      if (requestId) result[key] = requestId;
      continue;
    }
    if (typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item)))
      result[key] = item;
    else if (typeof item === "string" && /^[a-zA-Z0-9_:/{}*.-]{1,200}$/.test(item))
      result[key] = item;
  }
  return result;
}
export const safeLogSerializers = {
  req: (value: { id?: unknown; method?: unknown; route?: { path?: unknown } }) => ({
    requestId: safeRequestId(value.id),
    method:
      typeof value.method === "string" && /^[A-Z]{1,10}$/.test(value.method)
        ? value.method
        : "UNKNOWN",
    route:
      typeof value.route?.path === "string" && /^[a-zA-Z0-9_:/{}*.-]{1,200}$/.test(value.route.path)
        ? value.route.path
        : "unmatched",
  }),
  res: (value: { statusCode?: unknown }) => ({
    statusCode: typeof value.statusCode === "number" ? value.statusCode : 500,
  }),
  err: () => ({ type: "Error" }),
};
