/** Expose only public retry/correlation headers to the configured frontend. */
export function apiCorsOptions(appUrl: string) {
  return {
    credentials: true,
    origin: appUrl,
    exposedHeaders: ["Retry-After", "X-Request-Id"],
  };
}
