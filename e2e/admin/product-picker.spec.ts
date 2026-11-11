import { expect, test, type Page } from "@playwright/test";

import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_PICKER_PRODUCT_NAMES,
  FIXTURE_ID,
  FIXTURE_NAME,
  resetFixture,
} from "./fixture-admin";

const EDIT_PATH = `/admin/occasions/${FIXTURE_ID}/edit`;

const PICKER = {
  rose: E2E_PICKER_PRODUCT_NAMES.rose,
  tulip: E2E_PICKER_PRODUCT_NAMES.tulip,
  draft: E2E_PICKER_PRODUCT_NAMES.draft,
  paused: E2E_PICKER_PRODUCT_NAMES.paused,
  bulk06: "E2E Picker Bulk 06",
};

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
    page.getByRole("heading", { level: 2, name: "Manually picked products" }),
  ).toBeVisible();
}

function availableRegion(page: Page) {
  return page.getByRole("region", { name: "Available products" });
}

function selectedRegion(page: Page) {
  return page.getByRole("complementary", { name: "Selected products" });
}

function searchForm(page: Page) {
  return page.getByRole("search", { name: "Filter available products" });
}

async function searchProducts(page: Page, term: string) {
  const form = searchForm(page);
  await form.getByLabel("Product name").fill(term);
  await form.getByRole("button", { name: "Apply filters" }).click();
}

async function savedPicks(page: Page) {
  return selectedRegion(page).locator("ol > li");
}

test.beforeEach(async ({ page }) => {
  await resetFixture();
  await loginAsAdmin(page);
});

test("searches, paginates and saves picks in the chosen order", async ({
  page,
}) => {
  await openFixture(page);
  const available = availableRegion(page);
  const selected = selectedRegion(page);

  await searchProducts(page, "E2E Picker");
  await expect(
    available.getByText("13 products match the filters."),
  ).toBeVisible();
  await expect(available.getByText(/Page 1 of 2/)).toBeVisible();

  await available
    .getByRole("button", { name: `Add ${PICKER.bulk06}` })
    .click();
  await expect(
    available.getByRole("button", {
      name: `${PICKER.bulk06} is already selected`,
    }),
  ).toBeDisabled();
  await expect(selected.getByText("1 of 500 selected")).toBeVisible();

  await available.getByRole("button", { name: "Next" }).click();
  await expect(available.getByText(/Page 2 of 2/)).toBeVisible();
  await available.getByRole("button", { name: `Add ${PICKER.rose}` }).click();
  await expect(selected.getByText("2 of 500 selected")).toBeVisible();

  await searchProducts(page, PICKER.rose);
  await expect(available.getByText("1 product match the filters.")).toBeVisible();
  await expect(
    available.getByRole("button", {
      name: `${PICKER.rose} is already selected`,
    }),
  ).toBeDisabled();
  await expect(selected.getByText("2 of 500 selected")).toBeVisible();

  await selected
    .getByRole("button", { name: "Save product selection" })
    .click();
  await expect(selected.getByText("2 products saved.")).toBeVisible();
  await expect(selected.getByText("Saved", { exact: true })).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { level: 2, name: "Manually picked products" }),
  ).toBeVisible();
  const picks = await savedPicks(page);
  await expect(picks).toHaveCount(2);
  await expect(picks.nth(0)).toContainText(PICKER.bulk06);
  await expect(picks.nth(1)).toContainText(PICKER.rose);
});

