import { expect, test, type Page } from "@playwright/test";

import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  FIXTURE_ID,
  FIXTURE_NAME,
  fixtureImageExists,
  readFixture,
  resetFixture,
} from "./fixture-admin";

const EDIT_PATH = `/admin/occasions/${FIXTURE_ID}/edit`;
const NEW_IMAGE = {
  name: "new-fixture.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
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
    page.getByRole("heading", { level: 1, name: FIXTURE_NAME }),
  ).toBeVisible();
  await expect(page.locator('input[name="name"]')).toHaveValue(FIXTURE_NAME);
}

function leaveDialog(page: Page) {
  return page.getByRole("alertdialog", { name: "Leave without saving?" });
}

function beforeUnloadIsGuarded(page: Page) {
  return page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    const notCancelled = window.dispatchEvent(event);
    return !notCancelled || event.defaultPrevented;
  });
}

async function waitForDirtyGuard(page: Page) {
  await expect.poll(() => beforeUnloadIsGuarded(page)).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await resetFixture();
  await loginAsAdmin(page);
});

test("breadcrumb navigation is guarded only after a real change", async ({
  page,
}) => {
  const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });

  await openFixture(page);

  await breadcrumb.getByRole("link", { name: "Occasions" }).click();
  await expect(page).toHaveURL(/\/admin\/occasions$/);
  await expect(leaveDialog(page)).toHaveCount(0);

  await page.getByRole("link", { name: `Edit ${FIXTURE_NAME}` }).click();
  await expect(page).toHaveURL(new RegExp(`${EDIT_PATH}$`));

  const name = page.locator('input[name="name"]');
  const changedName = `${FIXTURE_NAME} changed`;
  await name.fill(changedName);
  await waitForDirtyGuard(page);

  await breadcrumb.getByRole("link", { name: "Occasions" }).click();
  await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page).getByRole("button", { name: "Keep editing" }).click();

  await expect(page).toHaveURL(new RegExp(`${EDIT_PATH}$`));
  await expect(name).toHaveValue(changedName);

  await breadcrumb.getByRole("link", { name: "Occasions" }).click();
  await leaveDialog(page)
    .getByRole("button", { name: "Discard changes" })
    .click();

  await expect(page).toHaveURL(/\/admin\/occasions$/);
});

test("dashboard navigation prompts before leaving", async ({ page }) => {
  await openFixture(page);

  const description = page.locator('textarea[name="description"]');
  const changedDescription = "Unsaved description from the E2E lane.";
  await description.fill(changedDescription);
  await waitForDirtyGuard(page);

  const dashboardNav = page.getByRole("navigation", {
    name: "Admin dashboard",
  });

  await dashboardNav
    .getByRole("link", { name: "Orders", exact: true })
    .click();
  await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page).getByRole("button", { name: "Keep editing" }).click();

  await expect(page).toHaveURL(new RegExp(`${EDIT_PATH}$`));
  await expect(description).toHaveValue(changedDescription);

  await dashboardNav.getByRole("link", { name: "Tags", exact: true }).click();
  await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page)
    .getByRole("button", { name: "Discard changes" })
    .click();

  await expect(page).toHaveURL(/\/admin\/tags$/);
});

