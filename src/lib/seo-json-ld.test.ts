import { describe, expect, it } from "vitest";

import { breadcrumbJsonLd } from "@/lib/breadcrumb-json-ld";
import { organizationJsonLd } from "@/lib/organization-json-ld";
import { serializeJsonLd } from "@/lib/product-json-ld";

describe("organizationJsonLd", () => {
  it("builds an Organization with the public name and site URL only", () => {
    const value = organizationJsonLd();

    expect(value).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Gifto",
    });
    expect(value.url).toMatch(/^https?:\/\/.+/);
    // No invented entity details: no logo file exists and P0-06 published
    // no contact details, so those fields must be absent, not fabricated.
    expect(value).not.toHaveProperty("logo");
    expect(value).not.toHaveProperty("address");
    expect(value).not.toHaveProperty("telephone");
    expect(value).not.toHaveProperty("contactPoint");
  });
});

describe("breadcrumbJsonLd", () => {
  it("builds a BreadcrumbList with positions and absolute URLs", () => {
    const value = breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Shops", path: "/shops" },
      { name: "Nile Gifts", path: "/shops/nile-gifts" },
    ]);

    expect(value).toMatchObject({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
    });
    expect(value.itemListElement).toHaveLength(3);
    expect(value.itemListElement[0]).toMatchObject({
      "@type": "ListItem",
      position: 1,
      name: "Home",
    });
    expect(value.itemListElement[0].item).toMatch(/^https?:\/\/.+\/$/);
    expect(value.itemListElement[2]).toMatchObject({
      position: 3,
      name: "Nile Gifts",
    });
    expect(value.itemListElement[2].item).toMatch(
      /^https?:\/\/.+\/shops\/nile-gifts$/,
    );
  });

  it("includes the category level only when the caller passes it", () => {
    const withCategory = breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Shops", path: "/shops" },
      { name: "Nile Gifts", path: "/shops/nile-gifts" },
      { name: "Birthday", path: "/categories/birthday" },
      { name: "Rose Box", path: "/shops/nile-gifts/rose-box" },
    ]);
    expect(withCategory.itemListElement).toHaveLength(5);
    expect(withCategory.itemListElement[3].name).toBe("Birthday");

    const withoutCategory = breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Shops", path: "/shops" },
      { name: "Nile Gifts", path: "/shops/nile-gifts" },
      { name: "Rose Box", path: "/shops/nile-gifts/rose-box" },
    ]);
    expect(withoutCategory.itemListElement).toHaveLength(4);
    expect(
      withoutCategory.itemListElement.some(
        (item) => item.name === "Birthday",
      ),
    ).toBe(false);
  });

  it("serializes without a closing script tag", () => {
    const json = serializeJsonLd(
      breadcrumbJsonLd([{ name: "</script>", path: "/" }]),
    );
    expect(json).not.toContain("</script>");
    expect(JSON.parse(json).itemListElement[0].name).toBe("</script>");
  });
});
