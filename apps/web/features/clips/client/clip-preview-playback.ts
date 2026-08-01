import type { CaptionLine, ClipPreviewCandidate } from "@repurposepro/shared";

export type ClipPlaybackBoundaryAction = "continue" | "loop" | "seek_start" | "stop";

export function clipPlaybackBoundaryAction(
  currentTime: number,
  clip: Pick<ClipPreviewCandidate, "endTime" | "startTime">,
  loop: boolean,
): ClipPlaybackBoundaryAction {
  if (currentTime < clip.startTime - 0.05) return "seek_start";
  if (currentTime >= clip.endTime - 0.02) return loop ? "loop" : "stop";
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
