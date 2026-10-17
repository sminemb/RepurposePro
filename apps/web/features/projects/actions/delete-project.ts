"use server";

import { revalidatePath } from "next/cache";
import { requestApi } from "@/lib/server-api";

export async function deleteProjectAction(projectId: string): Promise<{ error: string | null }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(projectId))
    return { error: "Invalid project. Refresh the page and try again." };
  try {
    const response = await requestApi(`/projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      return { error: body?.error?.message ?? "Could not delete this project. Please try again." };
    }
    revalidatePath("/dashboard");
    return { error: null };
  } catch {
    return { error: "RepurposePro is unreachable. Check your connection and try again." };
  }
}
