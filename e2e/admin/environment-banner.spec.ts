import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { readLocalSupabaseEnv } from "./local-supabase.mjs";

const ARTIFACTS = path.join(process.cwd(), "test-results", "browser-pass");
const NEXT_BIN = path.join(
  process.cwd(),
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);

const servers: ChildProcess[] = [];

function startNextServer(port: number, environment: string): ChildProcess {
  const local = readLocalSupabaseEnv();
  const origin = `http://127.0.0.1:${port}`;

  const child = spawn(
    process.execPath,
    [NEXT_BIN, "start", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: local.apiUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: local.anonKey,
        SUPABASE_SERVICE_ROLE_KEY: local.serviceRoleKey,
        NEXT_PUBLIC_SITE_URL: origin,
        NEXT_TELEMETRY_DISABLED: "1",
        GIFTO_ENVIRONMENT: environment,
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );

  servers.push(child);
  return child;
}

async function waitForServer(origin: string): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The Next server at ${origin} did not become ready.`);
}

function stopServers(): void {
  for (const child of servers.splice(0)) {
    if (child.pid === undefined || child.exitCode !== null) continue;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      child.kill("SIGTERM");
    }
  }
}

function artifact(name: string): string {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  return path.join(ARTIFACTS, name);
}

const DEMO = "http://127.0.0.1:3201";
const STAGING = "http://127.0.0.1:3202";
const PRODUCTION = "http://127.0.0.1:3203";

test.describe("environment banner", () => {
  test.beforeAll(async () => {
    startNextServer(3201, "demo");
    startNextServer(3202, "staging");
    startNextServer(3203, "production");
    await Promise.all([
      waitForServer(DEMO),
      waitForServer(STAGING),
      waitForServer(PRODUCTION),
    ]);
  });

  test.afterAll(() => {
    stopServers();
  });

  test("demo deployments show the amber banner on every page", async ({
    page,
  }) => {
    await page.goto(DEMO);
    const banner = page.locator('[data-environment="demo"]');

    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("role", "status");
    await expect(banner).toContainText(
      "Demo environment — demo data only. No real orders, payments or emails.",
    );
    await expect(banner).toHaveClass(/bg-amber-200/);
    await expect(banner).toHaveClass(/font-semibold/);

    const box = await banner.boundingBox();
    expect(box, "the banner must render a box").not.toBeNull();
    expect(box!.y).toBeLessThanOrEqual(1);
    expect(box!.width).toBeGreaterThan(1_200);
    await page.screenshot({
      path: artifact("environment-banner-demo.png"),
      fullPage: false,
    });

    await page.goto(`${DEMO}/shops`);
    await expect(page.locator('[data-environment="demo"]')).toBeVisible();
  });

  test("staging deployments show the sky banner on every page", async ({
    page,
  }) => {
    await page.goto(STAGING);
    const banner = page.locator('[data-environment="staging"]');

    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("role", "status");
    await expect(banner).toContainText(
      "Staging environment — test data only. Nothing here is real.",
    );
    await expect(banner).toHaveClass(/bg-sky-200/);
    await expect(banner).toHaveClass(/font-semibold/);
    await page.screenshot({
      path: artifact("environment-banner-staging.png"),
      fullPage: false,
    });

    await page.goto(`${STAGING}/shops`);
    await expect(page.locator('[data-environment="staging"]')).toBeVisible();
  });

  test("production and development deployments render no banner", async ({
    page,
  }) => {
    const productionResponse = await page.goto(PRODUCTION);
    expect(productionResponse?.status()).toBe(200);
    await expect(
      page.locator('[data-environment="production"]'),
      "production must never be labelled as a test environment",
    ).toHaveCount(0);
    await expect(page.locator("[data-environment]")).toHaveCount(0);

    await page.goto("/");
    await expect(
      page.locator("[data-environment]"),
      "local development must not show a banner either",
    ).toHaveCount(0);
  });
});
