import { getTranslations } from "next-intl/server";

import { GiftoMark } from "@/components/icons";
import { GuardedLink } from "@/components/navigation-guard";
import { Container } from "@/components/ui/section";

type FooterLink = {
  href: string;
  label: string;
};

type FooterColumn = {
  id: string;
  title: string;
  links: FooterLink[];
};

function FooterLinkItem({ link }: { link: FooterLink }) {
  return (
    <GuardedLink
      href={link.href}
      className="text-sm text-ink-soft transition-colors hover:text-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
    >
      {link.label}
    </GuardedLink>
  );
}

export async function SiteFooter() {
  const t = await getTranslations("footer");
  const ta = await getTranslations("announcement");

  const columns: FooterColumn[] = [
    {
      id: "shop",
      title: t("shop"),
      links: [
        { href: "/occasions", label: t("shopByOccasion") },
        { href: "/categories", label: t("shopByCategory") },
        { href: "/shops", label: t("allShops") },
        { href: "/search", label: t("searchGifts") },
        { href: "/#fresh-picks", label: t("freshPicks") },
        { href: "/#gift-finder", label: t("giftFinder") },
      ],
    },
    {
      id: "explore",
      title: t("explore"),
      links: [
        { href: "/#how-it-works", label: t("howItWorks") },
        { href: "/occasions", label: t("giftOccasions") },
        { href: "/categories", label: t("giftCategories") },
        { href: "/shops", label: t("meetShops") },
        { href: "/#gift-finder", label: t("findGift") },
      ],
    },
    {
      id: "support",
      title: t("support"),
      links: [
        { href: "/help", label: t("helpCentre") },
        { href: "/delivery-returns", label: t("deliveryReturns") },
        { href: "/contact", label: t("contactUs") },
      ],
    },
    {
      id: "sellers",
      title: t("sellers"),
      links: [
        { href: "/login", label: t("sellerSignIn") },
        { href: "/help#selling-on-gifto", label: t("sellerGuide") },
        { href: "/contact#seller-enquiries", label: t("becomeSeller") },
      ],
    },
    {
      id: "legal",
      title: t("legal"),
      links: [
        { href: "/privacy", label: t("privacyPolicy") },
        { href: "/terms", label: t("termsOfUse") },
        { href: "/refund-policy", label: t("refundPolicy") },
      ],
    },
  ];

  return (
    <footer className="mt-20 border-t border-line bg-paper-deep">
      <Container className="py-14">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:gap-x-8 lg:grid-cols-7">
          <div className="col-span-2 lg:col-span-2">
            <GuardedLink
              href="/"
              className="inline-flex items-center gap-2 rounded-full py-1 pr-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
            >
              <GiftoMark className="h-7 w-7" />
              <span className="font-display text-xl font-medium text-ink">
                Gifto
              </span>
            </GuardedLink>
            <p className="mt-4 max-w-xs font-display text-2xl leading-tight text-ink">
              {t("taglineA")}
              <br />
              {t("taglineB")}
            </p>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-soft">
              {t("about")}
            </p>
            <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-line-strong/70 bg-paper px-3 py-1.5 text-xs font-medium text-ink-soft">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-berry" />
              {ta("reviewedShops")}
            </p>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-berry">
                {column.title}
              </p>
              <ul className="mt-4 flex flex-col gap-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <FooterLinkItem link={link} />
                  </li>
                ))}
              </ul>
              {column.id === "sellers" ? (
                <p className="mt-4 max-w-[13rem] text-xs leading-relaxed text-ink-mute">
                  {t("sellersNote")}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-line pt-6 text-xs text-ink-mute sm:flex-row sm:items-center sm:justify-between">
          <p>{t("copyright", { year: new Date().getFullYear() })}</p>
          <p>{t("pricesNote")}</p>
        </div>
      </Container>
    </footer>
  );
}
