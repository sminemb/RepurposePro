import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { loadAuthConfig, loadTransactionalEmailConfig } from "@repurposepro/config";
import { createDatabaseClient, schema } from "@repurposepro/db";
import { betterAuth } from "better-auth";

import { createAccountSettingsOptions } from "@/features/settings/server/account-settings-auth";
import { createTransactionalEmailSender } from "@/features/settings/server/transactional-email";

import { resolveAuthCookieConfiguration } from "./auth-cookie";

const config = loadAuthConfig();
const emailConfig = loadTransactionalEmailConfig();
export const transactionalEmailConfigured = emailConfig !== null;
const cookieConfiguration = resolveAuthCookieConfiguration(config.appUrl, config.apiUrl);
const database = createDatabaseClient({
  connectionString: config.databaseUrl,
  poolMax: config.databasePoolMax,
  ssl: config.databaseSsl,
});

export const auth = betterAuth({
  ...createAccountSettingsOptions(
    createTransactionalEmailSender(emailConfig),
    transactionalEmailConfigured,
  ),
  ...(cookieConfiguration ? { advanced: cookieConfiguration } : {}),
  baseURL: config.url,
  database: drizzleAdapter(database.db, {
    provider: "pg",
    schema,
    transaction: true,
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  logger: { disabled: true },
  secret: config.secret,
  trustedOrigins: [...config.trustedOrigins],
});
