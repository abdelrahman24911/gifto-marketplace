"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { CloseIcon, GiftoMark, MenuIcon, UserIcon } from "@/components/icons";
import { GuardedLink } from "@/components/navigation-guard";
import { SignOutButton } from "@/components/sign-out-button";
import { ArrowUpRightIcon, DashboardIcon } from "./icons";

import type {
  DashboardNavGroup,
  DashboardNavItem,
  DashboardShop,
  DashboardUser,
} from "./types";

type DashboardShellProps = {
  variant: "admin" | "vendor";
  navGroups: DashboardNavGroup[];
  user: DashboardUser;
  brandHref: string;
  storefrontHref: string;
  isPlatformAdmin?: boolean;
  shops?: DashboardShop[];
  children: ReactNode;
};

function isActive(pathname: string, item: DashboardNavItem) {
  const itemPath = item.href.split("?")[0];
  if (item.exact) return pathname === itemPath;
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

function initials(email?: string) {
  const first = email?.trim().charAt(0);
  return first ? first.toUpperCase() : "G";
}

function SidebarContent({
  variant,
  navGroups,
  user,
  brandHref,
  isPlatformAdmin,
  shops,
  currentShop,
  currentPath,
  onShopChange,
  onNavigate,
  onClose,
  closeButtonRef,
}: {
  variant: "admin" | "vendor";
  navGroups: DashboardNavGroup[];
  user: DashboardUser;
  brandHref: string;
  isPlatformAdmin?: boolean;
  shops: DashboardShop[];
  currentShop?: DashboardShop;
  currentPath: string;
  onShopChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onNavigate?: () => void;
  onClose?: () => void;
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
}) {
  const roleLabel =
    variant === "vendor" && currentShop?.role
      ? currentShop.role
      : user.roleLabel;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 px-5 pb-5 pt-6">
        <GuardedLink
          href={brandHref}
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-paper shadow-[0_10px_30px_-18px_oklch(0.12_0.03_20/0.9)]">
            <GiftoMark className="h-7 w-7" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-xl leading-none text-paper">
              Gifto
            </span>
            <span className="mt-1 block truncate text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-paper/50">
              {variant === "admin" ? "Platform console" : "Shop dashboard"}
            </span>
          </span>
        </GuardedLink>

        {onClose ? (
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-paper/15 text-paper/70 transition-colors hover:border-paper/35 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            <CloseIcon className="h-5 w-5" />
            <span className="sr-only">Close navigation</span>
          </button>
        ) : null}
      </div>

      <div className="mx-5 h-px bg-paper/10" />

      {shops.length > 1 ? (
        <div className="px-5 py-4">
          <label className="block">
            <span className="block text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-paper/40">
              Active shop
            </span>
            <select
              value={currentShop?.id ?? ""}
              onChange={onShopChange}
              className="mt-2 w-full rounded-xl border border-paper/15 bg-paper/[0.06] px-3 py-2 text-sm text-paper focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/25"
            >
              {shops.map((shop) => (
                <option
                  key={shop.id}
                  value={shop.id}
                  className="bg-paper text-ink"
                >
                  {shop.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <nav
        aria-label={
          variant === "admin" ? "Admin dashboard" : "Shop dashboard"
        }
        className="flex-1 overflow-y-auto px-3 py-5"
      >
        {navGroups.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            <p className="px-3 pb-2 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-paper/40">
              {group.label}
            </p>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active = isActive(currentPath, item);
                return (
                  <li key={item.href}>
                    <GuardedLink
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                        active
                          ? "bg-paper/10 font-medium text-paper ring-1 ring-inset ring-paper/10"
                          : "text-paper/65 hover:bg-paper/[0.06] hover:text-paper"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                          active
                            ? "bg-gold"
                            : "bg-paper/25 group-hover:bg-paper/50"
                        }`}
                      />
                      <DashboardIcon
                        name={item.icon}
                        className="h-[1.15rem] w-[1.15rem] shrink-0"
                      />
                      <span className="truncate">{item.label}</span>
                    </GuardedLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-paper/10 p-4">
        <div className="rounded-2xl bg-paper/[0.06] p-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold-soft text-sm font-semibold text-wine-deep">
              {initials(user.email)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-paper">
                {user.email ?? "Signed in"}
              </p>
              <p className="mt-0.5 truncate text-[0.68rem] capitalize text-paper/55">
                {roleLabel}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-paper/10 pt-3">
            {variant === "vendor" && isPlatformAdmin ? (
              <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-gold-soft">
                Platform admin
              </span>
            ) : (
              <GuardedLink
                href="/account"
                onClick={onNavigate}
                className="text-[0.68rem] font-medium text-paper/55 transition-colors hover:text-paper"
              >
                Account
              </GuardedLink>
            )}
            <SignOutButton
              className="text-[0.68rem] font-medium text-paper/55 transition-colors hover:text-paper disabled:opacity-60"
              onDone={onClose}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function DashboardShell({
  variant,
  navGroups,
  user,
  brandHref,
  storefrontHref,
  isPlatformAdmin = false,
  shops = [],
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);

  const requestedShop = searchParams.get("vendor");
  const currentShop =
    shops.find((shop) => shop.id === requestedShop) ?? shops[0];

  function shopHref(href: string) {
    if (variant !== "vendor" || !currentShop) return href;
    const [path, query = ""] = href.split("?");
    const params = new URLSearchParams(query);
    params.set("vendor", currentShop.id);
    return `${path}?${params.toString()}`;
  }

  const resolvedBrandHref = shopHref(brandHref);
  const resolvedStorefrontHref =
    variant === "vendor" && currentShop
      ? `/shops/${currentShop.slug}`
      : storefrontHref;

  const resolvedNavGroups = navGroups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      href: shopHref(item.href),
    })),
  }));

  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    const menuButton = menuButtonRef.current;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      menuButton?.focus();
    };
  }, [mobileOpen]);

  function handlePanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;

    const panel = mobilePanelRef.current;
    if (!panel) return;

    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.offsetParent !== null);

    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleShopChange(event: ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("vendor", event.target.value);
    params.delete("page");
    const path = pathname.startsWith("/vendor/products/")
      ? "/vendor/products"
      : pathname;
    router.push(`${path}?${params.toString()}`);
    setMobileOpen(false);
  }

  const headerTitle =
    variant === "vendor"
      ? (currentShop?.name ?? "Shop dashboard")
      : "Platform administration";
  const headerEyebrow = variant === "vendor" ? "Shop" : "Gifto platform";

  const sidebarProps = {
    variant,
    navGroups: resolvedNavGroups,
    user,
    brandHref: resolvedBrandHref,
    isPlatformAdmin,
    shops,
    currentShop,
    currentPath: pathname,
    onShopChange: handleShopChange,
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a
        href="#dashboard-main"
        className="fixed left-4 top-4 z-[70] -translate-y-24 rounded-full bg-berry px-4 py-2 text-sm font-medium text-paper shadow-lg transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-canvas"
      >
        Skip to dashboard content
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-wine-deep/40 bg-wine lg:flex">
        <SidebarContent {...sidebarProps} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            aria-hidden
            className="absolute inset-0 bg-wine-deep/55 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
          />
          <div
            id="dashboard-nav-mobile"
            ref={mobilePanelRef}
            role="dialog"
            aria-modal="true"
            aria-label={
              variant === "admin" ? "Admin navigation" : "Shop navigation"
            }
            onKeyDown={handlePanelKeyDown}
            className="relative flex h-full w-[min(20rem,88vw)] flex-col bg-wine shadow-2xl"
          >
            <SidebarContent
              {...sidebarProps}
              onNavigate={() => setMobileOpen(false)}
              onClose={() => setMobileOpen(false)}
              closeButtonRef={closeButtonRef}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-h-screen min-w-0 flex-col lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-line/80 bg-canvas/90 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-[88rem] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-expanded={mobileOpen}
              aria-controls="dashboard-nav-mobile"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line-strong bg-paper text-ink transition-colors hover:border-berry/40 hover:text-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry lg:hidden"
            >
              <MenuIcon className="h-5 w-5" />
              <span className="sr-only">Open dashboard navigation</span>
            </button>

            <div className="min-w-0">
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-berry">
                {headerEyebrow}
              </p>
              <p className="truncate text-sm font-medium text-ink">
                {headerTitle}
              </p>
            </div>

            <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
              <GuardedLink
                href={resolvedStorefrontHref}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong bg-paper px-3 text-xs font-medium text-ink transition-colors hover:border-berry/40 hover:text-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
              >
                <span className="hidden sm:inline">
                  {variant === "admin" ? "View storefront" : "View shop"}
                </span>
                <span className="sm:hidden">
                  {variant === "admin" ? "Store" : "Shop"}
                </span>
                <ArrowUpRightIcon className="h-3.5 w-3.5" />
              </GuardedLink>

              <GuardedLink
                href="/account"
                className="hidden h-9 w-9 place-items-center rounded-full border border-line-strong bg-paper text-ink-soft transition-colors hover:border-berry/40 hover:text-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry sm:grid"
              >
                <UserIcon className="h-4 w-4" />
                <span className="sr-only">Account</span>
              </GuardedLink>
            </div>
          </div>
        </header>

        <main
          id="dashboard-main"
          className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          <div className="mx-auto w-full max-w-[88rem]">{children}</div>
        </main>
      </div>
    </div>
  );
}