test("filters by category, status and shop without hiding availability notes", async ({
  page,
}) => {
  await openFixture(page);
  const available = availableRegion(page);
  const form = searchForm(page);

  await searchProducts(page, "E2E Picker");
  await form.getByLabel("Category").selectOption({
    label: "E2E Picker Hampers",
  });
  await form.getByRole("button", { name: "Apply filters" }).click();
  await expect(
    available.getByText("6 products match the filters."),
  ).toBeVisible();
  await expect(available.getByText(PICKER.rose)).toHaveCount(0);

  await form.getByRole("button", { name: "Clear filters" }).click();
  await expect(form.getByLabel("Product name")).toHaveValue("");
  await searchProducts(page, "E2E Picker");
  await expect(
    available.getByText("13 products match the filters."),
  ).toBeVisible();

  await form.getByLabel("Status").selectOption("draft");
  await form.getByRole("button", { name: "Apply filters" }).click();
  await expect(
    available.getByText("1 product match the filters."),
  ).toBeVisible();
  await expect(available.getByText(PICKER.draft, { exact: true })).toBeVisible();
  await expect(
    available.getByText("Draft, not publicly visible"),
  ).toBeVisible();

  await form.getByRole("button", { name: "Clear filters" }).click();
  await searchProducts(page, PICKER.tulip);
  await expect(available.getByText(PICKER.tulip, { exact: true })).toBeVisible();
  await expect(available.getByText("Out of stock")).toBeVisible();

  await form.getByRole("button", { name: "Clear filters" }).click();
  await form.getByLabel("Shop name").fill("Paused Shop");
  await form.getByRole("button", { name: "Apply filters" }).click();
  await expect(
    available.getByText("1 product match the filters."),
  ).toBeVisible();
  await expect(available.getByText(PICKER.paused, { exact: true })).toBeVisible();
  await expect(available.getByText("Shop paused for orders")).toBeVisible();

  await form.getByRole("button", { name: "Clear filters" }).click();
  await searchProducts(page, "no-such-e2e-product");
  await expect(available.getByText("No products found.")).toBeVisible();
});

test("bulk adds visible products and supports ordering, removal and discard", async ({
  page,
}) => {
  await openFixture(page);
  const available = availableRegion(page);
  const selected = selectedRegion(page);

  await searchProducts(page, "E2E Picker Bulk");
  await expect(
    available.getByText("6 products match the filters."),
  ).toBeVisible();

  await available.getByRole("button", { name: "Add visible (6)" }).click();
  await expect(selected.getByText("6 of 500 selected")).toBeVisible();
  await expect(await savedPicks(page)).toHaveCount(6);

  await selected
    .getByRole("button", { name: `Move ${PICKER.bulk06} down` })
    .click();
  const picks = await savedPicks(page);
  await expect(picks.nth(0)).toContainText("E2E Picker Bulk 05");
  await expect(picks.nth(1)).toContainText(PICKER.bulk06);

  await selected
    .getByRole("button", { name: `Remove ${PICKER.bulk06}` })
    .click();
  await expect(selected.getByText("5 of 500 selected")).toBeVisible();
  await expect(picks).toHaveCount(5);

  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "Occasions" })
    .click();
  const dialog = page.getByRole("alertdialog", { name: "Leave without saving?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${EDIT_PATH}$`));

  await selected
    .getByRole("button", { name: "Discard changes" })
    .click();
  await expect(selected.getByText("0 of 500 selected")).toBeVisible();
  await expect(selected.getByText("Saved", { exact: true })).toBeVisible();
});

test("removes every manual pick without leaving stale selections", async ({
  page,
}) => {
  await openFixture(page);
  const available = availableRegion(page);
  const selected = selectedRegion(page);

  await searchProducts(page, "Rose");
  await available.getByRole("button", { name: `Add ${PICKER.rose}` }).click();
  await selected
    .getByRole("button", { name: "Save product selection" })
    .click();
  await expect(selected.getByText("1 product saved.")).toBeVisible();

  await selected
    .getByRole("button", { name: `Remove ${PICKER.rose}` })
    .click();
  await selected
    .getByRole("button", { name: "Save product selection" })
    .click();
  await expect(
    selected.getByText("All manual product picks were removed."),
  ).toBeVisible();
  await expect(selected.getByText("No manual picks yet.")).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { level: 2, name: "Manually picked products" }),
  ).toBeVisible();
  await expect(selected.getByText("0 of 500 selected")).toBeVisible();
  await expect(selected.getByText("No manual picks yet.")).toBeVisible();
});
