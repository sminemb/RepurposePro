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

const databaseUrl = process.env.DATABASE_BOOTSTRAP_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_BOOTSTRAP_URL is required for an existing-volume bootstrap upgrade.");
}

if (["repurposepro_owner", "repurposepro_runtime"].includes(new URL(databaseUrl).username)) {
  throw new Error("DATABASE_BOOTSTRAP_URL must use a role separate from owner and runtime.");
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
