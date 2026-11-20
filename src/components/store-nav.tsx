"use client";

import { usePathname } from "next/navigation";

import { GuardedLink } from "@/components/navigation-guard";
import { NavDropdown } from "@/components/nav-dropdown";
import { stripLocalePrefix } from "@/lib/locale-path";
import type { StoreNavItem } from "@/lib/site-navigation";

const navLinkClass =
  "rounded-full px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry";

export function StoreNav({ nav }: { nav: StoreNavItem[] }) {
  const pathname = usePathname();
  // The browser pathname carries the locale prefix (`/ar/shops`); strip it
  // before comparing with the unprefixed nav hrefs.
  const barePathname = stripLocalePrefix(pathname ?? "/");

  return (
    <nav
      aria-label="Store sections"
      className="ml-2 hidden items-center gap-1 lg:flex"
    >
      {nav.map((item) => {
        const active =
          item.href === "/"
            ? barePathname === "/"
            : barePathname === item.href ||
              barePathname.startsWith(`${item.href}/`);

        if (item.items) {
          return (
            <NavDropdown
              key={item.href}
              label={item.label}
              href={item.href}
              items={item.items}
              columns={item.href === "/categories" ? 2 : 1}
              active={active}
            />
          );
        }

        return (
          <GuardedLink
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`${navLinkClass} ${
              active
                ? "bg-berry-soft text-berry-deep"
                : "text-ink-soft hover:bg-berry-soft hover:text-berry-deep"
            }`}
          >
            {item.label}
          </GuardedLink>
        );
      })}
    </nav>
  );
}
