import { Suspense } from "react";

import { AccountMenu } from "@/components/account-menu";
import { AnnouncementBar } from "@/components/announcement-bar";
import { CartLink } from "@/components/cart-link";
import { GiftoMark, UserIcon } from "@/components/icons";
import { MobileNav } from "@/components/mobile-nav";
import { GuardedLink } from "@/components/navigation-guard";
import { SearchForm } from "@/components/search-form";
import { StoreNav } from "@/components/store-nav";
import { Container } from "@/components/ui/section";
import { getRequestContext } from "@/lib/auth";
import { getCategories, getOccasions } from "@/lib/catalog";
import { buildStoreNav, type StoreNavItem } from "@/lib/site-navigation";

const cartLinkClass =
  "inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-berry-soft hover:text-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry";

const signedOutLinks = [
  { href: "/login", label: "Sign in" },
  { href: "/signup", label: "Create account" },
];

/**
 * Account-dependent controls. Reads the verified session on every request so
 * account controls are only shown to users who are actually signed in — the
 * real authorization boundary remains RLS plus the server-side page guards,
 * never this header. Rendered inside <Suspense> so the rest of the header and
 * the page shell stream without waiting for the session lookup.
 */
async function HeaderActions({ nav }: { nav: StoreNavItem[] }) {
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
    : signedOutLinks;

  return (
    <>
      <AccountMenu
        signedIn={!!user}
        links={accountLinks}
        showSignOut={!!user}
        className="hidden lg:flex"
      />

      <GuardedLink
        href={user ? "/account" : "/login"}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-berry-soft hover:text-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry lg:hidden"
      >
        <UserIcon className="h-5 w-5" />
        <span className="sr-only">{user ? "Account" : "Sign in"}</span>
      </GuardedLink>

      <CartLink className={cartLinkClass} />

      <MobileNav
        nav={nav}
        account={accountLinks}
        showSignOut={!!user}
      />
    </>
  );
}

/** Same footprint as the real controls, so nothing shifts when they stream in. */
function HeaderActionsFallback({ nav }: { nav: StoreNavItem[] }) {
  return (
    <>
      <span
        aria-hidden
        className="hidden h-10 items-center gap-1.5 rounded-full px-3 text-ink-soft lg:inline-flex"
      >
        <UserIcon className="h-5 w-5" />
        <span className="h-4 w-14 animate-pulse rounded bg-line" />
      </span>

      <GuardedLink
        href="/login"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-berry-soft hover:text-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry lg:hidden"
      >
        <UserIcon className="h-5 w-5" />
        <span className="sr-only">Sign in</span>
      </GuardedLink>

      <CartLink className={cartLinkClass} />

      <MobileNav nav={nav} account={signedOutLinks} showSignOut={false} />
    </>
  );
}

/**
 * Navigation chrome. The catalogue navigation is shared, cached public data;
 * the account controls stream separately because they depend on the session.
 */
export async function SiteHeader() {
  const [categories, occasions] = await Promise.all([
    getCategories(),
    getOccasions(),
  ]);
  const nav = buildStoreNav({ categories, occasions });

  return (
    <>
      <AnnouncementBar />

      <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur">
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

            <StoreNav nav={nav} />

            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <SearchForm className="hidden w-52 transition-[width] duration-300 focus-within:w-72 lg:flex" />

              <Suspense fallback={<HeaderActionsFallback nav={nav} />}>
                <HeaderActions nav={nav} />
              </Suspense>
            </div>
          </div>
        </Container>
      </header>
    </>
  );
}
