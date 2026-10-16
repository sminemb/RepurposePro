import { AuthShell } from "@/features/auth/components/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Forgot your password?"
      description="Enter your account email and we’ll send you a link to choose a new password."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
