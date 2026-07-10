import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      reporter: ["text", "json", "html"],
    },
    environment: "node",
    include: ["apps/**/*.spec.ts", "packages/**/*.spec.ts"],
    passWithNoTests: false,
  },
});
