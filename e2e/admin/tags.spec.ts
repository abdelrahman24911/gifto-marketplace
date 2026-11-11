import { expect, test, type Page } from "@playwright/test";

import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_TAG_NAMES,
  resetTaggingFixture,
} from "./fixture-admin";

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(E2E_ADMIN_EMAIL);
  await page.locator('input[name="password"]').fill(E2E_ADMIN_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/account$/),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
}

function createTagForm(page: Page) {
  return page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Create tag" }) });
}

function tagCard(page: Page, name: string) {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}

test.beforeEach(async ({ page }) => {
  await resetTaggingFixture();
  await loginAsAdmin(page);
});

test("creates, deactivates and reactivates a tag", async ({ page }) => {
  await page.goto("/admin/tags");
  await expect(page.getByRole("heading", { level: 1, name: "Tags" })).toBeVisible();

  const form = createTagForm(page);
  await form.getByLabel("Tag name").fill(E2E_TAG_NAMES.created);
  await form
    .getByLabel("Description")
    .fill("Created by the local admin E2E lane.");
  await form.getByRole("button", { name: "Create tag" }).click();

  await expect(
    page.getByText(`Tag "${E2E_TAG_NAMES.created}" created and active.`),
  ).toBeVisible();

  const card = tagCard(page, E2E_TAG_NAMES.created);
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Deactivate" }).click();
  await expect(card.getByRole("button", { name: "Activate" })).toBeVisible();
  await expect(card.getByText("Inactive", { exact: true })).toBeVisible();

  await card.getByRole("button", { name: "Activate" }).click();
  await expect(card.getByRole("button", { name: "Deactivate" })).toBeVisible();
  await expect(card.getByText("Active", { exact: true })).toBeVisible();
});

test("rejects a duplicate active tag with a clear message", async ({ page }) => {
  await page.goto("/admin/tags");

  const form = createTagForm(page);
  await form.getByLabel("Tag name").fill("  E2E Tag Thoughtful  ");
  await form.getByRole("button", { name: "Create tag" }).click();

  await expect(
    page.getByText("That tag is already active in the vocabulary."),
  ).toBeVisible();
  await expect(form.getByLabel("Tag name")).toHaveValue("E2E Tag Thoughtful");
});

test("approves a pending vendor suggestion into the vocabulary", async ({
  page,
}) => {
  await page.goto("/admin/tags");

  const suggestion = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: E2E_TAG_NAMES.suggestion }) });
  await expect(suggestion).toContainText("Pending review");
  await suggestion.getByRole("button", { name: "Approve tag" }).click();

  await expect(
    page.getByText("No vendor suggestions are waiting for review."),
  ).toBeVisible();
  await expect(tagCard(page, E2E_TAG_NAMES.suggestion)).toBeVisible();
});
