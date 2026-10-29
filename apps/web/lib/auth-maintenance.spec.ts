import { afterEach, describe, expect, it, vi } from "vitest";

import { authMaintenanceResponse } from "./auth-maintenance";

afterEach(() => vi.unstubAllEnvs());

describe("auth maintenance flag", () => {
  it.each([undefined, "false"])("defaults to normal operation for %s", (value) => {
    vi.stubEnv("AUTH_MAINTENANCE_MODE", value);
    expect(authMaintenanceResponse()).toBeNull();
  });

  it.each(["true", "invalid", "1", "TRUE"])("fails closed for %s", (value) => {
    vi.stubEnv("AUTH_MAINTENANCE_MODE", value);
    expect(authMaintenanceResponse()?.status).toBe(503);
  });
});
