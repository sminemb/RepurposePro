import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

const nodeEnvironmentSchema = z.enum(["development", "test", "production"]);
const appEnvironmentSchema = z.enum(["local", "development", "staging", "production", "test"]);
const logLevelSchema = z.enum(["debug", "info", "warn", "error"]);
const arcjetModeSchema = z.enum(["DRY_RUN", "LIVE"]);
const runtimeDatabaseUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        const role = decodeURIComponent(url.username);

        return (
          ["postgres:", "postgresql:"].includes(url.protocol) && role === "repurposepro_runtime"
        );
      } catch {
        return false;
      }
    },
    { message: "Must use the repurposepro_runtime PostgreSQL role." },
  );

const booleanFromEnvironment = z.preprocess((value: unknown) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return value;
}, z.boolean());

const requiredCheckoutValue = (key: string) =>
  z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) =>
        !["replace-me", "sk_test_replace_me", "price_replace_me", "whsec_replace_me"].includes(
          value,
        ),
      {
        message: `${key} must not use a placeholder value.`,
      },
    );

const stripeSecretKeySchema = requiredCheckoutValue("STRIPE_SECRET_KEY").regex(
  /^sk_(?:test|live)_[A-Za-z0-9]+$/,
  "Must be a Stripe secret key.",
);
const stripePriceIdSchema = (key: string) =>
  requiredCheckoutValue(key).regex(/^price_[A-Za-z0-9]+$/, "Must be a Stripe Price ID.");
const stripeWebhookSecretSchema = requiredCheckoutValue("STRIPE_WEBHOOK_SECRET").regex(
  /^whsec_[A-Za-z0-9]+$/,
  "Must be a Stripe webhook signing secret.",
);
const arcjetKeySchema = requiredCheckoutValue("ARCJET_KEY").regex(
  /^ajkey_[A-Za-z0-9_]+$/,
  "Must be an Arcjet key.",
);

const webEnvironmentSchema = z.object({
  NODE_ENV: nodeEnvironmentSchema,
  APP_ENV: appEnvironmentSchema,
  APP_URL: z.string().url(),
  NEXT_PUBLIC_API_URL: z.string().url(),
});

const serverEnvironmentSchema = z.object({
  NODE_ENV: nodeEnvironmentSchema,
  APP_ENV: appEnvironmentSchema,
  DATABASE_URL: runtimeDatabaseUrlSchema,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100),
  DATABASE_SSL: booleanFromEnvironment,
  REDIS_URL: z.string().min(1),
  LOG_LEVEL: logLevelSchema,
  LOG_PRETTY: booleanFromEnvironment,
});

const apiEnvironmentSchema = serverEnvironmentSchema.extend({
  ARCJET_KEY: arcjetKeySchema,
  ARCJET_MODE: arcjetModeSchema,
  APP_URL: z.string().url(),
  API_PORT: z.coerce.number().int().min(1).max(65_535),
  BULLMQ_PREFIX: z.string().trim().min(1).default("repurposepro"),
  FFPROBE_PATH: z.string().trim().min(1),
  FILE_RETENTION_DAYS: z.coerce.number().int().positive(),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive(),
  MAX_VIDEO_DURATION_SECONDS: z.coerce.number().int().positive(),
  STORAGE_DRIVER: z.literal("local"),
  STORAGE_ROOT: z.string().trim().min(1),
  STRIPE_CANCEL_URL: z.string().url(),
  STRIPE_CREATOR_PRICE_ID: stripePriceIdSchema("STRIPE_CREATOR_PRICE_ID"),
  STRIPE_PRO_PRICE_ID: stripePriceIdSchema("STRIPE_PRO_PRICE_ID"),
  STRIPE_SECRET_KEY: stripeSecretKeySchema,
  STRIPE_STARTER_PRICE_ID: stripePriceIdSchema("STRIPE_STARTER_PRICE_ID"),
  STRIPE_SUCCESS_URL: z.string().url(),
  STRIPE_WEBHOOK_SECRET: stripeWebhookSecretSchema,
});

