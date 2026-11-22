import { describe, expect, it } from "vitest";

import { localizeHref } from "@/lib/locale-path";

describe("localizeHref", () => {
  it("prefixes the wishlist path on Arabic pages", () => {
    expect(localizeHref("/wishlist", "/ar")).toBe("/ar/wishlist");
    expect(localizeHref("/wishlist", "/ar/wishlist")).toBe("/ar/wishlist");
    expect(localizeHref("/wishlist?from=header", "/ar/shops")).toBe(
      "/ar/wishlist?from=header",
    );
  });

  it("leaves the wishlist path unchanged on English pages", () => {
    expect(localizeHref("/wishlist", "/")).toBe("/wishlist");
    expect(localizeHref("/wishlist", "/wishlist")).toBe("/wishlist");
  });

  it("keeps other localized storefront paths working", () => {
    expect(localizeHref("/cart", "/ar/shops")).toBe("/ar/cart");
    expect(localizeHref("/", "/ar")).toBe("/ar");
  });

  it("does not prefix admin, vendor, hash or external hrefs", () => {
    expect(localizeHref("/admin", "/ar")).toBe("/admin");
    expect(localizeHref("/vendor/orders", "/ar")).toBe("/vendor/orders");
    expect(localizeHref("#main-content", "/ar")).toBe("#main-content");
    expect(localizeHref("https://example.com/wishlist", "/ar")).toBe(
      "https://example.com/wishlist",
    );
  });
});
