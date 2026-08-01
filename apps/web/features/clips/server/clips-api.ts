import "server-only";

import type { ApiSuccess, ClipPreviewCandidate, ProjectClipList } from "@repurposepro/shared";

import { requestApi } from "@/lib/server-api";

export type ProjectClipsResult =
  | { readonly clips: ProjectClipList; readonly kind: "success" }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "not_found" }
  | { readonly kind: "unavailable" };

export async function getProjectClips(projectId: string): Promise<ProjectClipsResult> {
  try {
    const response = await requestApi(`/projects/${encodeURIComponent(projectId)}/clips`);
    if (response.status === 401) return { kind: "unauthenticated" };
    if (response.status === 404) return { kind: "not_found" };
    if (!response.ok) return { kind: "unavailable" };
    const body = (await response.json()) as ApiSuccess<unknown>;
    if (!isProjectClipList(body.data, projectId)) return { kind: "unavailable" };
    return { clips: body.data, kind: "success" };
  } catch {
    return { kind: "unavailable" };
  }
}

function isProjectClipList(value: unknown, projectId: string): value is ProjectClipList {
  if (typeof value !== "object" || value === null) return false;
  const list = value as Partial<ProjectClipList>;
  const sourceDurationSeconds = list.sourceDurationSeconds;
  return (
    list.projectId === projectId &&
    typeof sourceDurationSeconds === "number" &&
    Number.isFinite(sourceDurationSeconds) &&
    sourceDurationSeconds > 0 &&
    Array.isArray(list.clips) &&
    list.clips.length <= 10 &&
    list.clips.every((clip) => isClipPreviewCandidate(clip, sourceDurationSeconds))
  );
}

function isClipPreviewCandidate(
  value: unknown,
  sourceDurationSeconds: number,
): value is ClipPreviewCandidate {
  if (typeof value !== "object" || value === null) return false;
  const clip = value as Partial<ClipPreviewCandidate>;
  const { endTime, startTime } = clip;
  return (
    typeof clip.id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(clip.id) &&
    typeof clip.title === "string" &&
    clip.title.length >= 1 &&
    clip.title.length <= 120 &&
    typeof clip.rank === "number" &&
    Number.isInteger(clip.rank) &&
    clip.rank >= 0 &&
    clip.rank <= 9 &&
    typeof startTime === "number" &&
    Number.isFinite(startTime) &&
    startTime >= 0 &&
    typeof endTime === "number" &&
    Number.isFinite(endTime) &&
    endTime > startTime &&
    endTime <= sourceDurationSeconds + 0.001 &&
    typeof clip.score === "number" &&
    Number.isFinite(clip.score) &&
    clip.score >= 0 &&
    clip.score <= 1 &&
    typeof clip.previewFontSize === "number" &&
    Number.isInteger(clip.previewFontSize) &&
    clip.previewFontSize >= 12 &&
    clip.previewFontSize <= 96 &&
    clip.captionsEnabled === true &&
    clip.captionStyle === "hormozi" &&
    isPosition(clip.captionPosition) &&
    (clip.crop === null || isCrop(clip.crop)) &&
    Array.isArray(clip.captionLines) &&
    clip.captionLines.length >= 1 &&
    clip.captionLines.length <= 200 &&
    clip.captionLines.every((line) => isCaptionLine(line, startTime, endTime))
  );
}

function isCaptionLine(value: unknown, clipStartTime: number, clipEndTime: number): boolean {
  if (typeof value !== "object" || value === null) return false;
  const line = value as {
    readonly endTime?: unknown;
    readonly startTime?: unknown;
    readonly text?: unknown;
  };
  return (
    typeof line.text === "string" &&
    line.text.length >= 1 &&
    line.text.length <= 160 &&
    typeof line.startTime === "number" &&
    Number.isFinite(line.startTime) &&
    line.startTime >= clipStartTime - 0.001 &&
    typeof line.endTime === "number" &&
    Number.isFinite(line.endTime) &&
    line.endTime > line.startTime &&
    line.endTime <= clipEndTime + 0.001
  );
}

function isPosition(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const position = value as { readonly x?: unknown; readonly y?: unknown };
  return normalized(position.x) && normalized(position.y);
}

function isCrop(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const crop = value as {
    readonly height?: unknown;
    readonly width?: unknown;
    readonly x?: unknown;
    readonly y?: unknown;
  };
  return (
    normalized(crop.x) &&
    normalized(crop.y) &&
    normalized(crop.width, false) &&
    normalized(crop.height, false) &&
    crop.x + crop.width <= 1 &&
    crop.y + crop.height <= 1
  );
}

function normalized(value: unknown, allowZero = true): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value <= 1 &&
    (allowZero ? value >= 0 : value > 0)
  );
}
