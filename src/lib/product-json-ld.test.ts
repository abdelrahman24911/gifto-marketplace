import { describe, expect, it } from "vitest";

import { isIndexingEnabled } from "@/lib/indexing";
import { productJsonLd, serializeJsonLd } from "@/lib/product-json-ld";

describe("isIndexingEnabled", () => {
  it("stays off by default and only accepts true", () => {
    expect(isIndexingEnabled(undefined)).toBe(false);
    expect(isIndexingEnabled("false")).toBe(false);
    expect(isIndexingEnabled("yes")).toBe(false);
    expect(isIndexingEnabled(" TRUE ")).toBe(true);
  });
});

describe("productJsonLd", () => {
  it("builds a Product offer with an absolute URL and EGP price", () => {
    const value = productJsonLd({
      name: "Rose Box",
      description: "Twelve red roses.",
      imageUrls: ["https://cdn.example/rose.jpg"],
      priceMinor: 45900,
      stock: 3,
      shopName: "Nile Gifts",
      shopSlug: "nile-gifts",
      productSlug: "rose-box",
    });

    expect(value).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Rose Box",
      image: ["https://cdn.example/rose.jpg"],
      brand: { "@type": "Brand", name: "Nile Gifts" },
      offers: {
        "@type": "Offer",
        priceCurrency: "EGP",
        price: "459.00",
        availability: "https://schema.org/InStock",
        itemCondition: "https://schema.org/NewCondition",
      },
    });
    expect(value.offers.url).toMatch(
      /^https?:\/\/.+\/shops\/nile-gifts\/rose-box$/,
    );
  });

  it("marks sold-out products and omits empty descriptions and images", () => {
    const value = productJsonLd({
      name: "Last Card",
      description: " ",
      imageUrls: [],
      priceMinor: 1000,
      stock: 0,
      shopName: "Shop",
      shopSlug: "shop",
      productSlug: "last-card",
    });

    expect(value).not.toHaveProperty("description");
    expect(value).not.toHaveProperty("image");
    expect(value.offers.availability).toBe(
      "https://schema.org/OutOfStock",
    );
  });

  it("escapes closing script tags in serialized JSON", () => {
    const json = serializeJsonLd({ description: "</script><script>" });
    expect(json).not.toContain("</script>");
    expect(JSON.parse(json)).toEqual({
      description: "</script><script>",
    });
  });
});
