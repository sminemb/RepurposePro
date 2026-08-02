import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { loadAuthConfig } from "@repurposepro/config";
import { createDatabaseClient, schema } from "@repurposepro/db";
import { betterAuth } from "better-auth";

import { resolveAuthCookieConfiguration } from "./auth-cookie";

const config = loadAuthConfig();
const cookieConfiguration = resolveAuthCookieConfiguration(config.appUrl, config.apiUrl);
const database = createDatabaseClient({
  connectionString: config.databaseUrl,
  poolMax: config.databasePoolMax,
  ssl: config.databaseSsl,
});

export const auth = betterAuth({
  ...(cookieConfiguration ? { advanced: cookieConfiguration } : {}),
  baseURL: config.url,
  database: drizzleAdapter(database.db, {
    provider: "pg",
    schema,
    transaction: true,
    usePlural: true,
  }),
  emailAndPassword: { enabled: true },
  secret: config.secret,
  trustedOrigins: [...config.trustedOrigins],
});
