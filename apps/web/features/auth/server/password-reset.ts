import type { BetterAuthOptions } from "better-auth";

import type { AccountEmailSender } from "../../settings/server/transactional-email";

export function createPasswordResetOptions(
  send: AccountEmailSender,
  schedule: (task: () => Promise<void>) => void,
) {
  return {
    resetPasswordTokenExpiresIn: 3600,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // Keep provider latency and failures out of the anonymous response. The caller
      // uses Next.js after() so delivery survives the response on serverless hosts.
      schedule(async () => {
        try {
          await send({ kind: "reset", to: user.email, url });
        } catch {
          console.error(JSON.stringify({ event: "password_reset_email_failed" }));
        }
      });
    },
  } satisfies Partial<NonNullable<BetterAuthOptions["emailAndPassword"]>>;
}
