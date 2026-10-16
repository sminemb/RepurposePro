import { AuthShell } from "@/features/auth/components/auth-shell";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return (
    <AuthShell
      title="Reset your password"
      description="Choose a new password to get back to your workspace."
    >
      <ResetPasswordForm
        token={typeof token === "string" ? token : undefined}
        invalid={Boolean(error)}
      />
    </AuthShell>
  );
}
