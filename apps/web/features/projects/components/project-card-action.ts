import type { ProjectStatus } from "@repurposepro/shared";

interface ProjectCardAction {
  readonly href: string;
  readonly label: string;
}

const processingStatuses = new Set<ProjectStatus>([
  "queued",
  "transcribing",
  "analyzing",
  "preview_ready",
  "waiting_for_user_edits",
  "rendering",
  "completed",
  "failed",
  "refunded",
]);

export function getProjectCardAction(projectId: string, status: ProjectStatus): ProjectCardAction {
  const encodedProjectId = encodeURIComponent(projectId);

  if (processingStatuses.has(status)) {
    return {
      href: `/projects/${encodedProjectId}/processing`,
      label: "View processing",
    };
  }

  return {
    href: `/projects/${encodedProjectId}/upload`,
    label: status === "draft" ? "Upload video" : "Continue project",
  };
}
