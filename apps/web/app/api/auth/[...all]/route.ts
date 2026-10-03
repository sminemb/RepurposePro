import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";
import { protectAuthRequest } from "@/lib/auth-protection";

const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;
export async function POST(request: Request) {
  return (await protectAuthRequest(request)) ?? handlers.POST(request);
}
