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
