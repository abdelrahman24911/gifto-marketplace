import type { Metadata } from "next";

export const SOCIAL_IMAGE = {
  url: "/og-image.png",
  width: 1200,
  height: 630,
  alt: "Gifto - gifts from independent gift shops across Egypt",
};

type PageMetadataInput = {
  title: string;
  description: string;
  path: string;
  socialTitle?: string;
  noIndex?: boolean;
};

/**
 * Public pages share one canonical + Open Graph policy. The root layout owns
 * the metadata base, image, site name, locale, and Twitter card type.
 */
export function pageMetadata({
  title,
  description,
  path,
  socialTitle,
  noIndex = false,
}: PageMetadataInput): Metadata {
  const social = socialTitle ?? `${title} — Gifto`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: social,
      description,
      url: path,
      images: [SOCIAL_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: social,
      description,
      images: [{ url: SOCIAL_IMAGE.url, alt: SOCIAL_IMAGE.alt }],
    },
    ...(noIndex
      ? {
          robots: {
            index: false,
            follow: true,
          },
        }
      : {}),
  };
}
