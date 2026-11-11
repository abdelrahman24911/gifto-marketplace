import { test, expect } from "./fixtures";

/**
 * The shared Playwright harness is read-only and points at hosted Supabase.
 * Phase 2A admin writes are covered by Vitest; this spec only checks the
 * signed-out auth boundary and runs only against a local build that includes
 * the occasions routes.
 */
const ENABLED = process.env.PLAYWRIGHT_ADMIN_OCCASIONS === "1";

test.describe("admin occasion routes", () => {
  test.skip(
    !ENABLED,
    "Set PLAYWRIGHT_ADMIN_OCCASIONS=1 and PLAYWRIGHT_BASE_URL to a local build with the Phase 2A routes.",
  );

  test("the occasion list stays behind admin sign-in", async ({ page }) => {
    await page.goto("/admin/occasions");

    await expect(page).toHaveURL(/\/login/);
  });

  test("the new-occasion form stays behind admin sign-in", async ({ page }) => {
    await page.goto("/admin/occasions/new");

    await expect(page).toHaveURL(/\/login/);
  });

  test("an unknown occasion edit id stays behind admin sign-in", async ({
    page,
  }) => {
    await page.goto(
      "/admin/occasions/11111111-1111-4111-8111-111111111111/edit",
    );

    await expect(page).toHaveURL(/\/login/);
  });
});
