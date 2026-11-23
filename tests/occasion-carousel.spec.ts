import { test, expect, type Page } from "./fixtures";

const CARD = "[data-occasion-card]";

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

test.describe("occasion carousel", () => {
  test("reuses compact occasion cards on the homepage and occasions page", async ({
    page,
    browserDiagnostics,
    isMobile,
  }) => {
    test.slow();
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const homeRegion = page.getByRole("region", {
      name: "Occasions carousel",
    });
    await expect(homeRegion).toBeVisible();

    const homeCards = homeRegion.locator(CARD);
    const homeHrefs = await homeCards.evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("href")),
    );
    expect(homeHrefs.length).toBeGreaterThan(0);
    for (const href of homeHrefs) {
      expect(href).toMatch(/^\/occasions\/[^/]+$/);
    }
    await expect(homeCards.first().locator("p")).toHaveCount(0);

    const box = await homeCards.first().boundingBox();
    const expectedWidth = isMobile ? 112 : 160;
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(expectedWidth - 1);
    expect(box?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
      expectedWidth + 1,
    );

    await waitForHydration(page, '[role="region"]');

    if (!isMobile) {
      const homeOverflow = await homeRegion.evaluate(
        (rail) => rail.scrollWidth - rail.clientWidth,
      );
      const previous = page.getByRole("button", {
        name: "Previous occasions",
      });
      const next = page.getByRole("button", { name: "Next occasions" });

      if (homeOverflow > 0) {
        await expect(previous).toBeVisible();
        await expect(previous).toBeDisabled();
        await expect(next).toBeEnabled();
      } else {
        await expect(previous).toHaveCount(0);
        await expect(next).toHaveCount(0);
      }
    }

    await page.goto("/occasions", { waitUntil: "domcontentloaded" });

    const pageRegion = page.getByRole("region", {
      name: "Occasions carousel",
    });
    await expect(pageRegion).toBeVisible();
    const pageHrefs = await pageRegion.locator(CARD).evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("href")),
    );
    expect(pageHrefs).toEqual(homeHrefs);

    expect(browserDiagnostics.pageErrors).toEqual([]);
  });

  test("filters by localized and canonical occasion names", async ({
    page,
  }) => {
    test.slow();
    await page.goto("/occasions", { waitUntil: "domcontentloaded" });
    const search = page.getByRole("searchbox", { name: "Search occasions" });
    await expect(search).toBeVisible();
    await waitForHydration(page, 'input[type="search"]');

    const region = page.getByRole("region", { name: "Occasions carousel" });
    await search.fill("ramadan");
    await expect(region.locator(CARD)).toHaveCount(1);
    await expect(region.locator(CARD)).toContainText("Ramadan Night");

    await search.fill("");
    await expect(region.locator(CARD).first()).toContainText("Graduation");

    await page.goto("/ar/occasions", { waitUntil: "domcontentloaded" });
    const arSearch = page.getByRole("searchbox", {
      name: "ابحث في المناسبات",
    });
    await expect(arSearch).toBeVisible();
    await waitForHydration(page, 'input[type="search"]');

    const arRegion = page.getByRole("region", { name: "عرض المناسبات" });
    await arSearch.fill("ليالي");
    await expect(arRegion.locator(CARD)).toHaveCount(1);
    await expect(arRegion.locator(CARD)).toContainText("ليالي رمضان");

    await arSearch.fill("Ramadan");
    await expect(arRegion.locator(CARD)).toHaveCount(1);
    await expect(arRegion.locator(CARD)).toContainText("ليالي رمضان");
  });

  test("the rail scrolls horizontally and mirrors its edges in RTL", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "The rail only overflows on the mobile project.");

    await page.goto("/occasions", { waitUntil: "domcontentloaded" });
    const region = page.getByRole("region", { name: "Occasions carousel" });
    await expect(region).toBeVisible();
    await waitForHydration(page, '[role="region"]');

    const overflow = await region.evaluate(
      (rail) => rail.scrollWidth - rail.clientWidth,
    );
    test.skip(overflow <= 0, "The current catalogue fits without scrolling.");

    const before = await region.evaluate((rail) => rail.scrollLeft);
    await region.evaluate((rail) =>
      rail.scrollBy({ left: 240, behavior: "instant" }),
    );
    await expect
      .poll(() => region.evaluate((rail) => rail.scrollLeft))
      .not.toBe(before);

    const pageOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(pageOverflow).toBeLessThanOrEqual(1);

    await page.goto("/ar/occasions", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    const arRegion = page.getByRole("region", { name: "عرض المناسبات" });
    await expect(arRegion).toBeVisible();
    await waitForHydration(page, '[role="region"]');
    const arHrefs = await arRegion.locator(CARD).evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("href")),
    );
    expect(arHrefs.length).toBeGreaterThan(0);
    for (const href of arHrefs) {
      expect(href).toMatch(/^\/ar\/occasions\/[^/]+$/);
    }

    const arLabels = await arRegion.locator(CARD).allInnerTexts();
    expect(arLabels.length).toBeGreaterThan(0);
    for (const label of arLabels) {
      expect(label).toMatch(/[\u0600-\u06FF]/);
    }

    const arBefore = await arRegion.evaluate((rail) => rail.scrollLeft);
    await arRegion.evaluate((rail) =>
      rail.scrollBy({ left: -240, behavior: "instant" }),
    );
    await expect
      .poll(() => arRegion.evaluate((rail) => rail.scrollLeft))
      .not.toBe(arBefore);
  });
});
