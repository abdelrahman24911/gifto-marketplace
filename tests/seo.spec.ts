import { test, expect } from "./fixtures";

test("public discovery routes expose canonical, social and crawler metadata", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );

  const fetchFromPage = (path: string) =>
    page.evaluate(async (target) => {
      const response = await fetch(target);
      return { status: response.status, body: await response.text() };
    }, path);

  const occasion = await fetchFromPage("/occasions/ramdan-night");
  expect(occasion.status).toBe(200);
  expect(occasion.body).toContain("Ramadan Night");

  expect((await fetchFromPage("/robots.txt")).status).toBe(200);
  expect((await fetchFromPage("/sitemap.xml")).status).toBe(200);
});

test("unknown catalogue routes return a real 404 with a noindex page", async ({
  page,
}) => {
  const paths = [
    "/occasions/does-not-exist",
    "/categories/does-not-exist",
    "/shops/does-not-exist",
    "/shops/does-not-exist/does-not-exist",
  ];

  await page.goto("/");

  for (const path of paths) {
    const response = await page.evaluate(async (target) => {
      const result = await fetch(target);
      return { status: result.status, body: await result.text() };
    }, path);
    expect(response.status, path).toBe(404);
    expect(response.body, path).toContain(
      '<meta name="robots" content="noindex"/>',
    );
  }
});

async function readJsonLd(page: import("@playwright/test").Page) {
  const scripts = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""));
  return scripts.map((text) => JSON.parse(text) as Record<string, unknown>);
}

function findJsonLd(
  parsed: Record<string, unknown>[],
  type: string,
): Record<string, unknown> | undefined {
  return parsed.find((value) => value["@type"] === type);
}

// P1-16, L-16: Organization renders once from the root layout, and the
// beta gate still keeps indexing off (robots disallows all, pages noindex)
// until the owner confirms the lift.
test("homepage carries Organization JSON-LD while indexing stays off", async ({
  page,
}) => {
  await page.goto("/");
  const parsed = await readJsonLd(page);
  const organization = findJsonLd(parsed, "Organization");
  expect(organization).toBeDefined();
  expect(organization?.name).toBe("Gifto");
  expect(typeof organization?.url).toBe("string");

  const robots = await page.evaluate(async () => {
    const response = await fetch("/robots.txt");
    return response.text();
  });
  expect(robots).toContain("Disallow: /");

  const homepage = await page.content();
  expect(homepage).toContain("noindex");
});

// P1-16, L-16: BreadcrumbList mirrors the real visible breadcrumb path.
// Shop/product slugs are discovered from the rendered pages instead of
// hard-coded, because the e2e environment is not seeded with catalogue
// data by the test config; an unseeded environment skips, it does not
// invent a slug.
test("shop page carries BreadcrumbList JSON-LD", async ({ page }) => {
  await page.goto("/");
  const shopHref = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a[href]"));
    const shop = links
      .map((link) => link.getAttribute("href") ?? "")
      .find((href) => /^\/shops\/[^/]+$/.test(href));
    return shop ?? null;
  });
  test.skip(!shopHref, "no shop link on the homepage in this environment");

  await page.goto(shopHref!);
  const parsed = await readJsonLd(page);
  const breadcrumb = findJsonLd(parsed, "BreadcrumbList");
  expect(breadcrumb).toBeDefined();
  const items = breadcrumb?.itemListElement as Array<{
    position: number;
    name: string;
    item: string;
  }>;
  expect(items).toHaveLength(3);
  expect(items.map((item) => item.position)).toEqual([1, 2, 3]);
  expect(items[2].item.endsWith(shopHref!)).toBe(true);
});

test("product page carries BreadcrumbList JSON-LD beside Product", async ({
  page,
}) => {
  await page.goto("/");
  const shopHref = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a[href]"));
    const shop = links
      .map((link) => link.getAttribute("href") ?? "")
      .find((href) => /^\/shops\/[^/]+$/.test(href));
    return shop ?? null;
  });
  test.skip(!shopHref, "no shop link on the homepage in this environment");

  await page.goto(shopHref!);
  const productHref = await page.evaluate((shop) => {
    const links = Array.from(document.querySelectorAll("a[href]"));
    const product = links
      .map((link) => link.getAttribute("href") ?? "")
      .find(
        (href) => href.startsWith(`${shop}/`) && href.split("/").length === 4,
      );
    return product ?? null;
  }, shopHref!);
  test.skip(
    !productHref,
    "no product link on the shop page in this environment",
  );

  await page.goto(productHref!);
  const parsed = await readJsonLd(page);
  const breadcrumb = findJsonLd(parsed, "BreadcrumbList");
  expect(breadcrumb).toBeDefined();
  const items = breadcrumb?.itemListElement as Array<{
    position: number;
    name: string;
    item: string;
  }>;
  expect(items.length).toBeGreaterThanOrEqual(4);
  expect(items.map((item) => item.position)).toEqual(
    items.map((_, index) => index + 1),
  );
  expect(items.at(-1)?.item.endsWith(productHref!)).toBe(true);
  // Product JSON-LD is untouched by this prompt and still renders.
  expect(findJsonLd(parsed, "Product")).toBeDefined();
});
