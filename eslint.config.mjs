import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright QA harness (kept separate from the application lint/typecheck):
    "tests/**",
    "playwright.config.ts",
    "specs/**",
    ".opencode/**",
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