const authEnvironmentSchema = z.object({
  APP_ENV: appEnvironmentSchema,
  APP_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),
  BETTER_AUTH_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100),
  DATABASE_SSL: booleanFromEnvironment,
  DATABASE_URL: runtimeDatabaseUrlSchema,
  NODE_ENV: nodeEnvironmentSchema,
});

export interface WebConfig {
  readonly apiUrl: string;
  readonly appEnv: z.infer<typeof appEnvironmentSchema>;
  readonly appUrl: string;
  readonly nodeEnv: z.infer<typeof nodeEnvironmentSchema>;
}

export interface ServerConfig {
  readonly appEnv: z.infer<typeof appEnvironmentSchema>;
  readonly databasePoolMax: number;
  readonly databaseSsl: boolean;
  readonly databaseUrl: string;
  readonly logLevel: z.infer<typeof logLevelSchema>;
  readonly logPretty: boolean;
  readonly nodeEnv: z.infer<typeof nodeEnvironmentSchema>;
  readonly redisUrl: string;
}

export interface ApiConfig extends ServerConfig {
  readonly arcjet: {
    readonly key: string;
    readonly mode: z.infer<typeof arcjetModeSchema>;
  };
  readonly apiPort: number;
  readonly appUrl: string;
  readonly bullmqPrefix: string;
  readonly ffprobePath: string;
  readonly fileRetentionDays: number;
  readonly maxUploadBytes: number;
  readonly maxVideoDurationSeconds: number;
  readonly storageDriver: "local";
  readonly storageRoot: string;
  readonly stripe: {
    readonly cancelUrl: string;
    readonly priceIds: {
      readonly creator: string;
      readonly pro: string;
      readonly starter: string;
    };
    readonly secretKey: string;
    readonly successUrl: string;
    readonly webhookSecret: string;
  };
}

export interface AuthConfig {
  readonly appEnv: z.infer<typeof appEnvironmentSchema>;
  readonly appUrl: string;
  readonly databasePoolMax: number;
  readonly databaseSsl: boolean;
  readonly databaseUrl: string;
  readonly nodeEnv: z.infer<typeof nodeEnvironmentSchema>;
  readonly secret: string;
  readonly trustedOrigins: readonly string[];
  readonly url: string;
}

export type WorkerConfig = ServerConfig;

export class ConfigValidationError extends Error {
  public constructor(scope: string, issues: readonly z.core.$ZodIssue[]) {
    const invalidKeys = [...new Set(issues.map((issue) => issue.path.join(".") || "environment"))];
    super(`Invalid ${scope} configuration: ${invalidKeys.join(", ")}.`);
    this.name = "ConfigValidationError";
  }
}

let environmentLoaded = false;

function loadWorkspaceEnvironment(): void {
  if (environmentLoaded) {
    return;
  }

  const candidates = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")];
  const environmentFile = candidates.find((candidate) => existsSync(candidate));

  if (environmentFile) {
    loadDotEnv({ path: environmentFile, override: false, quiet: true });
  }

  environmentLoaded = true;
}

function environmentSource(environment?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (environment) {
    return environment;
  }

  loadWorkspaceEnvironment();
  return process.env;
}

function workspaceRoot(): string {
  const candidates = [process.cwd(), resolve(process.cwd(), ".."), resolve(process.cwd(), "../..")];
  return (
    candidates.find((candidate) => existsSync(resolve(candidate, "pnpm-workspace.yaml"))) ??
    process.cwd()
  );
}

function resolveStorageRoot(storageRoot: string): string {
  return isAbsolute(storageRoot) ? storageRoot : resolve(workspaceRoot(), storageRoot);
}

