import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { BrandMark } from "@/components/app/brand-mark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthForm } from "@/features/auth/components/auth-form";
import { auth } from "@/lib/auth";

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/dashboard");
  return (
    <main className="grid min-h-screen grid-cols-1 place-items-center px-5 py-10">
      <div className="w-full max-w-md">
        <BrandMark className="mb-8 justify-center" />
        <Card className="border border-rp-border bg-rp-card shadow-rp-panel">
          <CardHeader>
            <CardTitle className="text-rp-text">Welcome back</CardTitle>
            <CardDescription className="text-rp-text-muted">
              Sign in to continue building your next clip.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AuthForm mode="login" />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
