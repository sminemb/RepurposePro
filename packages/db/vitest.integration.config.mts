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
    fileParallelism: false,
    hookTimeout: 30_000,
    include: [
      "apps/api/src/modules/billing/billing.postgres.integration.spec.ts",
      "apps/api/src/modules/processing/analysis-queue.redis.integration.spec.ts",
      "apps/api/src/modules/processing/processing.postgres.integration.spec.ts",
      "apps/api/src/modules/processing/processing-recovery.postgres-redis.integration.spec.ts",
      "apps/api/src/modules/processing/processing-reliability.postgres.integration.spec.ts",
      "packages/db/src/schema/billing-integrity.integration.spec.ts",
    ],
    env: {
      APP_ENV: "test",
      APP_URL: "http://localhost:3000",
      ARCJET_KEY: "ajkey_integration_security",
      ARCJET_MODE: "DRY_RUN",
      BULLMQ_PREFIX: "repurposepro-integration",
      DATABASE_CHECKOUT_URL:
        "postgresql://repurposepro_checkout:integration-checkout-secret@localhost:5432/repurposepro",
      DATABASE_POOL_MAX: "2",
      DATABASE_PROCESSING_URL:
        "postgresql://repurposepro_processing:integration-processing-secret@localhost:5432/repurposepro",
      DATABASE_SSL: "false",
      DATABASE_URL:
        "postgresql://repurposepro_runtime:integration-runtime-secret@localhost:5432/repurposepro",
      DATABASE_WEBHOOK_URL:
        "postgresql://repurposepro_webhook:integration-webhook-secret@localhost:5432/repurposepro",
      FFPROBE_PATH: "ffprobe",
      FILE_RETENTION_DAYS: "7",
      LOG_LEVEL: "error",
      LOG_PRETTY: "false",
      MAX_UPLOAD_BYTES: "524288000",
      MAX_VIDEO_DURATION_SECONDS: "1800",
      REDIS_URL: "redis://:integration-redis-secret@localhost:6379",
      RUN_REDIS_INTEGRATION: "true",
      STORAGE_DRIVER: "local",
      STORAGE_ROOT: "./storage",
      STRIPE_CANCEL_URL: "http://localhost:3000/billing?checkout=cancelled",
      STRIPE_CREATOR_PRICE_ID: "price_integrationcreator",
      STRIPE_PRO_PRICE_ID: "price_integrationpro",
      STRIPE_SECRET_KEY: "sk_test_integrationsecurity",
      STRIPE_STARTER_PRICE_ID: "price_integrationstarter",
      STRIPE_SUCCESS_URL: "http://localhost:3000/billing?checkout=success",
      STRIPE_WEBHOOK_SECRET: "whsec_integrationsecurity",
      TEST_REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379",
    },
    passWithNoTests: false,
  },
});
