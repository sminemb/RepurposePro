import "server-only";

import { loadWebConfig } from "@repurposepro/config";
import { headers } from "next/headers";

export async function requestApi(path: string, init?: RequestInit): Promise<Response> {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie");
  const apiHeaders = new Headers(init?.headers);

  if (cookie) {
    apiHeaders.set("cookie", cookie);
  }

  return fetch(`${loadWebConfig().apiUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: apiHeaders,
  });
}
