import { BlockList, isIP } from "node:net";
import { loadProtectionConfig } from "@repurposepro/config";
import { protectionPolicies, type ProtectionAction } from "@repurposepro/shared";
import type { AuthenticatedRequest } from "../../modules/auth/auth.guard";

export function protectionRequest(request: AuthenticatedRequest, proxies: readonly string[]) {
  const trusted = new BlockList();
  for (const proxy of proxies) {
    const [address, mask] = proxy.split("/");
    const family = isIP(address!) === 4 ? "ipv4" : "ipv6";
    if (mask === undefined) trusted.addAddress(address!, family);
    else trusted.addSubnet(address!, Number(mask), family);
  }
  const address = request.socket?.remoteAddress?.replace(/^::ffff:/, "");
  const trustsPeer =
    address && isIP(address) && trusted.check(address, isIP(address) === 4 ? "ipv4" : "ipv6");
  // Only the verified peer's overwritten XFF header may influence the client IP.
  const headers: Record<string, string> = {};
  for (const name of ["user-agent", "host", "content-type", "accept"]) {
    const value = request.headers?.[name];
    if (typeof value === "string") headers[name] = value;
  }
  if (trustsPeer && typeof request.headers["x-forwarded-for"] === "string")
    headers["x-forwarded-for"] = request.headers["x-forwarded-for"];
  return {
    headers,
    socket: request.socket,
    method: request.method,
    url: request.originalUrl ?? request.url,
  };
}

export function createProtectionClient(action: ProtectionAction) {
  let client: Awaited<ReturnType<typeof initialize>> | undefined;
  async function initialize() {
    const config = loadProtectionConfig();
    const { default: arcjet, fixedWindow, shield, detectBot } = await import("@arcjet/node");
    const policy = protectionPolicies[action];
    return {
      config,
      sdk: arcjet({
        key: config.key,
        proxies: config.proxies,
        rules: [
          shield({ mode: config.mode }),
          detectBot({ mode: config.mode, allow: [] }),
          fixedWindow({
            ...policy,
            mode: config.mode,
            characteristics: ["userId", "protectionAction"],
          }),
        ],
      }),
    };
  }
  return {
    async protect(
      request: AuthenticatedRequest,
      properties: { userId: string; correlationId?: string },
    ) {
      client ??= await initialize();
      return client.sdk.protect(protectionRequest(request, client.config.proxies), {
        ...properties,
        protectionAction: action,
      });
    },
  };
}
