"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createProject } from "../server/projects-api";

interface CreateProjectFormState {
  readonly error: string | null;
}

export async function createProjectAction(
  _previousState: CreateProjectFormState,
  formData: FormData,
): Promise<CreateProjectFormState> {
  const name = formData.get("name");
  const outputType = formData.get("outputType");
  const result = await createProject({
    name: typeof name === "string" ? name : "",
    outputType: outputType === "summary" ? "summary" : "clips",
  });

  if (result.error || !result.projectId) {
    return { error: result.error ?? "We could not create this project. Try again." };
  }

  revalidatePath("/dashboard");
  redirect(`/projects/${result.projectId}/upload`);
}
