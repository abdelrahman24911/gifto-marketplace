import { useTranslations } from "next-intl";

import { CartProvider } from "@/components/cart-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("common");

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-full focus:bg-zinc-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:outline-none"
      >
        {t("skipToMainContent")}
      </a>
      <CartProvider>
        <SiteHeader />
        <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
      </CartProvider>
      <SiteFooter />
    </>
  );
}
