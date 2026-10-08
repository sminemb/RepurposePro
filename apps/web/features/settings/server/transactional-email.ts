import "server-only";

import type { TransactionalEmailConfig } from "@repurposepro/config";
import { APIError } from "better-auth/api";

export interface AccountEmail {
  readonly kind: "current" | "approval" | "new";
  readonly to: string;
  readonly url: string;
}

export type AccountEmailSender = (email: AccountEmail) => Promise<void>;

const messages = {
  current: {
    subject: "Verify your current RepurposePro email",
    action: "Verify your current email address before requesting an email change.",
  },
  approval: {
    subject: "Approve your RepurposePro email change",
    action:
      "Approve your email change. Your current sign-in email stays active until the new address is verified.",
  },
  new: {
    subject: "Verify your new RepurposePro email",
    action: "Verify this address to complete your sign-in email change.",
  },
} as const;

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

export function createTransactionalEmailSender(
  config: TransactionalEmailConfig | null,
): AccountEmailSender {
  return async ({ kind, to, url }) => {
    if (!config)
      throw new APIError("SERVICE_UNAVAILABLE", {
        code: "EMAIL_DELIVERY_UNAVAILABLE",
        message: "Email delivery is unavailable. Please try again later.",
      });
    const { subject, action } = messages[kind];
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: config.from,
          to: [to],
          subject,
          text: `${action}\n\n${url}\n\nIf you did not request this, ignore this email. This link expires in one hour.`,
          html: `<p>${action}</p><p><a href="${escapeHtml(url)}">Continue securely</a></p><p>If you did not request this, ignore this email. This link expires in one hour.</p>`,
        }),
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
      if (!response.ok) throw new Error("Delivery rejected");
    } catch {
      throw new APIError("SERVICE_UNAVAILABLE", {
        code: "EMAIL_DELIVERY_FAILED",
        message: "We could not send the email. Please try again.",
      });
    }
  };
}
