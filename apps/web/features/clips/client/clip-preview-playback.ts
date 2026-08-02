import type { CaptionLine, ClipPreviewCandidate } from "@repurposepro/shared";

export type ClipPlaybackBoundaryAction = "continue" | "loop" | "seek_start" | "stop";
export type ClipPlaybackBoundaryEvent = "play" | "seeking" | "timeupdate";

export const CLIP_SEEK_TOLERANCE_SECONDS = 0.05;
export const CLIP_END_TOLERANCE_SECONDS = 0.02;

export function clipPlaybackBoundaryAction(
  currentTime: number,
  clip: Pick<ClipPreviewCandidate, "endTime" | "startTime">,
  loop: boolean,
  event: ClipPlaybackBoundaryEvent = "timeupdate",
): ClipPlaybackBoundaryAction {
  if (currentTime < clip.startTime - CLIP_SEEK_TOLERANCE_SECONDS) return "seek_start";
  if (currentTime >= clip.endTime - CLIP_END_TOLERANCE_SECONDS) {
    return loop && event === "timeupdate" ? "loop" : "stop";
  }
  return "continue";
}

export function captionAtTime(
  lines: readonly CaptionLine[],
  currentTime: number,
): CaptionLine | null {
  return lines.find((line) => currentTime >= line.startTime && currentTime < line.endTime) ?? null;
}

export function createSourceVideoContentUrl(apiUrl: string, projectId: string): string {
  return `${apiUrl.replace(/\/$/u, "")}/projects/${encodeURIComponent(projectId)}/source-video/content`;
}