function parseEnvironment<TSchema extends z.ZodType>(
  schema: TSchema,
  scope: string,
  environment?: NodeJS.ProcessEnv,
): z.output<TSchema> {
  const result = schema.safeParse(environmentSource(environment));

  if (!result.success) {
    throw new ConfigValidationError(scope, result.error.issues);
  }

  return result.data;
}

export function loadWebConfig(environment?: NodeJS.ProcessEnv): WebConfig {
  const parsed = parseEnvironment(webEnvironmentSchema, "web", environment);

  return {
    apiUrl: parsed.NEXT_PUBLIC_API_URL,
    appEnv: parsed.APP_ENV,
    appUrl: parsed.APP_URL,
    nodeEnv: parsed.NODE_ENV,
  };
}

export function loadApiConfig(environment?: NodeJS.ProcessEnv): ApiConfig {
  const parsed = parseEnvironment(apiEnvironmentSchema, "API", environment);

  return {
    arcjet: {
      key: parsed.ARCJET_KEY,
      mode: parsed.ARCJET_MODE,
    },
    apiPort: parsed.API_PORT,
    appEnv: parsed.APP_ENV,
    appUrl: parsed.APP_URL,
    bullmqPrefix: parsed.BULLMQ_PREFIX,
    databasePoolMax: parsed.DATABASE_POOL_MAX,
    databaseSsl: parsed.DATABASE_SSL,
    databaseUrl: parsed.DATABASE_URL,
    ffprobePath: parsed.FFPROBE_PATH,
    fileRetentionDays: parsed.FILE_RETENTION_DAYS,
    logLevel: parsed.LOG_LEVEL,
    logPretty: parsed.LOG_PRETTY,
    maxUploadBytes: parsed.MAX_UPLOAD_BYTES,
    maxVideoDurationSeconds: parsed.MAX_VIDEO_DURATION_SECONDS,
    nodeEnv: parsed.NODE_ENV,
    redisUrl: parsed.REDIS_URL,
    storageDriver: parsed.STORAGE_DRIVER,
    storageRoot: resolveStorageRoot(parsed.STORAGE_ROOT),
    stripe: {
      cancelUrl: parsed.STRIPE_CANCEL_URL,
      priceIds: {
        creator: parsed.STRIPE_CREATOR_PRICE_ID,
        pro: parsed.STRIPE_PRO_PRICE_ID,
        starter: parsed.STRIPE_STARTER_PRICE_ID,
      },
      secretKey: parsed.STRIPE_SECRET_KEY,
      successUrl: parsed.STRIPE_SUCCESS_URL,
      webhookSecret: parsed.STRIPE_WEBHOOK_SECRET,
    },
  };
}

export function loadAuthConfig(environment?: NodeJS.ProcessEnv): AuthConfig {
  const parsed = parseEnvironment(authEnvironmentSchema, "authentication", environment);
  const trustedOrigins = parsed.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0) ?? [parsed.APP_URL];

  return {
    appEnv: parsed.APP_ENV,
    appUrl: parsed.APP_URL,
    databasePoolMax: parsed.DATABASE_POOL_MAX,
    databaseSsl: parsed.DATABASE_SSL,
    databaseUrl: parsed.DATABASE_URL,
    nodeEnv: parsed.NODE_ENV,
    secret: parsed.BETTER_AUTH_SECRET,
    trustedOrigins,
    url: parsed.BETTER_AUTH_URL,
  };
}

export function loadWorkerConfig(environment?: NodeJS.ProcessEnv): WorkerConfig {
  const parsed = parseEnvironment(serverEnvironmentSchema, "worker", environment);

  return {
    appEnv: parsed.APP_ENV,
    databasePoolMax: parsed.DATABASE_POOL_MAX,
    databaseSsl: parsed.DATABASE_SSL,
    databaseUrl: parsed.DATABASE_URL,
    logLevel: parsed.LOG_LEVEL,
    logPretty: parsed.LOG_PRETTY,
    nodeEnv: parsed.NODE_ENV,
    redisUrl: parsed.REDIS_URL,
  };
}
