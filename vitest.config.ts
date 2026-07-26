import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      reporter: ["text", "json", "html"],
    },
    environment: "node",
    env: {
      APP_ENV: "test",
      APP_URL: "http://localhost:3000",
      ARCJET_KEY: "ajkey_vitest_security",
      ARCJET_MODE: "DRY_RUN",
      BETTER_AUTH_SECRET: "vitest-better-auth-secret-at-least-thirty-two-characters",
      BETTER_AUTH_TRUSTED_ORIGINS: "http://localhost:3000",
      BETTER_AUTH_URL: "http://localhost:3000",
      BULLMQ_PREFIX: "repurposepro-vitest",
      DATABASE_CHECKOUT_URL:
        "postgresql://repurposepro_checkout:vitest-checkout-secret@localhost:5432/repurposepro",
      DATABASE_POOL_MAX: "2",
      DATABASE_PROCESSING_URL:
        "postgresql://repurposepro_processing:vitest-processing-secret@localhost:5432/repurposepro",
      DATABASE_SSL: "false",
      DATABASE_URL:
        "postgresql://repurposepro_runtime:vitest-runtime-secret@localhost:5432/repurposepro",
      DATABASE_WEBHOOK_URL:
        "postgresql://repurposepro_webhook:vitest-webhook-secret@localhost:5432/repurposepro",
      FFPROBE_PATH: "ffprobe",
      FILE_RETENTION_DAYS: "7",
      LOG_LEVEL: "error",
      LOG_PRETTY: "false",
      MAX_UPLOAD_BYTES: "524288000",
      MAX_VIDEO_DURATION_SECONDS: "1800",
      NEXT_PUBLIC_API_URL: "http://localhost:4000/api/v1",
      REDIS_URL: "redis://:vitest-redis-secret@localhost:6379",
      STORAGE_DRIVER: "local",
      STORAGE_ROOT: "./storage",
      STRIPE_CANCEL_URL: "http://localhost:3000/billing?checkout=cancelled",
      STRIPE_CREATOR_PRICE_ID: "price_vitestcreator",
      STRIPE_PRO_PRICE_ID: "price_vitestpro",
      STRIPE_SECRET_KEY: "sk_test_vitestsecurity",
      STRIPE_STARTER_PRICE_ID: "price_viteststarter",
      STRIPE_SUCCESS_URL: "http://localhost:3000/billing?checkout=success",
      STRIPE_WEBHOOK_SECRET: "whsec_vitestsecurity",
    },
    include: ["apps/**/*.spec.ts", "packages/**/*.spec.ts"],
    passWithNoTests: false,
  },
});
