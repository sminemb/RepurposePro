import eslint from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/next-env.d.ts",
      "packages/db/drizzle/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.{ts,tsx}"],
  })),
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "*.ts",
            "scripts/*.ts",
            "packages/db/*.ts",
            "apps/api/src/modules/auth/*.spec.ts",
            "apps/api/src/modules/health/*.spec.ts",
            "apps/api/src/modules/projects/*.spec.ts",
            "packages/config/src/*.spec.ts",
            "packages/shared/src/*.spec.ts",
          ],
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 12,
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: ["apps/api/src/modules/billing/*.spec.ts", "apps/api/src/modules/storage/*.spec.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./apps/api/tsconfig.eslint.json"],
        projectService: false,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["packages/db/scripts/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./packages/db/tsconfig.scripts.json"],
        projectService: false,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["packages/db/*.config.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./packages/db/tsconfig.config.json"],
        projectService: false,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
    },
    settings: {
      next: {
        rootDir: "apps/web/",
      },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
  {
    files: ["**/*.config.{js,mjs,ts}", "eslint.config.mjs"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },
);
