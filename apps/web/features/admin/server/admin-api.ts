import "server-only";
import { isAdminEmail, loadAdminIdentityConfig } from "@repurposepro/config";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requestApi } from "@/lib/server-api";

export async function getAdminSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return isAdminEmail(session.user.email, loadAdminIdentityConfig()) ? session : null;
}
export type AdminReadResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };
export async function readAdmin<T>(path: string): Promise<AdminReadResult<T>> {
  if (!(await getAdminSession()))
    return { ok: false, message: "You do not have access to this area." };
  try {
    const response = await requestApi(`/admin${path}`);
    if (response.status === 401) redirect("/login");
    if (!response.ok) {
      const messages: Record<number, string> = {
        400: "Check your lookup, filters or page cursor and try again.",
        403: "You do not have access to this area.",
        404: "This record could not be found.",
      };
      return {
        ok: false,
        message: messages[response.status] ?? "Admin data is temporarily unavailable. Try again.",
      };
    }
    return { ok: true, value: (await response.json()) as T };
  } catch (error) {
    // Next redirects must escape the dependency-error boundary.
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    return { ok: false, message: "Admin data is temporarily unavailable. Try again." };
  }
}
