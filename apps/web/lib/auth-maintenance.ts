export function authMaintenanceEnabled(): boolean {
  const mode = process.env.AUTH_MAINTENANCE_MODE;
  return mode !== undefined && mode !== "false";
}

/** Block every auth entry point: even GET callbacks/session refreshes can write. */
export function authMaintenanceResponse(): Response | null {
  if (!authMaintenanceEnabled()) return null;
  return Response.json(
    {
      code: "AUTH_MAINTENANCE",
      message: "Account services are undergoing maintenance. Please try again later.",
    },
    { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300" } },
  );
}
