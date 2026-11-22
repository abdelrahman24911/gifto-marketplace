import { getSiteUrl } from "@/lib/site-url";

export type ProductJsonLdInput = {
  name: string;
  description: string | null;
  imageUrls: string[];
  priceMinor: number;
  stock: number;
  shopName: string;
  shopSlug: string;
  productSlug: string;
};

export function productJsonLd(input: ProductJsonLdInput) {
  const url = new URL(
    `/shops/${encodeURIComponent(input.shopSlug)}/${encodeURIComponent(input.productSlug)}`,
    getSiteUrl({ fallbackToProductionOnLocalhost: true }),
  ).toString();

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    ...(input.description?.trim()
      ? { description: input.description.trim() }
      : {}),
    ...(input.imageUrls.length > 0 ? { image: input.imageUrls } : {}),
    brand: { "@type": "Brand", name: input.shopName },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "EGP",
      price: (input.priceMinor / 100).toFixed(2),
      availability:
        input.stock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: input.shopName },
    },
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
