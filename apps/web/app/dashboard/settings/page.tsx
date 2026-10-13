import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { PageHeader } from "@/components/app/page-header";
import { SettingsForms } from "@/features/settings/components/settings-forms";
import { auth, transactionalEmailConfigured } from "@/lib/auth";

const callbackErrors: Record<string, string> = {
  TOKEN_EXPIRED: "This link has expired. Request another email from Settings.",
  INVALID_TOKEN: "This link is invalid. Request another email from Settings.",
  INVALID_USER: "Sign in to the account that requested this email change.",
  USER_NOT_FOUND:
    "This link is no longer valid. Check your current sign-in email and request another link.",
  EMAIL_DELIVERY_FAILED:
    "We could not send the verification email. Open the approval link again to retry, or start a new request.",
};

export default async function SettingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
  if (!session) redirect("/login");
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const stage = ["current", "approved", "verified"].includes(String(params.emailChange))
    ? String(params.emailChange)
    : undefined;
  return (
    <div className="flex min-h-dvh bg-rp-bg">
      <AppSidebar className="fixed inset-y-0 left-0 hidden lg:flex" />
      <div className="min-w-0 flex-1 lg:pl-66">
        <AppTopbar title="Settings" userEmail={session.user.email} userName={session.user.name} />
        <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
          <PageHeader
            title="Account settings"
            description="Manage your profile and the credentials you use to sign in."
          />
          <SettingsForms
            name={session.user.name}
            email={session.user.email}
            emailVerified={session.user.emailVerified}
            emailAvailable={transactionalEmailConfigured}
            stage={stage}
            callbackError={
              error
                ? Object.hasOwn(callbackErrors, error)
                  ? callbackErrors[error]
                  : "This email request could not be completed. Request another link from Settings."
                : undefined
            }
          />
        </main>
      </div>
    </div>
  );
}
