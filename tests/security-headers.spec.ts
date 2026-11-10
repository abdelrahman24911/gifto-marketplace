import { test, expect } from "./fixtures";

const PUBLIC_PATHS = ["/", "/login", "/cart", "/checkout"];

function configuredSupabaseOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!raw) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be set for the CSP origin assertion.",
    );
  }

  return new URL(raw).origin;
}

test("public pages send the baseline security headers and report-only CSP", async ({
  page,
}) => {
  for (const path of PUBLIC_PATHS) {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response, `${path}: response`).not.toBeNull();

    const headers = response!.headers();
    const csp = headers["content-security-policy-report-only"];

    expect.soft(headers["content-security-policy"], `${path}: enforced CSP`).toBeUndefined();
    expect.soft(csp, `${path}: report-only CSP`).toBeTruthy();
    expect.soft(csp, `${path}: default source`).toContain("default-src 'self'");
    expect.soft(csp, `${path}: base-uri`).toContain("base-uri 'self'");
    expect.soft(csp, `${path}: object-src`).toContain("object-src 'none'");
    expect.soft(csp, `${path}: frame-ancestors`).toContain("frame-ancestors 'none'");
    expect.soft(csp, `${path}: frame-src`).toContain("frame-src 'none'");
    expect.soft(csp, `${path}: form-action`).toContain("form-action 'self'");
    expect.soft(csp, `${path}: script source`).toContain("script-src 'self' 'unsafe-inline'");
    expect.soft(csp, `${path}: style source`).toContain("style-src 'self' 'unsafe-inline'");
    expect.soft(csp, `${path}: image source`).toContain("img-src 'self'");
    expect.soft(csp, `${path}: font source`).toContain("font-src 'self'");
    expect.soft(csp, `${path}: connect source`).toContain("connect-src 'self'");
    expect.soft(csp, `${path}: no wildcard source`).not.toContain("*");
    expect.soft(csp, `${path}: no unsafe-eval`).not.toContain("unsafe-eval");

    expect.soft(headers["x-content-type-options"], `${path}: nosniff`).toBe("nosniff");
    expect.soft(headers["x-frame-options"], `${path}: frame denial`).toBe("DENY");
    expect
      .soft(headers["referrer-policy"], `${path}: referrer policy`)
      .toBe("strict-origin-when-cross-origin");
    expect
      .soft(headers["permissions-policy"], `${path}: permissions policy`)
      .toBe("camera=(), microphone=(), geolocation=(), payment=()");
    expect.soft(headers["x-powered-by"], `${path}: powered-by removed`).toBeUndefined();
  }
});

test("CSP includes the configured Supabase origin", async ({ page }) => {
  const origin = configuredSupabaseOrigin();
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response, "CSP origin response").not.toBeNull();

  const csp = response!.headers()["content-security-policy-report-only"];
  expect(csp, "CSP origin header").toBeTruthy();
  expect(csp, "Supabase image source").toContain(`img-src 'self' ${origin}`);
  expect(csp, "Supabase connect source").toContain(
    `connect-src 'self' ${origin}`,
  );
});

test("order routes keep their no-referrer and no-index protections", async ({
  page,
}) => {
  const response = await page.goto("/orders/not-a-uuid", {
    waitUntil: "domcontentloaded",
  });
  expect(response, "order route response").not.toBeNull();

  const headers = response!.headers();
  expect(headers["referrer-policy"], "order referrer policy").toBe("no-referrer");
  expect(headers["x-robots-tag"], "order indexing policy").toBe("noindex, nofollow");
  expect(headers["cache-control"], "order cache policy").toMatch(
    /private|no-store/,
  );
  expect(headers["x-content-type-options"], "order nosniff").toBe("nosniff");
  expect(headers["x-frame-options"], "order frame denial").toBe("DENY");
  expect(headers["content-security-policy-report-only"], "order report-only CSP").toBeTruthy();
});
