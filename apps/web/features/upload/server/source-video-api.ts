import "server-only";

import type { SourceVideoMetadata } from "@repurposepro/shared";

import { requestApi } from "@/lib/server-api";

const unavailableMessage = "We could not verify your saved video. Refresh the page to try again.";

export type SavedSourceVideoResult =
  | { readonly kind: "success"; readonly metadata: SourceVideoMetadata }
  | { readonly kind: "missing" }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "unavailable"; readonly message: string };

export async function getSavedSourceVideo(projectId: string): Promise<SavedSourceVideoResult> {
  try {
    const response = await requestApi(`/projects/${encodeURIComponent(projectId)}/video`);

    if (response.status === 401) return { kind: "unauthenticated" };
    if (response.status === 404) return { kind: "missing" };
    if (!response.ok) return { kind: "unavailable", message: unavailableMessage };

    const body = (await response.json()) as { data?: unknown };
    if (!isSourceVideoMetadata(body.data)) {
      return { kind: "unavailable", message: unavailableMessage };
    }

    return { kind: "success", metadata: body.data };
  } catch {
    return { kind: "unavailable", message: unavailableMessage };
  }
}

function isSourceVideoMetadata(value: unknown): value is SourceVideoMetadata {
  if (!isRecord(value)) return false;

  return (
    isPositiveNumber(value.durationSeconds) &&
    typeof value.expiresAt === "string" &&
    typeof value.fileName === "string" &&
    isNonNegativeInteger(value.fileSizeBytes) &&
    (value.fps === null || isPositiveNumber(value.fps)) &&
    typeof value.hasAudio === "boolean" &&
    isPositiveInteger(value.height) &&
    typeof value.id === "string" &&
    isPositiveInteger(value.requiredCredits) &&
    isPositiveInteger(value.width)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
