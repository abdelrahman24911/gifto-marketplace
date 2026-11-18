import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";

import { NavigationGuardProvider } from "@/components/navigation-guard";
import { SOCIAL_IMAGE } from "@/lib/metadata";
import { getSiteUrl } from "@/lib/site-url";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  // No component renders monospace text today; keep the face available through
  // --font-mono without preloading it on every page.
  preload: false,
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const title = "Gifto — Gifts in Egypt, wrapped properly";
const description =
  "Discover gifts from independent gift shops across Egypt. Browse by occasion, find the right gift, and order with cash on delivery.";
export const metadata: Metadata = {
  metadataBase: new URL(
    getSiteUrl({ fallbackToProductionOnLocalhost: true }),
  ),
  title: {
    default: title,
    template: "%s — Gifto",
  },
  description,
  openGraph: {
    type: "website",
    siteName: "Gifto",
    locale: "en_EG",
    title,
    description,
    images: [SOCIAL_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [{ url: SOCIAL_IMAGE.url, alt: SOCIAL_IMAGE.alt }],
  },
};

// Every route here reads the auth session and/or the database, so nothing is
// statically prerenderable. Forcing dynamic rendering also lets the root layout
// use cookies() without breaking the not-found/prerender pass under
// `cacheComponents`.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-paper text-ink">
        <NavigationGuardProvider>{children}</NavigationGuardProvider>
      </body>
    </html>
  );
}
