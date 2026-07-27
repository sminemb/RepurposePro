import { describe, expect, it, vi } from "vitest";

import {
  runDatabaseIntegrationTests,
  type DatabaseIntegrationDependencies,
} from "./run-db-integration";

function createDependencies(
  overrides: Partial<DatabaseIntegrationDependencies> = {},
): DatabaseIntegrationDependencies {
  return {
    restoreDevelopmentRoles: vi.fn().mockResolvedValue(0),
    runTests: vi.fn().mockResolvedValue(0),
    writeError: vi.fn(),
    ...overrides,
  };
}

describe("runDatabaseIntegrationTests", () => {
  it("restores development role credentials after passing integration tests", async () => {
    const dependencies = createDependencies();

    await expect(runDatabaseIntegrationTests(dependencies)).resolves.toBe(0);

    expect(dependencies.restoreDevelopmentRoles).toHaveBeenCalledOnce();
  });

  it("restores development role credentials after integration tests fail", async () => {
    const dependencies = createDependencies({
      runTests: vi.fn().mockResolvedValue(7),
    });

    await expect(runDatabaseIntegrationTests(dependencies)).resolves.toBe(7);

    expect(dependencies.restoreDevelopmentRoles).toHaveBeenCalledOnce();
  });

  it("restores development role credentials when the test runner throws", async () => {
    const failure = new Error("test runner unavailable");
    const dependencies = createDependencies({
      runTests: vi.fn().mockRejectedValue(failure),
    });

    await expect(runDatabaseIntegrationTests(dependencies)).rejects.toBe(failure);

    expect(dependencies.restoreDevelopmentRoles).toHaveBeenCalledOnce();
  });

  it("fails with an actionable error when role restoration fails", async () => {
    const dependencies = createDependencies({
      restoreDevelopmentRoles: vi.fn().mockResolvedValue(9),
    });

    await expect(runDatabaseIntegrationTests(dependencies)).resolves.toBe(9);

    expect(dependencies.writeError).toHaveBeenCalledWith(
      "Database role restoration failed. Run pnpm db:provision-roles before starting the API.",
    );
  });
});
