import { defineConfig, devices } from "@playwright/test";

const port = process.env.E2E_PORT ?? "3100";
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const parsedBaseUrl = new URL(baseURL);
const localHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

if (
  parsedBaseUrl.protocol !== "http:" &&
  parsedBaseUrl.protocol !== "https:"
) {
  throw new Error(
    `Refusing to run the admin E2E lane with unsupported base URL protocol "${parsedBaseUrl.protocol}".`,
  );
}

if (!localHosts.has(parsedBaseUrl.hostname)) {
  throw new Error(
    `Refusing to run the admin E2E lane against non-local base URL host "${parsedBaseUrl.hostname}".`,
  );
}

export default defineConfig({
  testDir: "./e2e/admin",
  outputDir: "test-results/admin-e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  globalSetup: "./e2e/admin/global-setup.ts",
  globalTeardown: "./e2e/admin/global-teardown.ts",
  reporter: [
    ["list"],
    [
      "html",
      { outputFolder: "playwright-report/admin-e2e", open: "never" },
    ],
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
  webServer: {
    command: "node e2e/admin/start-server.mjs",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 240_000,
  },
  projects: [
    {
      name: "local-admin",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
