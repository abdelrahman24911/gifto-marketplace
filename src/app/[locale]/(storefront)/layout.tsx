import { getTranslations } from "next-intl/server";

import { CartProvider } from "@/components/cart-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WishlistProvider } from "@/components/wishlist-provider";
import { getRequestContext } from "@/lib/auth";

export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("common");
  // Shares the header's request-scoped session lookup; the wishlist
  // provider only needs to know whether there is a signed-in account to
  // sync with (guests keep a browser-local wishlist).
  const { user } = await getRequestContext();

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-full focus:bg-zinc-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:outline-none"
      >
        {t("skipToMainContent")}
      </a>
      <WishlistProvider signedIn={!!user}>
        <CartProvider>
          <SiteHeader />
          <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
        </CartProvider>
      </WishlistProvider>
      <SiteFooter />
    </>
  );
}
