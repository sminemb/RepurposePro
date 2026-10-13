import type { BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from "better-auth/api";

import { validateEmail, validateName } from "../validation";
import type { AccountEmailSender } from "./transactional-email";

function emailLink(url: string, stage: "current" | "approved" | "verified"): string {
  const link = new URL(url);
  link.searchParams.set("callbackURL", `/dashboard/settings?emailChange=${stage}`);
  return link.href;
}

export function createAccountSettingsOptions(send: AccountEmailSender, emailAvailable: boolean) {
  const deliver: AccountEmailSender = async (message) => {
    try {
      await send(message);
    } catch {
      throw new APIError("SERVICE_UNAVAILABLE", {
        code: "EMAIL_DELIVERY_FAILED",
        message: "We could not send the email. Please try again.",
      });
    }
  };
  return {
    // Better Auth otherwise catches delivery errors and reports a successful request.
    // Await through its context extension so account mail failures reach the caller.
    plugins: [
      {
        id: "account-email-delivery",
        init: () => ({
          context: {
            runInBackgroundOrAwait: async (promise: Promise<unknown> | void) => {
              await promise;
            },
          },
        }),
      },
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          ![
            "/update-user",
            "/change-email",
            "/change-password",
            "/send-verification-email",
          ].includes(ctx.path)
        )
          return;
        const session = await getAuthoritativeSessionFromCtx(ctx);
        if (!session)
          throw new APIError("UNAUTHORIZED", {
            code: "SESSION_EXPIRED",
            message: "Sign in again to manage your account.",
          });
        const body = ctx.body as Record<string, unknown> | undefined;
        if (ctx.path === "/update-user" && body && "name" in body) {
          const name = typeof body.name === "string" ? body.name.trim() : "";
          if (validateName(name))
            throw new APIError("BAD_REQUEST", {
              code: "INVALID_NAME",
              message: "Enter your account name.",
            });
          return { context: { body: { ...body, name } } };
        }
        if (ctx.path === "/change-password") {
          return { context: { body: { ...body, revokeOtherSessions: true } } };
        }
        if (!["/change-email", "/send-verification-email"].includes(ctx.path)) return;
        if (!emailAvailable)
          throw new APIError("SERVICE_UNAVAILABLE", {
            code: "EMAIL_DELIVERY_UNAVAILABLE",
            message: "Email delivery is unavailable. Please try again later.",
          });
        if (ctx.path === "/send-verification-email") {
          if (
            typeof body?.email !== "string" ||
            body.email.trim().toLowerCase() !== session.user.email.toLowerCase()
          ) {
            throw new APIError("BAD_REQUEST", {
              code: "INVALID_EMAIL",
              message: "Verify your current account email address.",
            });
          }
          return {
            context: {
              body: {
                ...body,
                email: session.user.email,
                callbackURL: "/dashboard/settings?emailChange=current",
              },
            },
          };
        }
        if (!session.user.emailVerified)
          throw new APIError("BAD_REQUEST", {
            code: "CURRENT_EMAIL_UNVERIFIED",
            message: "Verify your current email address before requesting a change.",
          });
        const newEmail =
          typeof body?.newEmail === "string" ? body.newEmail.trim().toLowerCase() : "";
        const error = validateEmail(newEmail, session.user.email);
        if (error) throw new APIError("BAD_REQUEST", { code: "INVALID_EMAIL", message: error });
        if (await ctx.context.internalAdapter.findUserByEmail(newEmail))
          throw new APIError("BAD_REQUEST", {
            code: "EMAIL_UNAVAILABLE",
            message: "This email address is unavailable. Choose another address.",
          });
        return {
          context: {
            body: { ...body, newEmail, callbackURL: "/dashboard/settings?emailChange=verified" },
          },
        };
      }),
    },
    user: {
      changeEmail: {
        enabled: true,
        updateEmailWithoutVerification: false,
        sendChangeEmailConfirmation: async ({ user, url }) => {
          await deliver({ kind: "approval", to: user.email, url: emailLink(url, "approved") });
        },
      },
    },
    emailVerification: {
      sendOnSignUp: false,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) => {
        const isCurrent =
          new URL(url).searchParams.get("callbackURL") ===
          "/dashboard/settings?emailChange=current";
        await deliver({
          kind: isCurrent ? "current" : "new",
          to: user.email,
          url: emailLink(url, isCurrent ? "current" : "verified"),
        });
      },
    },
  } satisfies BetterAuthOptions;
}
