import { describe, expect, it } from "vitest";

import { pageMetadata, SOCIAL_IMAGE } from "./metadata";

describe("pageMetadata", () => {
  it("sets canonical and social metadata for an indexable page", () => {
    const metadata = pageMetadata({
      title: "Shop by occasion",
      description: "Browse Gifto occasions.",
      path: "/occasions",
    });

    expect(metadata.alternates).toEqual({ canonical: "/occasions" });
    expect(metadata.openGraph).toMatchObject({
      title: "Shop by occasion — Gifto",
      description: "Browse Gifto occasions.",
      url: "/occasions",
      images: [SOCIAL_IMAGE],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Shop by occasion — Gifto",
      description: "Browse Gifto occasions.",
      images: [{ url: SOCIAL_IMAGE.url, alt: SOCIAL_IMAGE.alt }],
    });
    expect(metadata.robots).toBeUndefined();
  });

  it("supports search pages that must stay out of the index", () => {
    const metadata = pageMetadata({
      title: "Search gifts",
      description: "Search the Gifto catalogue.",
      path: "/search",
      noIndex: true,
    });

    expect(metadata.alternates).toEqual({ canonical: "/search" });
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});
