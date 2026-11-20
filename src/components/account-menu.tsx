"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { ChevronDownIcon, UserIcon } from "@/components/icons";
import { GuardedLink } from "@/components/navigation-guard";
import { SignOutButton } from "@/components/sign-out-button";
import { stripLocalePrefix } from "@/lib/locale-path";

type AccountLink = {
  href: string;
  label: string;
};

export function AccountMenu({
  signedIn,
  links,
  showSignOut,
  className = "",
}: {
  signedIn: boolean;
  links: AccountLink[];
  showSignOut: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("common");
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const topHref = signedIn ? "/account" : "/login";
  const topLabel = signedIn ? t("account") : t("signIn");
  // The browser pathname carries the locale prefix (`/ar/account`); strip
  // it before comparing so the current-page state works in both locales.
  const barePathname = stripLocalePrefix(pathname ?? "/");

  return (
    <div ref={containerRef} className={`relative flex items-center ${className}`}>
      <GuardedLink
        href={topHref}
        aria-current={
          barePathname === topHref || barePathname.startsWith(`${topHref}/`)
            ? "page"
            : undefined
        }
        className="inline-flex h-10 items-center gap-1.5 rounded-full pl-3 pr-1 text-sm font-medium text-ink-soft transition-colors hover:bg-berry-soft hover:text-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
      >
        <UserIcon className="h-5 w-5" />
        <span>{topLabel}</span>
      </GuardedLink>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? t("closeAccountMenu") : t("openAccountMenu")}
        className="inline-flex h-8 w-7 items-center justify-center rounded-full text-ink-mute transition-colors hover:bg-berry-soft hover:text-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
      >
        <ChevronDownIcon
          className={`h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <div
          id={panelId}
          className="absolute end-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_24px_60px_-34px_oklch(0.28_0.03_40/0.45)]"
        >
          <nav aria-label="Account" className="max-h-[70vh] overflow-y-auto p-2">
            {links.map((link) => (
              <GuardedLink
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-berry-soft hover:text-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
              >
                {link.label}
              </GuardedLink>
            ))}
          </nav>
          {showSignOut ? (
            <div className="border-t border-line p-2">
              <SignOutButton
                label={t("signOut")}
                busyLabel={t("signingOut")}
                className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-ink-mute transition-colors hover:bg-berry-soft hover:text-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
                onDone={() => setOpen(false)}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
