import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

/**
 * Keep sign-out as a native server-post form while adapting its request to
 * Better Auth's JSON API contract. The auth response owns the session cookie;
 * this route only adds the post/redirect behavior expected by the dashboard.
 */
export async function POST(request: Request) {
  const authResponse = await auth.api.signOut({
    asResponse: true,
    headers: request.headers,
  });
  const redirectResponse = NextResponse.redirect(new URL("/login", request.url), 303);
  const setCookie = authResponse.headers.get("set-cookie");

  if (setCookie) {
    redirectResponse.headers.set("set-cookie", setCookie);
  }

  return redirectResponse;
}
