import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadDotEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

const environmentFile = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")].find(
  (candidate) => existsSync(candidate),
);

if (environmentFile) {
  loadDotEnv({ path: environmentFile, override: false, quiet: true });
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run Drizzle commands.");
}

export default defineConfig({
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  out: "./drizzle",
  schema: "./src/schema/index.ts",
  strict: true,
  verbose: true,
});
