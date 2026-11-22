import { test, expect, type Page } from "./fixtures";

function resultCount(text: string | null): number {
  const match = text?.match(/^(\d+) gifts?/);
  return match ? Number(match[1]) : Number.NaN;
}

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

test.describe("homepage", () => {
  test("presents the core sections in a usable order", async ({
    page,
    browserDiagnostics,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveTitle(
      "Gifts in Egypt, wrapped properly — Gifto",
    );
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Gifts in Egypt, wrapped properly.",
      }),
    ).toBeVisible();

    const sectionOrder = [
      "Shop by occasion",
      "Shop by category",
      "Fresh Picks",
      "Gift Finder",
      "From browse to doorstep, simply.",
      "Shops worth browsing",
    ];

    const headings = await page.locator("main h2").allTextContents();
    const indices = sectionOrder.map((heading) => headings.indexOf(heading));

    expect(indices.every((index) => index >= 0)).toBe(true);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));

    await expect(page.locator('main a[href="/search"]').first()).toBeVisible();
    await expect(
      page.locator('main a[href="/occasions"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('main a[href="/categories"]').first(),
    ).toBeVisible();

    expect(browserDiagnostics.pageErrors).toEqual([]);
  });

  test("quick add updates the cart count without leaving the page", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const addButton = page
      .locator('button[aria-label^="Add to cart: "]')
      .first();
    await addButton
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(() => {});
    test.skip(
      (await addButton.count()) === 0,
      "No quick-addable product is available in the current catalogue.",
    );

    await waitForHydration(page, 'button[aria-label^="Add to cart: "]');
    await expect(addButton).toHaveAttribute(
      "aria-label",
      /^Add to cart: .+/,
    );
    await addButton.scrollIntoViewIfNeeded();
    await addButton.click();

    await expect(
      page.getByRole("link", { name: "Cart, 1 item" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("Gift Finder responds to filters and restores the full count", async ({
    page,
  }) => {
    await page.route("**/*", (route) =>
      route.request().resourceType() === "image"
        ? route.abort()
        : route.fallback(),
    );
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const finder = page.locator("#gift-finder");
    const summary = finder.locator('p[aria-live="polite"]').first();
    await expect(summary).toContainText(/gifts?/);

    const initialCount = resultCount(await summary.textContent());
    expect(Number.isNaN(initialCount)).toBe(false);

    await waitForHydration(page, "#gift-finder select");
    await finder.getByLabel("Who is it for?").selectOption("kids");
    await finder.getByLabel("What's your budget?").selectOption("under-250");
    await expect(summary).toContainText("match your choices");

    const filteredText = await summary.textContent();
    const filteredCount = resultCount(filteredText);
    expect(Number.isNaN(filteredCount)).toBe(false);
    expect(filteredCount).toBeLessThanOrEqual(initialCount);

    if (filteredCount === 0) {
      await expect(
        finder.getByText("No gifts match those choices yet"),
      ).toBeVisible();
    }

    const showMore = finder.getByRole("button", { name: "Show more gifts" });
    if ((await showMore.count()) > 0) {
      const cards = finder.locator("article");
      const before = await cards.count();
      await showMore.click();
      await expect.poll(() => cards.count()).toBeGreaterThan(before);
    }

    await finder.getByRole("button", { name: "Clear choices" }).click();
    await expect(summary).toContainText("ready to explore");
    await expect(summary).toContainText(
      `${initialCount} ${initialCount === 1 ? "gift" : "gifts"}`,
    );
  });

  test("announcement controls expose a pause and resume state", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const pause = page.getByRole("button", { name: "Pause announcements" });
    test.skip((await pause.count()) === 0, "Marquee controls are not rendered.");

    await waitForHydration(page, 'button[aria-label="Pause announcements"]');
    await pause.click();
    await expect(
      page.getByRole("button", { name: "Play announcements" }),
    ).toBeVisible();
  });

  test("in-page Gift Finder links resolve to the section", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await waitForHydration(page, 'main a[href="/#gift-finder"]');
    await page
      .locator('main a[href="/#gift-finder"]')
      .first()
      .click();

    await expect(page).toHaveURL(/\/#gift-finder$/);
    await expect(
      page.getByRole("heading", { level: 2, name: "Gift Finder" }),
    ).toBeVisible();
  });

  test("the mobile menu behaves as a modal and restores focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const trigger = page.getByRole("button", { name: "Open menu" });
    await waitForHydration(page, 'button[aria-label="Open menu"]');
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Menu" });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("button", { name: "Close menu" })).toBeVisible();

    expect(
      await page.evaluate(() => {
        const active = document.activeElement;
        return Boolean(active?.closest("#mobile-menu"));
      }),
    ).toBe(true);
    expect(
      await page.evaluate(() => document.body.style.overflow),
    ).toBe("hidden");

    await page.keyboard.press("Escape");

    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(
      await page.evaluate(() => document.body.style.overflow),
    ).not.toBe("hidden");
  });

  test("the mobile viewport does not scroll horizontally", async ({ page }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page
        .getByRole("heading", { name: "Shops worth browsing" })
        .scrollIntoViewIfNeeded();

      const overflow = await page.evaluate(() => ({
        document:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.documentElement.clientWidth,
      }));

      expect(overflow.document, `document at ${width}px`).toBeLessThanOrEqual(
        1,
      );
      expect(overflow.body, `body at ${width}px`).toBeLessThanOrEqual(1);
    }
  });
});
