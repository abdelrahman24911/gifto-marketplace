import { expect, test, type Page } from "@playwright/test";

import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_PICKER_PRODUCT_NAMES,
  FIXTURE_ID,
  FIXTURE_NAME,
  FIXTURE_SLUG,
  PICKER_CATEGORY_FLOWERS,
  resetFixture,
} from "./fixture-admin";

const PUBLIC_PATH = `/occasions/${FIXTURE_SLUG}`;

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(E2E_ADMIN_EMAIL);
  await page.locator('input[name="password"]').fill(E2E_ADMIN_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/account$/),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
}

async function expectNotFound(page: Page) {
  await expect(
    page.getByRole("heading", { level: 1, name: "This gift isn't here" }),
  ).toBeVisible();
}

test("creates and publishes an active occasion on the listing, home and detail page", async ({
  page,
}) => {
  await loginAsAdmin(page);

  await page.goto("/admin/occasions");
  await page.getByRole("button", { name: `Delete ${FIXTURE_NAME}` }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(
    page.getByRole("button", { name: `Delete ${FIXTURE_NAME}` }),
  ).toHaveCount(0);

  await page.goto("/admin/occasions/new");
  await page.locator('input[name="name"]').fill(FIXTURE_NAME);
  await page.locator('input[name="slug"]').fill(FIXTURE_SLUG);
  await page
    .locator('textarea[name="description"]')
    .fill("Temporary occasion used by the local admin E2E lane.");
  await page.getByRole("checkbox", { name: "Publish this occasion" }).check();
  await page.getByRole("button", { name: "Create occasion" }).click();
  await expect(page.getByRole("status")).toContainText(
    "was created and published",
  );

  await page.goto("/occasions");
  await expect(
    page.getByRole("heading", { level: 1, name: "Shop by occasion" }),
  ).toBeVisible();
  await expect(page.locator(`a[href="${PUBLIC_PATH}"]`)).toBeVisible();

  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 2, name: "Shop by occasion" }),
  ).toBeVisible();
  await expect(page.locator(`a[href="${PUBLIC_PATH}"]`).first()).toBeVisible();

  await page.goto(PUBLIC_PATH);
  await expect(
    page.getByRole("heading", { level: 1, name: FIXTURE_NAME }),
  ).toBeVisible();
  await expect(page.getByText("No gifts here yet").first()).toBeVisible();
});

test("filters occasions instantly and recovers from an empty search", async ({
  page,
}) => {
  await resetFixture({ isActive: true, sortOrder: 0 });
  await page.goto("/occasions");

  const search = page.getByRole("searchbox", { name: "Search occasions" });
  await expect(search).toBeVisible();
  await expect(page.locator(`a[href="${PUBLIC_PATH}"]`)).toBeVisible();

  await search.fill(FIXTURE_NAME);
  await expect(page.locator(`a[href="${PUBLIC_PATH}"]`)).toBeVisible();

  await search.fill("zzzz-no-occasion");
  await expect(page.getByText(/No occasions match/)).toBeVisible();
  await expect(page.locator(`a[href="${PUBLIC_PATH}"]`)).toHaveCount(0);

  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(page.locator(`a[href="${PUBLIC_PATH}"]`)).toBeVisible();
});

test("keeps a hidden occasion off the storefront", async ({ page }) => {
  await resetFixture({ isActive: false });
  await loginAsAdmin(page);

  await page.goto(`/admin/occasions/${FIXTURE_ID}/edit`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText("was saved");

  await page.goto("/occasions");
  await expect(
    page.getByRole("heading", { level: 1, name: "Shop by occasion" }),
  ).toBeVisible();
  await expect(page.locator(`a[href="${PUBLIC_PATH}"]`)).toHaveCount(0);

  await page.goto(PUBLIC_PATH);
  await expectNotFound(page);
});

test("shows matching products inside a published occasion", async ({ page }) => {
  await resetFixture({
    isActive: true,
    sortOrder: 0,
    matchMode: "hybrid",
    categoryIds: [PICKER_CATEGORY_FLOWERS],
  });

  await page.goto(PUBLIC_PATH);

  await expect(
    page.getByText(E2E_PICKER_PRODUCT_NAMES.rose),
  ).toBeVisible();
  await expect(
    page.getByText(E2E_PICKER_PRODUCT_NAMES.tulip),
  ).toBeVisible();
  await expect(
    page.getByText(E2E_PICKER_PRODUCT_NAMES.draft),
  ).toHaveCount(0);
  await expect(
    page.getByText(E2E_PICKER_PRODUCT_NAMES.paused, { exact: true }),
  ).toBeVisible();
});

test("removes a hidden occasion from the storefront after the admin hides it", async ({
  page,
}) => {
  await resetFixture({ isActive: true, sortOrder: 0 });
  await loginAsAdmin(page);

  await page.goto("/admin/occasions");
  await page.getByRole("button", { name: `Hide ${FIXTURE_NAME}` }).click();
  await expect(
    page.getByRole("button", { name: `Publish ${FIXTURE_NAME}` }),
  ).toBeVisible();

  await page.goto("/occasions");
  await expect(
    page.getByRole("heading", { level: 1, name: "Shop by occasion" }),
  ).toBeVisible();
  await expect(page.locator(`a[href="${PUBLIC_PATH}"]`)).toHaveCount(0);

  await page.goto(PUBLIC_PATH);
  await expectNotFound(page);
});
