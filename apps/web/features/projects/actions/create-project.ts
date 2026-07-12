"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createProject } from "../server/projects-api";

export interface CreateProjectFormState {
  readonly error: string | null;
}

export const initialCreateProjectFormState: CreateProjectFormState = { error: null };

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

  if (result.error) {
    return { error: result.error };
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
