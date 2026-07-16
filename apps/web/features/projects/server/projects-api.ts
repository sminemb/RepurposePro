import "server-only";

import type {
  ApiError,
  ApiListSuccess,
  ApiSuccess,
  CreateProjectInput,
  ProjectSummary,
} from "@repurposepro/shared";

import { requestApi } from "@/lib/server-api";

interface ProjectsResult {
  readonly error: string | null;
  readonly projects: readonly ProjectSummary[];
}

interface CreateProjectResult {
  readonly error: string | null;
  readonly projectId: string | null;
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as ApiError | null;
  return body?.error?.message ?? fallback;
}

export async function createProject(input: CreateProjectInput): Promise<CreateProjectResult> {
  try {
    const response = await requestApi("/projects", {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      return {
        error: await errorMessage(response, "We could not create this project. Try again."),
        projectId: null,
      };
    }

    const body = (await response.json()) as ApiSuccess<ProjectSummary>;
    return { error: null, projectId: body.data.id };
  } catch {
    return {
      error: "RepurposePro is unreachable. Check your connection and try again.",
      projectId: null,
    };
  }
}

export async function listProjects(): Promise<ProjectsResult> {
  try {
    const response = await requestApi("/projects");

    if (!response.ok) {
      return {
        error: await errorMessage(
          response,
          "We could not load your projects. Refresh the page to try again.",
        ),
        projects: [],
      };
    }

    const body = (await response.json()) as ApiListSuccess<ProjectSummary>;
    return { error: null, projects: body.data };
  } catch {
    return {
      error: "RepurposePro is unreachable. Check your connection and refresh the page.",
      projects: [],
    };
  }
}
