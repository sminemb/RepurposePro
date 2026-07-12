import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthForm } from "@/features/auth/components/auth-form";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { auth } from "@/lib/auth";

export default async function SignupPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/dashboard");

  return (
    <AuthShell
      description="Turn one recording into a focused library of content."
      title="Create your workspace"
    >
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
