import { test, expect } from "./fixtures";

test("long unbroken search queries do not create horizontal page overflow", async ({
  page,
}) => {
  const query = "gift".repeat(50);

  await page.goto(`/search?q=${encodeURIComponent(query)}`, {
    waitUntil: "domcontentloaded",
  });

  await expect(
    page.getByRole("heading", { name: "Find the right gift" }),
  ).toBeVisible();
  await expect(page.getByText("No gifts found")).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));

  expect(
    dimensions.documentScrollWidth - dimensions.clientWidth,
    "document should not scroll horizontally",
  ).toBeLessThanOrEqual(1);
  expect(
    dimensions.bodyScrollWidth - dimensions.clientWidth,
    "body should not scroll horizontally",
  ).toBeLessThanOrEqual(1);
});
