"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { ChevronDownIcon, CloseIcon, MenuIcon } from "@/components/icons";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { GuardedLink } from "@/components/navigation-guard";
import { SearchForm } from "@/components/search-form";
import { SignOutButton } from "@/components/sign-out-button";
import type { StoreNavItem } from "@/lib/site-navigation";

type NavLink = { href: string; label: string };

export function MobileNav({
  nav,
  account,
  showSignOut = false,
}: {
  nav: StoreNavItem[];
  account: NavLink[];
  showSignOut?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("common");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function close() {
    setOpen(false);
  }

  return (
    <div className="lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="mobile-menu"
        aria-label={t("openMenu")}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink transition-colors hover:border-berry/40 hover:text-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      <dialog
        ref={dialogRef}
        id="mobile-menu"
        aria-labelledby="mobile-menu-title"
        onClose={() => {
          setOpen(false);
          triggerRef.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto border-0 bg-paper p-0 text-ink shadow-[0_24px_50px_-35px_oklch(0.33_0.13_12/0.6)] backdrop:bg-ink/40"
      >
        <div className="px-5 pb-6 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h2
              id="mobile-menu-title"
              className="font-display text-2xl leading-tight text-ink"
            >
              {t("menu")}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label={t("closeMenu")}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink transition-colors hover:border-berry/40 hover:text-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4">
            <SearchForm autoFocus />
          </div>

          <nav aria-label="Store sections" className="mt-5 flex flex-col">
            {nav.map((item) => {
              if (item.items) {
                return (
                  <details
                    key={item.href}
                    className="group border-b border-line"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between py-3 font-display text-xl text-ink transition-colors hover:text-berry [&::-webkit-details-marker]:hidden">
                      {item.label}
                      <ChevronDownIcon className="h-4 w-4 text-ink-mute transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
                    </summary>
                    <div className="flex flex-col gap-0.5 pb-3">
                      <GuardedLink
                        href={item.href}
                        onClick={close}
                        className="rounded-xl px-3 py-2 text-sm font-medium text-berry transition-colors hover:bg-berry-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
                      >
                        {t("viewAll", { label: item.label.toLowerCase() })}
                      </GuardedLink>
                      {item.items.length > 0 ? (
                        item.items.map((link) => (
                          <GuardedLink
                            key={link.href}
                            href={link.href}
                            onClick={close}
                            className="rounded-xl px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-berry-soft hover:text-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
                          >
                            {link.label}
                          </GuardedLink>
                        ))
                      ) : (
                        <p className="px-3 py-2 text-sm text-ink-mute">
                          {t("nothingPublishedYet")}
                        </p>
                      )}
                    </div>
                  </details>
                );
              }

              return (
                <GuardedLink
                  key={item.href}
                  href={item.href}
                  onClick={close}
                  className="border-b border-line py-3 font-display text-xl text-ink transition-colors hover:text-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
                >
                  {item.label}
                </GuardedLink>
              );
            })}
          </nav>

          <nav
            aria-label={t("account")}
            className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4"
          >
            <LocaleSwitcher />
            {account.map((link) => (
              <GuardedLink
                key={link.href}
                href={link.href}
                onClick={close}
                className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-berry/40 hover:text-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
              >
                {link.label}
              </GuardedLink>
            ))}
            {showSignOut ? (
              <SignOutButton
                label={t("signOut")}
                busyLabel={t("signingOut")}
                className="rounded-full px-4 py-2 text-sm font-medium text-ink-mute transition-colors hover:text-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
                onDone={close}
              />
            ) : null}
          </nav>
        </div>
      </dialog>
    </div>
  );
}
