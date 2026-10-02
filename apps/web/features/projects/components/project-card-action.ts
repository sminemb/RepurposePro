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

export function getProjectCardAction(
  projectId: string,
  status: ProjectStatus,
  outputType: "clips" | "summary" = "clips",
): ProjectCardAction {
  const encodedProjectId = encodeURIComponent(projectId);

  if (status === "rendering" || status === "completed")
    return {
      href: `/projects/${encodedProjectId}/outputs`,
      label: status === "rendering" ? "View render" : "View exports",
    };

  if (status === "preview_ready") {
    return {
      href: `/projects/${encodedProjectId}/${outputType === "summary" ? "summary" : "clips"}`,
      label: outputType === "summary" ? "Review summary" : "Review clips",
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