test("dashboard storefront link respects the guard", async ({ page }) => {
  await openFixture(page);
  await page.locator('input[name="name"]').fill(`${FIXTURE_NAME} storefront`);
  await waitForDirtyGuard(page);

  await page.getByRole("link", { name: "View storefront" }).click();
  await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page).getByRole("button", { name: "Keep editing" }).click();
  await expect(leaveDialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${EDIT_PATH}$`));

  await page.getByRole("link", { name: "View storefront" }).click();
  await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page)
    .getByRole("button", { name: "Discard changes" })
    .click();

  await expect(page).toHaveURL(/\/$/);
});

test("browser Back is guarded and discards only after confirmation", async ({
  page,
}) => {
  await openFixture(page);

  const name = page.locator('input[name="name"]');
  const changedName = `${FIXTURE_NAME} back`;
  await name.fill(changedName);
  await waitForDirtyGuard(page);

  await page.evaluate(() => window.history.back());
  await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page)
    .getByRole("button", { name: "Discard changes" })
    .click();

  await expect(page).not.toHaveURL(new RegExp(`${EDIT_PATH}$`));
});

test("browser Forward is guarded", async ({ page }) => {
  await openFixture(page);

  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "Occasions" })
    .click();
  await expect(page).toHaveURL(/\/admin\/occasions$/);

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${EDIT_PATH}$`));
  await expect(page.locator('input[name="name"]')).toHaveValue(FIXTURE_NAME);

  await page.locator('input[name="name"]').fill(`${FIXTURE_NAME} forward`);
  await waitForDirtyGuard(page);

  await page.evaluate(() => window.history.forward());
  await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page)
    .getByRole("button", { name: "Discard changes" })
    .click();

  await expect(page).toHaveURL(/\/admin\/occasions$/);
});

test("beforeunload is active only while dirty and save clears it", async ({
  page,
}) => {
  await openFixture(page);
  await expect.poll(() => beforeUnloadIsGuarded(page)).toBe(false);

  const name = page.locator('input[name="name"]');
  const changedName = `${FIXTURE_NAME} saved`;
  await name.fill(changedName);
  await waitForDirtyGuard(page);

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "was saved." }),
  ).toBeVisible();
  await expect
    .poll(async () => (await readFixture()).name)
    .toBe(changedName);
  await expect.poll(() => beforeUnloadIsGuarded(page)).toBe(false);

  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "Occasions" })
    .click();
  await expect(page).toHaveURL(/\/admin\/occasions$/);
  await expect(leaveDialog(page)).toHaveCount(0);
});

test("selecting a new image makes the form dirty until cleared", async ({
  page,
}) => {
  await openFixture(page);

  const imageInput = page.locator('input[name="image"]');
  await imageInput.setInputFiles(NEW_IMAGE);
  await expect(page.getByText("New image", { exact: true })).toBeVisible();
  await waitForDirtyGuard(page);
  await expect(
    page.getByAltText("Selected occasion image preview"),
  ).toBeVisible();

  await page.getByRole("link", { name: "Cancel", exact: true }).click();
  await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page).getByRole("button", { name: "Keep editing" }).click();
  await expect(page).toHaveURL(new RegExp(`${EDIT_PATH}$`));

  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(page.getByText("New image", { exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/occasions$/);
  await expect(leaveDialog(page)).toHaveCount(0);
});

test("admin nav reaches each management surface", async ({ page }) => {
  await page.goto("/admin");
  const dashboardNav = page.getByRole("navigation", {
    name: "Admin dashboard",
  });

  const destinations = [
    { link: "Shops", heading: "Shops" },
    { link: "Categories", heading: "Categories" },
    { link: "Products", heading: "Products" },
    { link: "Commissions", heading: "Commissions" },
    { link: "Analytics", heading: "Analytics" },
    { link: "Overview", heading: "Overview" },
  ] as const;

  for (const destination of destinations) {
    await dashboardNav
      .getByRole("link", { name: destination.link, exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: destination.heading,
        exact: true,
      }),
    ).toBeVisible();
  }
});

test("image removal is immediate and does not dirty the form", async ({
  page,
}) => {
  await openFixture(page);

  await page.getByRole("button", { name: "Remove image", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Remove this image?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep image" }).click();
  await expect(dialog).toHaveCount(0);

  expect((await readFixture()).image_path).not.toBeNull();
  expect(await fixtureImageExists()).toBe(true);

  await page.getByRole("button", { name: "Remove image", exact: true }).click();
  await dialog.getByRole("button", { name: "Remove image", exact: true }).click();

  await expect(page.getByText("The image was removed.")).toBeVisible();
  await expect(page.getByText("No image yet")).toBeVisible();
  await expect.poll(async () => (await readFixture()).image_path).toBeNull();
  await expect.poll(() => fixtureImageExists()).toBe(false);

  await page.getByRole("link", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/occasions$/);
  await expect(leaveDialog(page)).toHaveCount(0);
});
