import { randomUUID } from "node:crypto";
import { loadProtectionConfig } from "@repurposepro/config";
import {
  protectionFailure,
  protectionOutcome,
  protectionPolicies,
  type ProtectionAction,
} from "@repurposepro/shared";

const clients = new Map<ProtectionAction, Awaited<ReturnType<typeof createClient>>>();
async function createClient(action: "signup" | "login") {
  const config = loadProtectionConfig();
  const { default: arcjet, shield, detectBot, fixedWindow } = await import("@arcjet/next");
  return {
    config,
    sdk: arcjet({
      key: config.key,
      log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      rules: [
        shield({ mode: config.mode }),
        detectBot({ mode: config.mode, allow: [] }),
        fixedWindow({
          ...protectionPolicies[action],
          mode: config.mode,
          characteristics: ["ip.src", "protectionAction"],
        }),
      ],
    }),
  };
}

export async function protectAuthRequest(request: Request): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const action = path.endsWith("/sign-up/email")
    ? "signup"
    : path.endsWith("/sign-in/email")
      ? "login"
      : null;
  if (!action) return null;
  const requestId = `req_${randomUUID()}`;
  let decision: unknown;
  try {
    let client = clients.get(action);
    if (!client) {
      client = await createClient(action);
      clients.set(action, client);
    }
    // Production App Router requests have no peer socket: only Vercel's overwritten
    // platform header is supported until a self-hosted ingress is explicitly configured.
    if (!client.config.local && process.env.VERCEL !== "1")
      throw new Error("Trusted ingress required.");
    const headers = new Headers(request.headers);
    const clientIp =
      process.env.VERCEL === "1" ? headers.get("x-vercel-forwarded-for") : "127.0.0.1";
    for (const name of [...headers.keys()])
      if (
        /forwarded|real-ip|client-ip|connecting-ip|arcjet-ip|true-client|fastly-client|fly-client|appengine-user-ip/i.test(
          name,
        )
      )
        headers.delete(name);
    if (!clientIp) throw new Error("Trusted client IP unavailable.");
    headers.set("x-forwarded-for", clientIp);
    if (client.config.local) headers.set("x-arcjet-ip", "127.0.0.1");
    if (process.env.VERCEL === "1") headers.set("x-vercel-forwarded-for", clientIp);
    headers.delete("cookie");
    headers.delete("authorization");
    decision = await client.sdk.protect(new Request(request.clone(), { headers }), {
      protectionAction: action,
    });
  } catch {
    decision = null;
  }
  const failure = protectionFailure(decision);
  console.info(
    JSON.stringify({
      event: "protection_decision",
      action,
      requestId,
      outcome: protectionOutcome(decision),
    }),
  );
  if (!failure) return null;
  // Better Auth clients expect top-level code/message, unlike the domain API envelope.
  return Response.json(
    { code: failure.code, message: failure.message, requestId },
    {
      status: failure.status,
      headers: {
        "x-request-id": requestId,
        ...(failure.retryAfter ? { "Retry-After": String(failure.retryAfter) } : {}),
      },
    },
  );
}
