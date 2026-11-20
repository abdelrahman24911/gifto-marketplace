import { devices, expect, test, type Page } from "@playwright/test";

import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_VENDOR_EMAIL,
  E2E_VENDOR_PASSWORD,
} from "./fixture-admin";

/**
 * The vendor and admin dashboards share one shell (mobile drawer nav, sticky
 * header, paginated lists, scrolling tables). The storefront already has a
 * mobile overflow check (tests/search-overflow.spec.ts); this lane covers the
 * dashboards the same way, at a Pixel 7 viewport, signed in as the E2E admin
 * and as the E2E vendor owner.
 *
 * Runs in the local-admin lane only (local Supabase + dev server); it cannot
 * run against the hosted project. It is listed by the default Playwright
 * config too (R-09, `local-admin` project in playwright.config.ts) so the
 * default `npx playwright test --list` finds it — execute it with
 * `npm run test:e2e:admin`, which seeds the admin/vendor users.
 */

const MOBILE = { ...devices["Pixel 7"] };

// The whole file runs at a phone viewport; test.use with a device must be
// top-level (it carries defaultBrowserType, which cannot live in a describe).
test.use(MOBILE);

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await Promise.all([
    page.waitForURL(/\/account$/),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
}

async function assertNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));

  expect(
    dimensions.documentScrollWidth - dimensions.clientWidth,
    "document should not scroll horizontally",
  ).toBeLessThanOrEqual(1);
  expect(
    dimensions.bodyScrollWidth - dimensions.clientWidth,
    "body should not scroll horizontally",
  ).toBeLessThanOrEqual(1);
}

async function openDashboard(page: Page, path: string) {
  await page.goto(path);
  // The loading skeletons carry no h1, so this proves the real page rendered.
  await expect(page.locator("#dashboard-main h1").first()).toBeVisible();
  await assertNoHorizontalOverflow(page);
}

test.describe("admin dashboard on a phone viewport", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
  });

  const paths = [
    "/admin",
    "/admin/orders",
    "/admin/products",
    "/admin/shops",
    "/admin/settlements",
    "/admin/refunds",
    "/admin/logistics",
    "/admin/reviews",
    "/admin/analytics",
    "/admin/occasions",
    "/admin/categories",
  ];

  for (const path of paths) {
    test(`${path} has no horizontal overflow`, async ({ page }) => {
      await openDashboard(page, path);
    });
  }

  test("the mobile navigation opens and navigates", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator("#dashboard-main h1").first()).toBeVisible();

    await page
      .getByRole("button", { name: "Open dashboard navigation" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Admin navigation" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("link", { name: "Orders", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/orders/);
    await expect(dialog).toBeHidden();
    await assertNoHorizontalOverflow(page);
  });
});

test.describe("vendor dashboard on a phone viewport", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, E2E_VENDOR_EMAIL, E2E_VENDOR_PASSWORD);
  });

  const paths = [
    "/vendor",
    "/vendor/overview",
    "/vendor/orders",
    "/vendor/products",
    "/vendor/finance",
    "/vendor/refunds",
    "/vendor/inventory",
    "/vendor/analytics",
    "/vendor/settings",
    "/vendor/support",
  ];

  for (const path of paths) {
    test(`${path} has no horizontal overflow`, async ({ page }) => {
      await openDashboard(page, path);
    });
  }

  test("the mobile navigation opens and navigates", async ({ page }) => {
    await page.goto("/vendor/overview");
    await expect(page.locator("#dashboard-main h1").first()).toBeVisible();

    await page
      .getByRole("button", { name: "Open dashboard navigation" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Shop navigation" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("link", { name: "Orders", exact: true }).click();
    await expect(page).toHaveURL(/\/vendor\/orders/);
    await expect(dialog).toBeHidden();
    await assertNoHorizontalOverflow(page);
  });
});
