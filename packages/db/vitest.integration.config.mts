import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadDotEnv } from "dotenv";
import { defineConfig } from "vitest/config";

const environmentFile = [
  resolve(process.cwd(), ".env.database"),
  resolve(process.cwd(), "../../.env.database"),
].find((candidate) => existsSync(candidate));

if (environmentFile) {
  loadDotEnv({ path: environmentFile, override: false, quiet: true });
}

const requiredDatabaseVariables = [
  "TEST_DATABASE_BOOTSTRAP_URL",
  "TEST_DATABASE_MIGRATION_URL",
  "TEST_DATABASE_RUNTIME_URL",
] as const;
const missingDatabaseVariables = requiredDatabaseVariables.filter((name) => !process.env[name]);

if (missingDatabaseVariables.length > 0) {
  throw new Error(`PostgreSQL integration tests require: ${missingDatabaseVariables.join(", ")}.`);
}

export default defineConfig({
  test: {
    environment: "node",
    hookTimeout: 30_000,
    include: [
      "apps/api/src/modules/billing/billing.postgres.integration.spec.ts",
      "apps/api/src/modules/processing/processing.postgres.integration.spec.ts",
      "packages/db/src/schema/billing-integrity.integration.spec.ts",
    ],
    passWithNoTests: false,
  },
});
