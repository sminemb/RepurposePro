import { toNextJsHandler } from "better-auth/next-js";
import { loadWebConfig } from "@repurposepro/config";

import { auth } from "@/lib/auth";
import { protectAuthRequest } from "@/lib/auth-protection";

const handlers = toNextJsHandler(auth);
export async function GET(request: Request) {
  const response = await handlers.GET(request);
  if (new URL(request.url).pathname === "/api/auth/verify-email" && response.status >= 400) {
    const error = response.status === 503 ? "EMAIL_DELIVERY_FAILED" : "INVALID_TOKEN";
    return Response.redirect(
      new URL(`/dashboard/settings?error=${error}`, loadWebConfig().appUrl),
      302,
    );
  }
  return response;
}
export async function POST(request: Request) {
  return (await protectAuthRequest(request)) ?? handlers.POST(request);
}
