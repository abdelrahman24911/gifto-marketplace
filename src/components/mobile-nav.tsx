"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { CloseIcon, MenuIcon } from "@/components/icons";
import { SearchForm } from "@/components/search-form";
import { SignOutButton } from "@/components/sign-out-button";

type NavLink = { href: string; label: string };

export function MobileNav({
  nav,
  account,
  showSignOut = false,
}: {
  nav: NavLink[];
  account: NavLink[];
  showSignOut?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink transition-colors hover:border-berry/40 hover:text-berry"
      >
        {open ? (
          <CloseIcon className="h-5 w-5" />
        ) : (
          <MenuIcon className="h-5 w-5" />
        )}
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
      </button>

      {open ? (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-full z-40 border-b border-line bg-paper px-5 pb-6 pt-4 shadow-[0_24px_50px_-35px_oklch(0.33_0.13_12/0.6)]"
        >
          <SearchForm autoFocus />

          <nav aria-label="Store sections" className="mt-5 flex flex-col">
            {nav.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="border-b border-line py-3 font-display text-xl text-ink transition-colors hover:text-berry"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <nav
            aria-label="Account"
            className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4"
          >
            {account.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-berry/40 hover:text-berry"
              >
                {link.label}
              </Link>
            ))}
            {showSignOut ? (
              <SignOutButton
                className="rounded-full px-4 py-2 text-sm font-medium text-ink-mute transition-colors hover:text-berry"
                onDone={() => setOpen(false)}
              />
            ) : null}
          </nav>
        </div>
      ) : null}
    </div>
  );
}
