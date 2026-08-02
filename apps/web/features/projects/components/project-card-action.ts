import type { ProjectStatus } from "@repurposepro/shared";

interface ProjectCardAction {
  readonly href: string;
  readonly label: string;
}

const processingStatuses = new Set<ProjectStatus>([
  "queued",
  "transcribing",
  "analyzing",
  "waiting_for_user_edits",
  "rendering",
  "completed",
  "failed",
  "refunded",
]);

export function getProjectCardAction(projectId: string, status: ProjectStatus): ProjectCardAction {
  const encodedProjectId = encodeURIComponent(projectId);

  if (status === "preview_ready") {
    return {
      href: `/projects/${encodedProjectId}/clips`,
      label: "Review clips",
    };
  }

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
