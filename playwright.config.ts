import fs from "node:fs";

import { defineConfig, devices } from "@playwright/test";

import {
  assertLocalE2ETarget,
  isLocalE2EHost,
} from "./tests/assert-local-e2e-target";

const DEFAULT_PORT = "3100";

function resolveBaseUrl(): { baseURL: string; explicit: boolean } {
  const configured = process.env.PLAYWRIGHT_BASE_URL?.trim();
  const baseURL =
    configured || `http://127.0.0.1:${process.env.E2E_PORT ?? DEFAULT_PORT}`;

  let parsed: URL;
  try {
    parsed = new URL(baseURL);
  } catch {
    throw new Error(
      `PLAYWRIGHT_BASE_URL must be a valid absolute URL, received "${baseURL}".`,
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Refusing to run E2E tests with unsupported protocol "${parsed.protocol}".`,
    );
  }

  if (!isLocalE2EHost(parsed.hostname)) {
    throw new Error(
      `Refusing to run E2E tests against non-local host "${parsed.hostname}". ` +
        "Set PLAYWRIGHT_BASE_URL to a local Gifto server (for example http://127.0.0.1:3100).",
    );
  }

  if (parsed.username || parsed.password) {
    throw new Error("PLAYWRIGHT_BASE_URL must not contain credentials.");
  }

  return { baseURL: parsed.origin, explicit: Boolean(configured) };
}

function loadLocalPublicEnv() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) return;

  try {
    const env = fs.readFileSync(".env.local", "utf8");
    const match = env.match(
      /^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+?)\s*$/m,
    );
    if (match) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = match[1].replace(
        /^["']|["']$/g,
        "",
      );
    }
  } catch {
    // The CSP origin assertion reports a missing value when no local env exists.
  }
}

loadLocalPublicEnv();

assertLocalE2ETarget(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);

const { baseURL, explicit } = resolveBaseUrl();

export default defineConfig({
  testDir: "./tests",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: 2,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  globalSetup: "./tests/global-setup.ts",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  use: {
    baseURL,
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  webServer: explicit
    ? undefined
    : {
        command: "node tests/start-server.mjs",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 240_000,
      },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /read-only-guard\.spec\.ts/,
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 7"] },
      testIgnore: /read-only-guard\.spec\.ts/,
    },
    {
      name: "local-guard",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /read-only-guard\.spec\.ts/,
    },
    // R-09: the e2e/admin specs (including dashboard-mobile) are NOT
    // projects here. They need the admin lane's seeded local Supabase
    // stack (e2e/admin/global-setup.ts); the default lane's global
    // setup does not seed admin/vendor users, so listing them here
    // made a full default run fail at login, and running both lanes
    // executed dashboard-mobile twice. They run once, seeded, under
    // `npm run test:e2e:admin` (playwright.admin.config.ts), and
    // `npm run test:e2e:list` lists both configs.
  ],
});
