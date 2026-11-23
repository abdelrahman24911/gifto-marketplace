import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

import { NavigationGuardProvider } from "@/components/navigation-guard";
import { EnvironmentBanner } from "@/components/environment-banner";
import { LocaleHtmlSync } from "@/components/locale-html-sync";
import { ToastProvider } from "@/components/toast-provider";
import { LOCALE_DIRECTIONS, type AppLocale } from "@/i18n/routing";
import {
  getEnvironment,
  type GiftoEnvironment,
} from "@/lib/environment";
import { isIndexingEnabled } from "@/lib/indexing";
import { SOCIAL_IMAGE } from "@/lib/metadata";
import { organizationJsonLd } from "@/lib/organization-json-ld";
import { serializeJsonLd } from "@/lib/product-json-ld";
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

// Arabic face for the storefront's Arabic slice (P1-10, H-15). Latin text
// keeps Geist/Fraunces; `html[dir="rtl"]` switches the body and display
// faces to this one in globals.css.
const plexSansArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic-sans",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
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
  robots: {
    index: isIndexingEnabled(),
    follow: isIndexingEnabled(),
  },
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Resolved from the middleware's X-NEXT-INTL-LOCALE header; "en" for every
  // route outside the [locale] segment (vendor, admin, callbacks, API).
  let locale: AppLocale = "en";
  try {
    const resolved = await getLocale();
    locale = resolved === "ar" ? "ar" : "en";
  } catch {
    locale = "en";
  }
  // P1-11: the CSP nonce the proxy generated for this request; the
  // Organization JSON-LD block below must carry it or the enforced
  // script-src blocks it. Rendered once here, for the whole site (P1-16).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // P5 demo separation: the banner labels demo/staging deployments on
  // every page so test data is never mistaken for the real marketplace.
  // A bad GIFTO_ENVIRONMENT value must never break rendering — the
  // deployment preflight fails on it instead — so the read is guarded.
  let environment: GiftoEnvironment = "development";
  try {
    environment = getEnvironment();
  } catch {
    environment = "development";
  }
  // Client providers (toasts, navigation guards) sit above the locale segment,
  // so the messages must be supplied here rather than only in [locale].
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      dir={LOCALE_DIRECTIONS[locale]}
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${plexSansArabic.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-paper text-ink">
        <EnvironmentBanner environment={environment} />
        <LocaleHtmlSync />
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(organizationJsonLd()),
          }}
        />
        <NextIntlClientProvider messages={messages} locale={locale}>
          <ToastProvider>
            <NavigationGuardProvider>{children}</NavigationGuardProvider>
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
