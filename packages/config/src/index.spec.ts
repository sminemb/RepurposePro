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
  NEXT_PUBLIC_API_URL: "http://localhost:4000/api/v1",
  DATABASE_URL: "postgresql://repurposepro_runtime:secret-password@localhost:5432/repurposepro",
  DATABASE_CHECKOUT_URL:
    "postgresql://repurposepro_checkout:secret-password@localhost:5432/repurposepro",
  DATABASE_WEBHOOK_URL:
    "postgresql://repurposepro_webhook:secret-password@localhost:5432/repurposepro",
  DATABASE_PROCESSING_URL:
    "postgresql://repurposepro_processing:secret-password@localhost:5432/repurposepro",
  DATABASE_POOL_MAX: "12",
  DATABASE_SSL: "false",
  REDIS_URL: "redis://:redis-test-secret@localhost:6379",
  LOG_LEVEL: "debug",
  LOG_PRETTY: "true",
  FFMPEG_PATH: "ffmpeg",
  GEMINI_CLIP_MODEL: "gemini-3.5-flash-lite",
  GEMINI_MAX_RETRIES: "2",
  GEMINI_TIMEOUT_MS: "60000",
  STORAGE_DRIVER: "local",
  STORAGE_ROOT: "./storage",
  FFPROBE_PATH: "ffprobe",
  FILE_RETENTION_DAYS: "7",
  MAX_UPLOAD_BYTES: "524288000",
  MAX_VIDEO_DURATION_SECONDS: "1800",
  ARCJET_KEY: "ajkey_checkout_tests",
  ARCJET_MODE: "DRY_RUN",
  STRIPE_SECRET_KEY: "sk_test_checkouttests",
  STRIPE_WEBHOOK_SECRET: "whsec_checkouttests",
  STRIPE_STARTER_PRICE_ID: "price_startertests",
  STRIPE_CREATOR_PRICE_ID: "price_creatortests",
  STRIPE_PRO_PRICE_ID: "price_protests",
  STRIPE_SUCCESS_URL: "http://localhost:3000/billing?checkout=success",
  STRIPE_CANCEL_URL: "http://localhost:3000/billing?checkout=cancelled",
  WHISPER_COMPUTE_TYPE: "int8",
  WHISPER_DEVICE: "cpu",
  WHISPER_ENABLE_WORD_TIMESTAMPS: "true",
  WHISPER_LANGUAGE: "en",
  WHISPER_MODEL: "small.en",
  WHISPER_PYTHON_PATH: "python3.13",
  WHISPER_TIMEOUT_MS: "900000",
};

