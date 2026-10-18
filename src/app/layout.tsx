import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";

import { CartProvider } from "@/components/cart-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Gifto — Gifts in Egypt, wrapped properly",
    template: "%s — Gifto",
  },
  description:
    "Discover gifts from independent gift shops across Egypt. Browse by occasion, find the right gift, and order with cash on delivery.",
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
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-paper text-ink">
        <CartProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
        </CartProvider>
        <SiteFooter />
      </body>
    </html>
  );
}
