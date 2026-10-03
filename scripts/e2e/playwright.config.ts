import { defineConfig } from "@playwright/test";
import { join } from "node:path";

if (!process.env.E2E_RUN_ROOT) throw new Error("Run browser tests through pnpm test:e2e.");

export default defineConfig({
  testDir: ".",
  testMatch: "*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  outputDir: join(process.env.E2E_RUN_ROOT, "test-results"),
  reporter: [
    ["list"],
    ["html", { outputFolder: join(process.env.E2E_RUN_ROOT, "report"), open: "never" }],
  ],
  use: {
    browserName: "chromium",
    baseURL: process.env.E2E_APP_URL,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
