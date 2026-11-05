"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { VendorAccess } from "@/lib/vendor";

const NAV_ITEMS = [
  { label: "Overview", href: "/vendor/overview" },
  { label: "Orders", href: "/vendor/orders" },
  { label: "Products", href: "/vendor/products" },
  { label: "Inventory", href: "/vendor/inventory" },
  { label: "Finance", href: "/vendor/finance" },
] as const;

const FUTURE_ITEMS = [
  "Analytics",
  "Store settings",
  "Help & support",
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/vendor/products") {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  return pathname === href;
}

export function VendorShell({
  shops,
  isPlatformAdmin,
  children,
}: {
  shops: VendorAccess[];
  isPlatformAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const vendorParam = searchParams.get("vendor");
  const currentShop =
    shops.find((shop) => shop.vendorId === vendorParam) ?? shops[0];

  if (!currentShop) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-[70vh]">
      <header className="border-b border-line bg-paper-soft/80">
        <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/vendor/overview?vendor=${currentShop.vendorId}`}
                className="font-display text-lg text-ink transition-colors hover:text-berry"
              >
                Gifto <span className="text-berry">Shops</span>
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium text-ink">
                  {currentShop.vendorName}
                </p>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[0.68rem] font-medium uppercase tracking-wide text-emerald-800">
                  active
                </span>
                <span className="text-xs text-ink-mute">{currentShop.role}</span>
                {isPlatformAdmin ? (
                  <span className="text-xs text-ink-mute">· platform admin</span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {shops.length > 1 ? (
                <label className="flex items-center gap-2 text-xs font-medium text-ink-mute">
                  Shop
                  <select
                    value={currentShop.vendorId}
                    onChange={(event) =>
                      router.push(
                        `/vendor/overview?vendor=${event.target.value}`,
                      )
                    }
                    className="rounded-full border border-line-strong bg-paper px-3 py-1.5 text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-berry/40"
                  >
                    {shops.map((shop) => (
                      <option key={shop.vendorId} value={shop.vendorId}>
                        {shop.vendorName}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <Link
                href={`/shops/${currentShop.vendorSlug}`}
                className="rounded-full border border-line-strong px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:text-berry"
              >
                View shop
              </Link>
              <Link
                href="/account"
                className="rounded-full border border-line-strong px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:text-berry"
              >
                Account
              </Link>
            </div>
          </div>

          <nav
            aria-label="Shop dashboard"
            className="mt-4 flex items-center gap-1 overflow-x-auto pb-1"
          >
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={`${item.href}?vendor=${currentShop.vendorId}`}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-berry/40 ${
                    active
                      ? "bg-berry text-paper"
                      : "text-ink-soft hover:bg-berry-soft hover:text-berry-deep"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            {FUTURE_ITEMS.map((label) => (
              <span
                key={label}
                aria-disabled="true"
                title="Coming soon"
                className="inline-flex shrink-0 cursor-not-allowed items-center rounded-full px-3 py-1.5 text-sm font-medium text-ink-mute/60"
              >
                {label}
                <span className="sr-only"> (coming soon)</span>
              </span>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
        {children}
      </main>
    </div>
  );
}