describe("configuration loaders", () => {
  it("coerces server numbers and booleans", () => {
    const config = loadWorkerConfig(validServerEnvironment);

    expect(config.databasePoolMax).toBe(12);
    expect(config.databaseSsl).toBe(false);
    expect(config.ffmpegPath).toBe("ffmpeg");
    expect(config.gemini).toEqual({
      apiKey: undefined,
      maxRetries: 2,
      model: "gemini-3.5-flash-lite",
      timeoutMs: 60_000,
    });
    expect(config.logPretty).toBe(true);
    expect(config.processingDatabaseUrl).toContain("repurposepro_processing");
    expect(config.storageRoot).toBe(resolve(process.cwd(), "storage"));
    expect(config.whisper).toEqual({
      computeType: "int8",
      device: "cpu",
      enableWordTimestamps: true,
      language: "en",
      model: "small.en",
      pythonPath: "python3.13",
      timeoutMs: 900_000,
    });
  });

  it("requires the processing-role database URL for worker startup", () => {
    const environment = { ...validServerEnvironment };
    delete environment.DATABASE_PROCESSING_URL;

    expect(() => loadWorkerConfig(environment)).toThrow(ConfigValidationError);
  });

  it("requires the FFmpeg binary path for worker startup", () => {
    const environment = { ...validServerEnvironment };
    delete environment.FFMPEG_PATH;

    expect(() => loadWorkerConfig(environment)).toThrow(ConfigValidationError);
  });

  it("requires an explicit isolated Python runtime for worker startup", () => {
    const environment = { ...validServerEnvironment };
    delete environment.WHISPER_PYTHON_PATH;

    expect(() => loadWorkerConfig(environment)).toThrow(ConfigValidationError);
  });

  it("rejects unsafe Whisper timeout and device configuration", () => {
    expect(() =>
      loadWorkerConfig({
        ...validServerEnvironment,
        WHISPER_DEVICE: "remote",
        WHISPER_TIMEOUT_MS: "999",
      }),
    ).toThrow(ConfigValidationError);
  });

  it("accepts an optional Gemini key without requiring it for deterministic tests", () => {
    const config = loadWorkerConfig({
      ...validServerEnvironment,
      GEMINI_API_KEY: "local-test-key",
      GEMINI_MAX_RETRIES: "1",
    });

    expect(config.gemini.apiKey).toBe("local-test-key");
    expect(config.gemini.maxRetries).toBe(1);
  });

  it("rejects a generic runtime URL as the worker processing credential", () => {
    expect(() =>
      loadWorkerConfig({
        ...validServerEnvironment,
        DATABASE_PROCESSING_URL:
          "postgresql://repurposepro_runtime:secret-password@localhost:5432/repurposepro",
      }),
    ).toThrow(ConfigValidationError);
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
    expect(config.bullmqPrefix).toBe("repurposepro");
    expect(config.ffprobePath).toBe("ffprobe");
    expect(config.fileRetentionDays).toBe(7);
    expect(config.maxUploadBytes).toBe(524_288_000);
    expect(config.maxVideoDurationSeconds).toBe(1_800);
    expect(config.storageDriver).toBe("local");
    expect(config.storageRoot).toBe(resolve(process.cwd(), "storage"));
    expect(config.appUrl).toBe("http://localhost:3000");
    expect(config.arcjet.mode).toBe("DRY_RUN");
    expect(config.checkoutDatabaseUrl).toContain("repurposepro_checkout");
    expect(config.processingDatabaseUrl).toContain("repurposepro_processing");
    expect(config.webhookDatabaseUrl).toContain("repurposepro_webhook");
    expect(config.stripe.livemode).toBe(false);
    expect(config.stripe.priceIds).toEqual({
      creator: "price_creatortests",
      pro: "price_protests",
      starter: "price_startertests",
    });
    expect(config.stripe.webhookSecret).toBe("whsec_checkouttests");
  });

  it("rejects unauthenticated Redis and incorrectly scoped database URLs", () => {
    expect(() =>
      loadApiConfig({
        ...validServerEnvironment,
        APP_URL: "http://localhost:3000",
        API_PORT: "4000",
        DATABASE_WEBHOOK_URL:
          "postgresql://repurposepro_runtime:secret-password@localhost:5432/repurposepro",
        REDIS_URL: "redis://localhost:6379",
      }),
    ).toThrow(ConfigValidationError);
  });

  it("loads a configured BullMQ prefix", () => {
    const config = loadApiConfig({
      ...validServerEnvironment,
      APP_URL: "http://localhost:3000",
      API_PORT: "4000",
      BULLMQ_PREFIX: "repurposepro-test",
    });

    expect(config.bullmqPrefix).toBe("repurposepro-test");
  });

  it.each([
    ["NODE_ENV", { NODE_ENV: "production", APP_ENV: "local" }],
    ["APP_ENV", { NODE_ENV: "development", APP_ENV: "production" }],
  ])("rejects Arcjet DRY_RUN when %s is production", (_productionKey, productionEnvironment) => {
    expect(() =>
      loadApiConfig({
        ...validServerEnvironment,
        ...productionEnvironment,
        APP_URL: "https://app.example.com",
        API_PORT: "4000",
        ARCJET_MODE: "DRY_RUN",
      }),
    ).toThrow(ConfigValidationError);
  });

  it.each([
    "ARCJET_KEY",
    "ARCJET_MODE",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
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
    expect(config.apiUrl).toBe("http://localhost:4000/api/v1");
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
