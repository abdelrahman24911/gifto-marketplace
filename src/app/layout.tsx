import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";

import { NavigationGuardProvider } from "@/components/navigation-guard";

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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

const title = "Gifto — Gifts in Egypt, wrapped properly";
const description =
  "Discover gifts from independent gift shops across Egypt. Browse by occasion, find the right gift, and order with cash on delivery.";
const ogImage = {
  url: "/og-image.png",
  width: 1200,
  height: 630,
  alt: "Gifto — gifts from independent gift shops across Egypt",
};

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
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
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [{ url: ogImage.url, alt: ogImage.alt }],
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
