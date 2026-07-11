import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { loadAuthConfig } from "@repurposepro/config";
import { createDatabaseClient, schema } from "@repurposepro/db";
import { betterAuth } from "better-auth";

const config = loadAuthConfig();
const database = createDatabaseClient({
  connectionString: config.databaseUrl,
  poolMax: config.databasePoolMax,
  ssl: config.databaseSsl,
});

export const auth = betterAuth({
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
