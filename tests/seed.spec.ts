import { test, expect } from "./fixtures";

test.describe("Test group", () => {
  test("seed", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(
      "Gifts in Egypt, wrapped properly — Gifto",
    );
  });
});
