import "server-only";

import { loadWebConfig } from "@repurposepro/config";
import type { ApiError, ApiListSuccess, CreateProjectInput, ProjectSummary } from "@repurposepro/shared";
import { headers } from "next/headers";

interface ProjectsResult {
  readonly error: string | null;
  readonly projects: readonly ProjectSummary[];
}

interface CreateProjectResult {
  readonly error: string | null;
}

async function requestApi(path: string, init?: RequestInit): Promise<Response> {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie");
  const apiHeaders = new Headers(init?.headers);

  if (cookie) {
    apiHeaders.set("cookie", cookie);
  }

  return fetch(`${loadWebConfig().apiUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: apiHeaders,
  });
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
      return { error: await errorMessage(response, "We could not create this project. Try again.") };
    }

    return { error: null };
  } catch {
    return { error: "RepurposePro is unreachable. Check your connection and try again." };
  }
}

export async function listProjects(): Promise<ProjectsResult> {
  try {
    const response = await requestApi("/projects");

    if (!response.ok) {
      return {
        error: await errorMessage(response, "We could not load your projects. Refresh the page to try again."),
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
