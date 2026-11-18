import { GiftoMark } from "@/components/icons";
import { GuardedLink } from "@/components/navigation-guard";
import { Container } from "@/components/ui/section";

type FooterLink = {
  href: string;
  label: string;
};

type FooterColumn = {
  title: string;
  links: FooterLink[];
};

const COLUMNS: FooterColumn[] = [
  {
    title: "Shop",
    links: [
      { href: "/occasions", label: "Shop by occasion" },
      { href: "/categories", label: "Shop by category" },
      { href: "/shops", label: "All shops" },
      { href: "/search", label: "Search gifts" },
      { href: "/#fresh-picks", label: "Fresh Picks" },
      { href: "/#gift-finder", label: "Gift Finder" },
    ],
  },
  {
    title: "Explore",
    links: [
      { href: "/#how-it-works", label: "How Gifto works" },
      { href: "/occasions", label: "Gift occasions" },
      { href: "/categories", label: "Gift categories" },
      { href: "/shops", label: "Meet the shops" },
      { href: "/#gift-finder", label: "Find a gift" },
    ],
  },
  {
    title: "Support",
    links: [
      { href: "/help", label: "Help centre" },
      { href: "/delivery-returns", label: "Delivery & returns" },
      { href: "/contact", label: "Contact us" },
    ],
  },
  {
    title: "Sellers",
    links: [
      { href: "/login", label: "Seller sign in" },
      { href: "/help#selling-on-gifto", label: "Seller guide" },
      { href: "/contact#seller-enquiries", label: "Become a seller" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms of use" },
      { href: "/refund-policy", label: "Refund policy" },
    ],
  },
];

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

export function SiteFooter() {
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
              Gifts in Egypt,
              <br />
              wrapped properly.
            </p>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-soft">
              A curated marketplace of independent gift shops. Each shop wraps,
              packs, and delivers its own gifts — with cash on delivery.
            </p>
            <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-line-strong/70 bg-paper px-3 py-1.5 text-xs font-medium text-ink-soft">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-berry" />
              Every shop reviewed by Gifto
            </p>
          </div>

          {COLUMNS.map((column) => (
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
              {column.title === "Sellers" ? (
                <p className="mt-4 max-w-[13rem] text-xs leading-relaxed text-ink-mute">
                  New shops join by invitation. Existing sellers sign in above.
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-line pt-6 text-xs text-ink-mute sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Gifto. Cash on delivery only.</p>
          <p>Prices and stock are confirmed by each shop at checkout.</p>
        </div>
      </Container>
    </footer>
  );
}
