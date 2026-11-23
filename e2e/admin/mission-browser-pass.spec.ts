import fs from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  E2E_PICKER_PRODUCT_NAMES,
  E2E_VENDOR_EMAIL,
  E2E_VENDOR_ID,
  E2E_VENDOR_NAME,
  E2E_VENDOR_PASSWORD,
  getAdminClient,
} from "./fixture-admin";

const ARTIFACTS = path.join(process.cwd(), "test-results", "browser-pass");
const ROSE_PRODUCT_ID = "c0000000-0000-4000-8000-000000000001";
const ROSE_PRODUCT_URL = "/shops/e2e-picker-bloom-shop/e2e-picker-rose";

function artifact(name: string): string {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  return path.join(ARTIFACTS, name);
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), {
    timeout: 20_000,
  });
}

async function loginAsAdmin(page: Page) {
  await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
}

async function loginAsVendor(page: Page) {
  await login(page, E2E_VENDOR_EMAIL, E2E_VENDOR_PASSWORD);
}

async function loginAsCustomer(page: Page) {
  await login(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD);
}

async function gateRequests(
  page: Page,
  matches: (url: URL) => boolean,
): Promise<() => void> {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route(
    (url) => matches(url),
    async (route) => {
      if (route.request().method() === "GET") {
        await gate;
      }
      await route.continue();
    },
  );

  return release;
}

function readDownload(downloadPath: string | null): string {
  if (!downloadPath) throw new Error("The download had no local file path.");
  return fs.readFileSync(downloadPath, "utf8");
}

