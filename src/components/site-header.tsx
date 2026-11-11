import { Suspense } from "react";

import { CartLink } from "@/components/cart-link";
import { GiftoMark, UserIcon } from "@/components/icons";
import { MobileNav } from "@/components/mobile-nav";
import { GuardedLink } from "@/components/navigation-guard";
import { SearchForm } from "@/components/search-form";
import { SignOutButton } from "@/components/sign-out-button";
import { Container } from "@/components/ui/section";
import { getRequestContext } from "@/lib/auth";

const NAV = [
  { href: "/categories", label: "Categories" },
  { href: "/shops", label: "Shops" },
];

const navLinkClass =
  "rounded-full px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-berry-soft hover:text-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry";

function AnnouncementBar() {
  const items = [
    "Free delivery at launch",
    "Cash on delivery across Egypt",
    "Every shop reviewed by Gifto",
  ];

  return (
    <div className="bg-berry-deep text-paper">
      <Container className="flex min-h-9 flex-wrap items-center justify-center gap-x-3 gap-y-1 py-1.5 text-center text-[0.72rem] tracking-[0.06em] sm:text-xs">
        {items.map((item, index) => (
          <span key={item} className="flex items-center gap-3">
            {index > 0 ? (
              <span aria-hidden className="text-gold">
                ·
              </span>
            ) : null}
            <span className={index === 2 ? "hidden sm:inline" : ""}>{item}</span>
          </span>
        ))}
      </Container>
    </div>
  );
}

/**
 * Account-dependent controls. Reads the verified session on every request so
 * account controls are only shown to users who are actually signed in — the
 * real authorization boundary remains RLS plus the server-side page guards,
 * never this header. Rendered inside <Suspense> so the rest of the header and
 * the page shell stream without waiting for the session lookup.
 */
async function HeaderActions() {
  const { user, memberships, isPlatformAdmin } = await getRequestContext();

  let hasActiveVendor = false;
  let activeVendorId: string | null = null;
  const active = memberships.find((m) => m.vendor?.status === "active");
  if (active?.vendor?.id) {
    hasActiveVendor = true;
    activeVendorId = active.vendor.id;
  }

  const accountLinks = user
    ? [
        { href: "/account", label: "Account" },
        { href: "/account/orders", label: "My orders" },
        ...(isPlatformAdmin ? [{ href: "/admin", label: "Admin dashboard" }] : []),
        ...(hasActiveVendor && !isPlatformAdmin
          ? [
              {
                href: activeVendorId
                  ? `/vendor/overview?vendor=${activeVendorId}`
                  : "/vendor/overview",
                label: "Vendor dashboard",
              },
              { href: "/vendor/orders", label: "Vendor orders" },
              { href: "/vendor/products", label: "Vendor products" },
            ]
          : []),
        ...(hasActiveVendor && isPlatformAdmin
          ? [
              {
                href: activeVendorId
                  ? `/vendor/overview?vendor=${activeVendorId}`
                  : "/vendor/overview",
                label: "Vendor dashboard",
              },
            ]
          : []),
      ]
    : [
        { href: "/login", label: "Sign in" },
        { href: "/signup", label: "Create account" },
      ];

  return (
    <>
      <GuardedLink
        href={user ? "/account" : "/login"}
        className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-berry-soft hover:text-berry-deep"
      >
        <UserIcon className="h-5 w-5" />
        <span className="hidden sm:inline">{user ? "Account" : "Sign in"}</span>
      </GuardedLink>

      <CartLink className={cartLinkClass} />

      {user ? (
        <SignOutButton className="hidden h-10 items-center rounded-full px-3 text-sm font-medium text-ink-mute transition-colors hover:text-berry lg:inline-flex" />
      ) : null}

      <MobileNav nav={NAV} account={accountLinks} showSignOut={!!user} />
    </>
  );
}

const cartLinkClass =
  "inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-berry-soft hover:text-berry-deep";

/** Same footprint as the real controls, so nothing shifts when they stream in. */
function HeaderActionsFallback() {
  return (
    <>
      <span
        aria-hidden
        className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-ink-soft"
      >
        <UserIcon className="h-5 w-5" />
        <span className="hidden h-4 w-14 animate-pulse rounded bg-line sm:inline-block" />
      </span>

      <CartLink className={cartLinkClass} />

      <MobileNav nav={NAV} account={[]} showSignOut={false} />
    </>
  );
}

/**
 * Navigation chrome renders immediately; only the account-dependent controls
 * wait for the session lookup.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur">
      <AnnouncementBar />

      <Container>
        <div className="flex h-16 items-center gap-3">
          <GuardedLink
            href="/"
            className="flex items-center gap-2 rounded-full py-1 pr-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
          >
            <GiftoMark className="h-7 w-7" />
            <span className="font-display text-xl font-medium tracking-tight text-ink">
              Gifto
            </span>
          </GuardedLink>

          <nav
            aria-label="Store sections"
            className="ml-2 hidden items-center gap-1 lg:flex"
          >
            {NAV.map((link) => (
              <GuardedLink
                key={link.href}
                href={link.href}
                className={navLinkClass}
              >
                {link.label}
              </GuardedLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <SearchForm className="hidden w-52 transition-[width] duration-300 focus-within:w-72 lg:flex" />

            <Suspense fallback={<HeaderActionsFallback />}>
              <HeaderActions />
            </Suspense>
          </div>
        </div>
      </Container>
    </header>
  );
}
