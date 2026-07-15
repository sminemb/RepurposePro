import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadDotEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

const environmentFile = [
  resolve(process.cwd(), ".env.database"),
  resolve(process.cwd(), "../../.env.database"),
].find((candidate) => existsSync(candidate));

if (environmentFile) {
  loadDotEnv({ path: environmentFile, override: false, quiet: true });
}

const databaseUrl = process.env.DATABASE_MIGRATION_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_MIGRATION_URL is required to run Drizzle commands.");
}

if (new URL(databaseUrl).username !== "repurposepro_owner") {
  throw new Error("DATABASE_MIGRATION_URL must use the repurposepro_owner migration role.");
}

export default defineConfig({
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  out: "./drizzle",
  schema: "./src/schema/index.ts",
  strict: true,
  verbose: true,
});
