import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

const nodeEnvironmentSchema = z.enum(["development", "test", "production"]);
const appEnvironmentSchema = z.enum(["local", "development", "staging", "production", "test"]);
const logLevelSchema = z.enum(["debug", "info", "warn", "error"]);

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

const webEnvironmentSchema = z.object({
  NODE_ENV: nodeEnvironmentSchema,
  APP_ENV: appEnvironmentSchema,
  APP_URL: z.string().url(),
  NEXT_PUBLIC_API_URL: z.string().url(),
});

const serverEnvironmentSchema = z.object({
  NODE_ENV: nodeEnvironmentSchema,
  APP_ENV: appEnvironmentSchema,
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100),
  DATABASE_SSL: booleanFromEnvironment,
  REDIS_URL: z.string().min(1),
  LOG_LEVEL: logLevelSchema,
  LOG_PRETTY: booleanFromEnvironment,
});

const apiEnvironmentSchema = serverEnvironmentSchema.extend({
  APP_URL: z.string().url(),
  API_PORT: z.coerce.number().int().min(1).max(65_535),
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
  readonly apiPort: number;
  readonly appUrl: string;
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
    apiPort: parsed.API_PORT,
    appEnv: parsed.APP_ENV,
    appUrl: parsed.APP_URL,
    databasePoolMax: parsed.DATABASE_POOL_MAX,
    databaseSsl: parsed.DATABASE_SSL,
    databaseUrl: parsed.DATABASE_URL,
    logLevel: parsed.LOG_LEVEL,
    logPretty: parsed.LOG_PRETTY,
    nodeEnv: parsed.NODE_ENV,
    redisUrl: parsed.REDIS_URL,
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
