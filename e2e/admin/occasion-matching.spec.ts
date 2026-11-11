import { expect, test, type Page } from "@playwright/test";

import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_PICKER_PRODUCT_NAMES,
  E2E_TAG_NAMES,
  FIXTURE_ID,
  FIXTURE_NAME,
  PICKER_CATEGORY_FLOWERS,
  resetFixture,
  resetTaggingFixture,
} from "./fixture-admin";

const EDIT_PATH = `/admin/occasions/${FIXTURE_ID}/edit`;

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(E2E_ADMIN_EMAIL);
  await page.locator('input[name="password"]').fill(E2E_ADMIN_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/account$/),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
}

async function openFixture(page: Page) {
  await page.goto("/admin/occasions");
  await page.getByRole("link", { name: `Edit ${FIXTURE_NAME}` }).click();
  await expect(page).toHaveURL(new RegExp(`${EDIT_PATH}$`));
  await expect(
    page.getByRole("heading", { level: 2, name: "Matching rules" }),
  ).toBeVisible();
}

function preview(page: Page) {
  return page.getByRole("region", { name: "Public collection preview" });
}

test.beforeEach(async ({ page }) => {
  await resetTaggingFixture();
  await resetFixture({ matchMode: "automatic" });
  await loginAsAdmin(page);
});

test("saves category and tag rules and refreshes the storefront preview", async ({
  page,
}) => {
  await openFixture(page);
  const collectionPreview = preview(page);

  await expect(
    page.getByText(
      "Automatic mode uses category and tag matches only. Manual picks stay saved but are not currently included in the public collection.",
    ),
  ).toBeVisible();
  await expect(
    collectionPreview.getByText(
      "No products match yet. Add manual picks or choose active category and tag rules.",
    ),
  ).toBeVisible();

  await page
    .getByRole("checkbox", { name: "E2E Picker Flowers" })
    .check();
  await page.getByRole("checkbox", { name: E2E_TAG_NAMES.thoughtful }).check();
  await page.getByRole("button", { name: "Save matching rules" }).click();

  await expect(
    page.getByText("Matching rules saved: 1 category and 1 tag."),
  ).toBeVisible();
  await expect(
    collectionPreview.getByText("7 products", { exact: true }),
  ).toBeVisible();
  await expect(
    collectionPreview.getByText(E2E_PICKER_PRODUCT_NAMES.rose),
  ).toBeVisible();
  await expect(
    collectionPreview.getByText(E2E_PICKER_PRODUCT_NAMES.hamper),
  ).toBeVisible();
  await expect(
    collectionPreview.getByText("Automatic match").first(),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "E2E Picker Flowers" }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: E2E_TAG_NAMES.thoughtful }),
  ).toBeChecked();
  await expect(
    preview(page).getByText(E2E_PICKER_PRODUCT_NAMES.rose),
  ).toBeVisible();
});

test("guards unsaved rule changes and discards them", async ({ page }) => {
  await openFixture(page);
  const category = page.getByRole("checkbox", {
    name: "E2E Picker Flowers",
  });

  await category.check();
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "Occasions" })
    .click();

  const dialog = page.getByRole("alertdialog", { name: "Leave without saving?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(page).toHaveURL(new RegExp(`${EDIT_PATH}$`));

  await page.getByRole("button", { name: "Discard rule changes" }).click();
  await expect(category).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Discard rule changes" }),
  ).toBeDisabled();
});

test("matches seeded category fixture when the rules are preconfigured", async ({
  page,
}) => {
  await resetFixture({
    matchMode: "hybrid",
    categoryIds: [PICKER_CATEGORY_FLOWERS],
  });
  await openFixture(page);

  await expect(
    page.getByRole("checkbox", { name: "E2E Picker Flowers" }),
  ).toBeChecked();
  await expect(
    preview(page).getByText(E2E_PICKER_PRODUCT_NAMES.rose),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Hybrid mode places manual picks first, then adds matching products from these categories and tags. A product matched more than once appears only once.",
    ),
  ).toBeVisible();
});
