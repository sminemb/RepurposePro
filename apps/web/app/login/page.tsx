import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthForm } from "@/features/auth/components/auth-form";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { auth } from "@/lib/auth";

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/dashboard");

  return (
    <AuthShell description="Keep shaping the moments worth sharing." title="Welcome back">
      <AuthForm mode="login" />
    </AuthShell>
  );
}
