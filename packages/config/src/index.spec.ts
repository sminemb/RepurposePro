import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ConfigValidationError,
  loadApiConfig,
  loadAuthConfig,
  loadWebConfig,
  loadWorkerConfig,
} from "./index";

const validServerEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "development",
  APP_ENV: "local",
  DATABASE_URL: "postgresql://repurposepro_runtime:secret-password@localhost:5432/repurposepro",
  DATABASE_POOL_MAX: "12",
  DATABASE_SSL: "false",
  REDIS_URL: "redis://localhost:6379",
  LOG_LEVEL: "debug",
  LOG_PRETTY: "true",
  STORAGE_DRIVER: "local",
  STORAGE_ROOT: "./storage",
  FFPROBE_PATH: "ffprobe",
  FILE_RETENTION_DAYS: "7",
  MAX_UPLOAD_BYTES: "524288000",
  MAX_VIDEO_DURATION_SECONDS: "1800",
  ARCJET_KEY: "ajkey_checkout_tests",
  ARCJET_MODE: "DRY_RUN",
  STRIPE_SECRET_KEY: "sk_test_checkouttests",
  STRIPE_STARTER_PRICE_ID: "price_startertests",
  STRIPE_CREATOR_PRICE_ID: "price_creatortests",
  STRIPE_PRO_PRICE_ID: "price_protests",
  STRIPE_SUCCESS_URL: "http://localhost:3000/billing?checkout=success",
  STRIPE_CANCEL_URL: "http://localhost:3000/billing?checkout=cancelled",
};

describe("configuration loaders", () => {
  it("coerces server numbers and booleans", () => {
    const config = loadWorkerConfig(validServerEnvironment);

    expect(config.databasePoolMax).toBe(12);
    expect(config.databaseSsl).toBe(false);
    expect(config.logPretty).toBe(true);
  });

  it.each([
    ["bootstrap", "repurposepro"],
    ["migration owner", "repurposepro_owner"],
  ])("rejects the %s database role for worker startup", (_label, role) => {
    expect(() =>
      loadWorkerConfig({
        ...validServerEnvironment,
        DATABASE_URL: `postgresql://${role}:secret-password@localhost:5432/repurposepro`,
      }),
    ).toThrow(ConfigValidationError);
  });

  it("rejects the migration owner database role for API startup", () => {
    expect(() =>
      loadApiConfig({
        ...validServerEnvironment,
        APP_URL: "http://localhost:3000",
        API_PORT: "4000",
        DATABASE_URL: "postgresql://repurposepro_owner:secret-password@localhost:5432/repurposepro",
      }),
    ).toThrow(ConfigValidationError);
  });

  it("rejects the migration owner database role for authentication startup", () => {
    expect(() =>
      loadAuthConfig({
        ...validServerEnvironment,
        APP_URL: "http://localhost:3000",
        BETTER_AUTH_SECRET: "auth-secret-for-tests-only",
        BETTER_AUTH_URL: "http://localhost:3000",
        DATABASE_URL: "postgresql://repurposepro_owner:secret-password@localhost:5432/repurposepro",
      }),
    ).toThrow(ConfigValidationError);
  });

  it("reports invalid keys without including secret values", () => {
    const missingDatabaseUrl = { ...validServerEnvironment };
    delete missingDatabaseUrl.DATABASE_URL;

    expect(() => loadWorkerConfig(missingDatabaseUrl)).toThrow(ConfigValidationError);

    try {
      loadWorkerConfig(missingDatabaseUrl);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      expect(message).toContain("DATABASE_URL");
      expect(message).not.toContain("secret-password");
    }
  });

  it("rejects API startup when local storage configuration is incomplete", () => {
    const environment = {
      ...validServerEnvironment,
      APP_URL: "http://localhost:3000",
      API_PORT: "4000",
    };
    delete environment.STORAGE_ROOT;

    expect(() => loadApiConfig(environment)).toThrow(ConfigValidationError);
  });

  it("loads API-only values", () => {
    const config = loadApiConfig({
      ...validServerEnvironment,
      APP_URL: "http://localhost:3000",
      API_PORT: "4000",
    });

    expect(config.apiPort).toBe(4000);
    expect(config.ffprobePath).toBe("ffprobe");
    expect(config.fileRetentionDays).toBe(7);
    expect(config.maxUploadBytes).toBe(524_288_000);
    expect(config.maxVideoDurationSeconds).toBe(1_800);
    expect(config.storageDriver).toBe("local");
    expect(config.storageRoot).toBe(resolve(process.cwd(), "storage"));
    expect(config.appUrl).toBe("http://localhost:3000");
    expect(config.arcjet.mode).toBe("DRY_RUN");
    expect(config.stripe.priceIds).toEqual({
      creator: "price_creatortests",
      pro: "price_protests",
      starter: "price_startertests",
    });
  });

  it.each([
    "ARCJET_KEY",
    "ARCJET_MODE",
    "STRIPE_SECRET_KEY",
    "STRIPE_STARTER_PRICE_ID",
    "STRIPE_CREATOR_PRICE_ID",
    "STRIPE_PRO_PRICE_ID",
    "STRIPE_SUCCESS_URL",
    "STRIPE_CANCEL_URL",
  ])("rejects API startup when checkout configuration is missing: %s", (key) => {
    const environment = {
      ...validServerEnvironment,
      APP_URL: "http://localhost:3000",
      API_PORT: "4000",
    };
    delete environment[key as keyof typeof environment];

    expect(() => loadApiConfig(environment)).toThrow(ConfigValidationError);
  });

  it("rejects placeholder checkout secrets without including their values", () => {
    const environment = {
      ...validServerEnvironment,
      APP_URL: "http://localhost:3000",
      API_PORT: "4000",
      ARCJET_KEY: "replace-me",
      STRIPE_SECRET_KEY: "sk_test_replace_me",
    };

    expect(() => loadApiConfig(environment)).toThrow(ConfigValidationError);

    try {
      loadApiConfig(environment);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      expect(message).toContain("ARCJET_KEY");
      expect(message).toContain("STRIPE_SECRET_KEY");
      expect(message).not.toContain("sk_test_replace_me");
    }
  });

  it("loads Better Auth settings without exposing them in web configuration", () => {
    const config = loadAuthConfig({
      ...validServerEnvironment,
      APP_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "auth-secret-for-tests-only",
      BETTER_AUTH_TRUSTED_ORIGINS: "http://localhost:3000,https://app.example.com",
      BETTER_AUTH_URL: "http://localhost:3000",
    });

    expect(config.trustedOrigins).toEqual(["http://localhost:3000", "https://app.example.com"]);
    expect(config.url).toBe("http://localhost:3000");
  });

  it("rejects an empty Better Auth secret without disclosing its value", () => {
    const environment = {
      ...validServerEnvironment,
      APP_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "",
      BETTER_AUTH_URL: "http://localhost:3000",
    };

    expect(() => loadAuthConfig(environment)).toThrow(ConfigValidationError);
  });

  it("keeps the web configuration public-only", () => {
    const config = loadWebConfig({
      NODE_ENV: "production",
      APP_ENV: "production",
      APP_URL: "https://app.example.com",
      NEXT_PUBLIC_API_URL: "https://api.example.com/api/v1",
      DATABASE_URL: "postgresql://do-not-expose",
    });

    expect(config).toEqual({
      apiUrl: "https://api.example.com/api/v1",
      appEnv: "production",
      appUrl: "https://app.example.com",
      nodeEnv: "production",
    });
    expect("databaseUrl" in config).toBe(false);
  });
});