test.describe("mission browser pass", () => {
  test("vendor finance tab shows pending feedback, then the settlements view and ledger CSV", async ({
    page,
  }) => {
    await loginAsVendor(page);

    const release = await gateRequests(
      page,
      (url) =>
        url.pathname === "/vendor/finance" &&
        url.searchParams.get("view") === "settlements",
    );

    await page.goto(`/vendor/finance?vendor=${E2E_VENDOR_ID}`);
    await expect(page.locator("#dashboard-main h1")).toHaveText("Finance");

    const tab = page
      .getByRole("navigation", { name: "Finance views" })
      .getByRole("link", { name: "Settlements", exact: true });

    await tab.click();
    await expect(tab).toHaveAttribute("aria-busy", "true");
    await expect(tab.locator("svg.animate-spin")).toBeVisible();
    await expect(tab).toHaveClass(/opacity-60/);
    await page.screenshot({
      path: artifact("vendor-finance-tab-pending.png"),
      fullPage: true,
    });

    release();
    await expect(
      page.getByRole("heading", { name: "Settlement history" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(tab).not.toHaveAttribute("aria-busy", "true");
    await expect(tab).toHaveAttribute("aria-current", "page");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("link", { name: "Download ledger (CSV)" })
        .click(),
    ]);
    expect(download.suggestedFilename()).toBe("gifto-finance-ledger-all.csv");
    const csv = readDownload(await download.path());
    expect(csv).toContain("Order,Earned date,State");
  });

  test("admin shop status confirm step previews, cancels, applies and restores", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(`/admin/shops?q=${encodeURIComponent(E2E_VENDOR_NAME)}`);

    const card = page.locator("li").filter({
      has: page.getByRole("heading", {
        name: E2E_VENDOR_NAME,
        exact: true,
      }),
    });
    await expect(card).toBeVisible();

    const status = card.getByLabel("Shop access");
    await status.selectOption("suspended");
    await card.getByRole("button", { name: "Apply", exact: true }).click();

    await expect(
      card.getByRole("alert"),
      "the first click must only preview the change",
    ).toHaveText(
      `Change ${E2E_VENDOR_NAME} from Active to Suspended?`,
    );
    await card.getByRole("button", { name: "Cancel", exact: true }).click();

    const admin = getAdminClient();
    const readStatus = async () => {
      const { data } = await admin
        .from("vendors")
        .select("status")
        .eq("id", E2E_VENDOR_ID)
        .single();
      return data?.status ?? null;
    };

    await expect
      .poll(readStatus, { message: "Cancel must not change the shop status" })
      .toBe("active");

    try {
      await card.getByRole("button", { name: "Apply", exact: true }).click();
      await card.getByRole("button", { name: "Confirm", exact: true }).click();
      await expect(card.getByRole("status")).toHaveText(
        "Status set to “suspended”.",
      );
      await expect.poll(readStatus).toBe("suspended");
      await page.screenshot({
        path: artifact("admin-shop-status-confirmed.png"),
        fullPage: true,
      });

      await status.selectOption("active");
      await card.getByRole("button", { name: "Apply", exact: true }).click();
      await card.getByRole("button", { name: "Confirm", exact: true }).click();
      await expect(card.getByRole("status")).toHaveText(
        "Status set to “active”.",
      );
      await expect.poll(readStatus).toBe("active");
    } finally {
      await admin
        .from("vendors")
        .update({ status: "active" })
        .eq("id", E2E_VENDOR_ID);
    }
  });

  test("vendor support review step previews the exact request before sending", async ({
    page,
  }) => {
    const admin = getAdminClient();
    await admin
      .from("vendors")
      .update({ status: "active" })
      .eq("id", E2E_VENDOR_ID);

    await loginAsVendor(page);
    await page.goto(`/vendor/support?vendor=${E2E_VENDOR_ID}`);
    await expect(page.locator("#dashboard-main h1")).toHaveText(
      "Help & support",
    );

    const subject = "E2E support preview request";
    const body =
      "This is an end-to-end test request that checks the support preview flow.";

    await page.locator('select[name="category"]').selectOption("orders");
    await page.locator('input[name="subject"]').fill(subject);
    await page.locator('textarea[name="body"]').fill(body);

    await page.getByRole("button", { name: "Review request" }).click();
    await expect(page.getByText("Check before you send")).toBeVisible();
    const definitions = page.getByRole("definition");
    await expect(
      definitions.filter({ hasText: "Orders & delivery" }),
    ).toBeVisible();
    await expect(definitions.filter({ hasText: subject })).toBeVisible();
    await expect(definitions.filter({ hasText: body })).toBeVisible();
    await page.screenshot({
      path: artifact("vendor-support-preview.png"),
      fullPage: true,
    });

    await page.getByRole("button", { name: "Edit request" }).click();
    await expect(page.locator('input[name="subject"]')).toHaveValue(subject);
    await expect(page.locator('textarea[name="body"]')).toHaveValue(body);

    await page.getByRole("button", { name: "Review request" }).click();
    await page.getByRole("button", { name: "Send support request" }).click();

    await expect(
      page.getByRole("status"),
      "the vendor must see the send confirmation",
    ).toHaveText(
      "Request sent to the Gifto team. It will appear in the admin support queue.",
    );
    await expect(page.getByText("Check before you send")).toHaveCount(0);

    await expect
      .poll(async () => {
        const { data } = await admin
          .from("support_requests")
          .select("id, status")
          .eq("subject", subject);
        return data?.length ?? 0;
      })
      .toBe(1);

    const { data: stored } = await admin
      .from("support_requests")
      .select("category, body, status")
      .eq("subject", subject)
      .single();
    expect(stored).toMatchObject({
      category: "orders",
      body,
      status: "open",
    });
  });

  test("admin product filter shows pending feedback and both admin CSV exports download", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    const release = await gateRequests(
      page,
      (url) =>
        url.pathname === "/admin/products" &&
        url.searchParams.get("status") === "active",
    );

    await page.goto("/admin/products");
    const filter = page.locator('a[href="/admin/products?status=active"]');
    await expect(filter).toHaveText("Active");

    await filter.click();
    await expect(filter).toHaveAttribute("aria-busy", "true");
    await expect(filter.locator("svg.animate-spin")).toBeVisible();
    await expect(filter).toHaveClass(/opacity-60/);
    await page.screenshot({
      path: artifact("admin-product-filter-pending.png"),
      fullPage: true,
    });

    release();
    await expect(page).toHaveURL(/status=active/);
    await expect(filter).not.toHaveAttribute("aria-busy", "true");
    await expect(filter).toHaveAttribute("aria-current", "page");

    const [productsDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Download CSV" }).click(),
    ]);
    expect(productsDownload.suggestedFilename()).toBe("gifto-products.csv");
    const productsCsv = readDownload(await productsDownload.path());
    expect(productsCsv).toContain("Product,Slug,Shop");
    expect(productsCsv).toContain(E2E_PICKER_PRODUCT_NAMES.rose);

    await page.goto("/admin/commissions");
    const [commissionsDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Download CSV" }).click(),
    ]);
    expect(commissionsDownload.suggestedFilename()).toBe(
      "gifto-commissions.csv",
    );
    const commissionsCsv = readDownload(await commissionsDownload.path());
    expect(commissionsCsv).toContain("Shop,Order");
  });

  test("wishlist saves to the account, survives a local clear, and removes", async ({
    page,
  }) => {
    await loginAsCustomer(page);

    const admin = getAdminClient();
    const { data: users } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1_000,
    });
    const customer = users.users.find(
      (user) => user.email?.toLowerCase() === E2E_CUSTOMER_EMAIL,
    );
    expect(customer, "the E2E customer must exist").toBeTruthy();
    const customerId = customer!.id;

    const readRows = async () => {
      const { data } = await admin
        .from("wishlists")
        .select("product_id")
        .eq("user_id", customerId)
        .eq("product_id", ROSE_PRODUCT_ID);
      return data?.length ?? 0;
    };

    await page.goto(ROSE_PRODUCT_URL);
    await expect(
      page.getByRole("heading", {
        name: E2E_PICKER_PRODUCT_NAMES.rose,
        exact: true,
      }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Save to wishlist" }).click();
    await expect(
      page.getByRole("button", { name: "Saved to wishlist" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("link", { name: "Wishlist, 1 item" }),
    ).toBeVisible();
    await expect.poll(readRows, { timeout: 15_000 }).toBe(1);
    await page.screenshot({
      path: artifact("wishlist-saved.png"),
      fullPage: true,
    });

    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Saved to wishlist" }),
      "the account copy must restore the saved state",
    ).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });

    await page.goto("/wishlist");
    await expect(
      page.getByRole("heading", { name: "Your wishlist" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: E2E_PICKER_PRODUCT_NAMES.rose }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByText("Your wishlist is empty.")).toBeVisible();
    await expect.poll(readRows, { timeout: 15_000 }).toBe(0);

    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await expect(page.getByText("Your wishlist is empty.")).toBeVisible();
    await expect(page.getByRole("link", { name: /^Wishlist, / })).toHaveCount(
      0,
    );
  });
});
