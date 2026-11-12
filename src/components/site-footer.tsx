import { GiftoMark } from "@/components/icons";
import { GuardedLink } from "@/components/navigation-guard";
import { Container } from "@/components/ui/section";

const COLUMNS = [
  {
    title: "Shop",
    links: [
      { href: "/occasions", label: "Shop by occasion" },
      { href: "/categories", label: "Shop by category" },
      { href: "/shops", label: "All shops" },
      { href: "/search", label: "Search gifts" },
    ],
  },
  {
    title: "Your account",
    links: [
      { href: "/cart", label: "Cart" },
      { href: "/account/orders", label: "Your orders" },
      { href: "/login", label: "Sign in" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-paper-deep">
      <Container className="py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2">
              <GiftoMark className="h-7 w-7" />
              <span className="font-display text-xl font-medium text-ink">
                Gifto
              </span>
            </div>
            <p className="mt-4 max-w-sm font-display text-lg text-ink">
              Gifts in Egypt, wrapped properly.
            </p>
            <p className="mt-3 max-w-md text-sm text-ink-soft">
              A marketplace of independent gift shops. Order with cash on
              delivery — each shop wraps, packs, and delivers its own gifts.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-berry">
                {column.title}
              </p>
              <ul className="mt-4 flex flex-col gap-3">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <GuardedLink
                      href={link.href}
                      className="text-sm text-ink-soft transition-colors hover:text-berry"
                    >
                      {link.label}
                    </GuardedLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-line pt-6 text-xs text-ink-mute sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Gifto. Cash on delivery only.</p>
          <p>Prices and stock are confirmed by each shop at checkout.</p>
        </div>
      </Container>
    </footer>
  );
}
