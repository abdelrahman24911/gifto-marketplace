import { defineConfig, devices } from "@playwright/test";

const PORT = "3100";
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SUPABASE_STUB_PORT = "54329";
const SUPABASE_STUB_URL = `http://127.0.0.1:${SUPABASE_STUB_PORT}`;

// Dedicated, isolated lane for the security-header contract. It builds and
// starts the production server, so it never depends on a dev server, a local
// Supabase stack, or seeded fixtures. A loopback-only stub answers Supabase
// reads with empty results so pages render normally without a database.
export default defineConfig({
  testDir: "./tests",
  testMatch: /security-headers\.spec\.ts/,
  outputDir: "test-results/security-headers",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  globalSetup: "./tests/global-setup.ts",
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/security-headers/results.json" }],
  ],
  use: {
    baseURL: BASE_URL,
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  webServer: [
    {
      command: "node tests/supabase-stub.mjs",
      url: `${SUPABASE_STUB_URL}/rest/v1/`,
      env: { SUPABASE_STUB_PORT },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `npm run start -- -H 127.0.0.1 -p ${PORT}`,
      // A static asset proves the server is up without requiring data access.
      url: `${BASE_URL}/robots.txt`,
      env: {
        NEXT_PUBLIC_SITE_URL: BASE_URL,
        NEXT_PUBLIC_SUPABASE_URL: SUPABASE_STUB_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "ci-placeholder-anon-key",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
