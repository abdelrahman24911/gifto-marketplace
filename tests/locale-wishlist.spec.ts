import { test, expect, type Page } from "./fixtures";

const SAVED_ITEM = {
  productId: "e2e-wishlist-product",
  vendorId: "e2e-wishlist-vendor",
  vendorName: "E2E Gift Shop",
  vendorSlug: "e2e-gift-shop",
  name: "E2E Gift Box",
  slug: "e2e-gift-box",
  priceMinor: 12500,
  imagePath: null,
  stock: 5,
};

async function waitForHydration(page: Page, selector: string) {
  await page.waitForFunction(
    (target) => {
      const element = document.querySelector(target);
      if (!element) return false;

      return Object.keys(element).some(
        (key) =>
          key.startsWith("__reactFiber$") || key.startsWith("__reactProps$"),
      );
    },
    selector,
    { timeout: 15_000 },
  );
}

test("the wishlist opens in both locales and the Arabic switch needs no refresh", async ({
  page,
}) => {
  await page.addInitScript((item) => {
    window.localStorage.setItem("gifto.wishlist.v1", JSON.stringify([item]));
  }, SAVED_ITEM);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForHydration(page, 'header a[href="/wishlist"]');

  const wishlistLink = page.locator('header a[href="/wishlist"]').first();
  await expect(wishlistLink).toBeVisible();
  await expect(wishlistLink).toHaveAttribute("aria-label", "Wishlist, 1 item");
  await wishlistLink.click();

  await expect(page).toHaveURL(/\/wishlist$/);
  await expect(
    page.getByRole("heading", { name: "Your wishlist" }),
  ).toBeVisible();
  await expect(page.getByText(SAVED_ITEM.name, { exact: true })).toBeVisible();

  await waitForHydration(page, 'a[aria-label="Language: العربية"]');
  await page.locator('a[aria-label="Language: العربية"]').first().click();

  await expect(page).toHaveURL(/\/ar\/wishlist$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { name: "قائمة أمنياتك" }),
  ).toBeVisible();
  await expect(page.getByText(SAVED_ITEM.name, { exact: true })).toBeVisible();

  await expect(page.locator('header a[href="/ar/wishlist"]').first()).toBeVisible();
  await expect(page.locator('header a[href="/ar/cart"]').first()).toHaveAttribute(
    "aria-label",
    "السلة",
  );
});
