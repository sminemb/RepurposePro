import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import {
  loadAuthConfig,
  loadTransactionalEmailConfig,
  localServicesEnabled,
} from "@repurposepro/config";
import { createDatabaseClient, schema } from "@repurposepro/db";
import { betterAuth } from "better-auth";
import { after } from "next/server";

import { createPasswordResetOptions } from "@/features/auth/server/password-reset";
import { createAccountSettingsOptions } from "@/features/settings/server/account-settings-auth";
import { createTransactionalEmailSender } from "@/features/settings/server/transactional-email";
import { createLocalAccountEmailSender } from "@/features/settings/server/local-account-email";

import { resolveAuthCookieConfiguration } from "./auth-cookie";

const config = loadAuthConfig();
const localServices = localServicesEnabled();
const emailConfig = localServices ? null : loadTransactionalEmailConfig();
const sendAccountEmail = localServices
  ? createLocalAccountEmailSender()
  : createTransactionalEmailSender(emailConfig);
export const transactionalEmailConfigured = localServices || emailConfig !== null;
const cookieConfiguration = resolveAuthCookieConfiguration(config.appUrl, config.apiUrl);
const database = createDatabaseClient({
  connectionString: config.databaseUrl,
  poolMax: config.databasePoolMax,
  ssl: config.databaseSsl,
});

export const auth = betterAuth({
  ...createAccountSettingsOptions(sendAccountEmail, transactionalEmailConfigured, config.appUrl),
  ...(cookieConfiguration ? { advanced: cookieConfiguration } : {}),
  baseURL: config.url,
  database: drizzleAdapter(database.db, {
    provider: "pg",
    schema,
    transaction: true,
    usePlural: true,
  }),
  emailAndPassword: {
    ...createPasswordResetOptions(sendAccountEmail, after),
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  logger: { disabled: true },
  secret: config.secret,
  trustedOrigins: [...config.trustedOrigins],
});
