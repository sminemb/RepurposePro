export interface AuthCookieConfiguration {
  readonly crossSubDomainCookies: {
    readonly domain: string;
    readonly enabled: true;
  };
  readonly defaultCookieAttributes: {
    readonly sameSite: "none";
    readonly secure: true;
  };
}

export function resolveAuthCookieConfiguration(
  appUrl: string,
  apiUrl: string,
): AuthCookieConfiguration | undefined {
  const appHostname = new URL(appUrl).hostname.toLowerCase();
  const apiHostname = new URL(apiUrl).hostname.toLowerCase();
  if (appHostname === apiHostname) return undefined;

  const appLabels = appHostname.split(".");
  const apiLabels = apiHostname.split(".");
  const sharedLabels: string[] = [];
  while (appLabels.length > 0 && apiLabels.length > 0 && appLabels.at(-1) === apiLabels.at(-1)) {
    sharedLabels.unshift(appLabels.pop()!);
    apiLabels.pop();
  }
  if (sharedLabels.length < 2) {
    throw new Error("APP_URL and NEXT_PUBLIC_API_URL must share a parent domain.");
  }

  return {
    crossSubDomainCookies: { domain: sharedLabels.join("."), enabled: true },
    defaultCookieAttributes: { sameSite: "none", secure: true },
  };
}
