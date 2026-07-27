import { describe, expect, it } from "vitest";

import { describeApiStartupFailure } from "./startup-diagnostics";

describe("describeApiStartupFailure", () => {
  it("reports a busy configured port without including raw error details", () => {
    const error = Object.assign(new Error("listen EADDRINUSE: 4000 postgresql://secret"), {
      code: "EADDRINUSE",
    });

    expect(describeApiStartupFailure(error, 4000)).toBe(
      "API could not start because port 4000 is already in use. Stop the conflicting process or change API_PORT.",
    );
  });

  it("reports unavailable local dependencies without exposing connection strings", () => {
    const error = Object.assign(new Error("connect ECONNREFUSED postgresql://secret"), {
      code: "ECONNREFUSED",
    });

    expect(describeApiStartupFailure(error, 4000)).toBe(
      "API could not reach a required local service. Start PostgreSQL and Redis, then retry.",
    );
  });

  it("reports rejected PostgreSQL credentials from a nested driver error", () => {
    const error = new Error("database initialization failed", {
      cause: Object.assign(new Error("password authentication failed"), { code: "28P01" }),
    });

    expect(describeApiStartupFailure(error, 4000)).toBe(
      "API could not authenticate with PostgreSQL. Verify the local runtime database credentials, then retry.",
    );
  });

  it("reports authentication initialization separately from infrastructure failures", () => {
    const error = Object.assign(new Error("auth initialization failed"), {
      name: "AuthenticationInitializationError",
    });

    expect(describeApiStartupFailure(error, 4000)).toBe(
      "API could not initialize authentication. Verify Better Auth configuration and database schema, then retry.",
    );
  });

  it("reports Redis initialization separately from database failures", () => {
    const error = Object.assign(new Error("redis initialization failed"), {
      name: "RedisInitializationError",
    });

    expect(describeApiStartupFailure(error, 4000)).toBe(
      "API could not initialize Redis. Verify the local Redis service and runtime connection settings, then retry.",
    );
  });

  it("uses a safe generic message for unknown startup failures", () => {
    expect(describeApiStartupFailure(new Error("DATABASE_URL=postgresql://secret"), 4000)).toBe(
      "API could not start. Check local configuration and required services, then retry.",
    );
  });
});
