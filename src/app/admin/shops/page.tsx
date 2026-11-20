import Link from "next/link";

import { Breadcrumb, EmptyState } from "@/components/ui/section";
import { requirePlatformAdmin } from "@/lib/auth";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { fetchAllRows } from "@/lib/fetch-all";

import {
  AdminActionLink,
  AdminFilterPill,
  AdminNotice,
  AdminPageHeader,
  AdminStatStrip,
} from "../ui";
import { VendorControls } from "./vendor-controls";
import { VendorForm } from "./vendor-form";

import type { VendorStatus } from "@/lib/supabase/database.types";

export const metadata = { title: "Shops — Admin — Gifto" };

type VendorRow = {
  id: string;
  name: string;
  slug: string;
  status: VendorStatus;
  commission_rate: number;
  city: string | null;
  governorate: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
};

const STATUS_ORDER: VendorStatus[] = [
  "pending",
  "active",
  "suspended",
  "rejected",
];

const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  pending: "Pending review",
  active: "Active",
  suspended: "Suspended",
  rejected: "Rejected",
};

function isVendorStatus(value: string | undefined): value is VendorStatus {
  return STATUS_ORDER.some((status) => status === value);
}

const STATUS_STYLES: Record<VendorStatus, string> = {
  pending: "border-warning/30 bg-warning-soft text-ink",
  active: "border-success/25 bg-success-soft text-ink",
  suspended: "border-danger/25 bg-danger-soft text-ink",
  rejected: "border-line-strong bg-paper text-ink-mute",
};

function shopsHref(query: string, status: VendorStatus | "all") {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (status !== "all") params.set("status", status);
  const search = params.toString();
  return search ? `/admin/shops?${search}` : "/admin/shops";
}

function formatJoined(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: BUSINESS_TIME_ZONE,
  });
}

export default async function AdminShopsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const params = await searchParams;
  const { supabase } = await requirePlatformAdmin();
  const query = (params.q ?? "").trim().slice(0, 80);
  const statusFilter = isVendorStatus(params.status) ? params.status : "all";

  const result = await fetchAllRows<VendorRow>((from, to) =>
    supabase
      .from("vendors")
      .select(
        "id, name, slug, status, commission_rate, city, governorate, contact_email, contact_phone, created_at",
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to)
      .returns<VendorRow[]>(),
  );

  const vendors = result.rows;
  const counts = STATUS_ORDER.map((status) => ({
    status,
    count: vendors.filter((vendor) => vendor.status === status).length,
  }));
  const visible = vendors.filter((vendor) => {
    if (statusFilter !== "all" && vendor.status !== statusFilter) {
      return false;
    }
    if (!query) return true;

    const haystack = [
      vendor.name,
      vendor.slug,
      vendor.contact_email,
      vendor.contact_phone,
      vendor.city,
      vendor.governorate,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(query.toLowerCase());
  });
  const filtersActive = Boolean(query) || statusFilter !== "all";

  return (
    <div className="w-full">
      <Breadcrumb
        items={[
          { href: "/admin", label: "Administration" },
          { label: "Shops" },
        ]}
      />

      <div className="mt-4">
        <AdminPageHeader
          eyebrow="Partner network"
          title="Shops"
          description="Onboard partners, control storefront access, and set the commission rate that will apply to each shop's future orders."
          actions={
            <AdminActionLink href="/admin/shops#add-shop" primary>
              Onboard a shop
            </AdminActionLink>
          }
        />
      </div>

      <div className="mt-6">
        <AdminStatStrip
          items={[
            {
              label: "Active shops",
              value: result.failed
                ? "—"
                : (counts.find((item) => item.status === "active")?.count ?? 0),
              hint: result.failed ? "Read failed" : "Selling on the storefront",
              emphasis: "positive",
            },
            {
              label: "Pending review",
              value: result.failed
                ? "—"
                : (counts.find((item) => item.status === "pending")?.count ?? 0),
              hint: result.failed ? "Read failed" : "Waiting for activation",
              emphasis:
                (counts.find((item) => item.status === "pending")?.count ?? 0) >
                0
                  ? "warning"
                  : "default",
            },
            {
              label: "Suspended",
              value: result.failed
                ? "—"
                : (counts.find((item) => item.status === "suspended")?.count ??
                  0),
              hint: result.failed ? "Read failed" : "Access paused",
            },
            {
              label: "Total shops",
              value: result.failed ? "—" : vendors.length,
              hint: result.failed
                ? "Read failed"
                : result.truncated
                  ? "Read is incomplete"
                  : "Across Gifto",
              emphasis: "accent",
            },
          ]}
        />
      </div>

      {result.truncated && !result.failed ? (
        <div className="mt-4">
          <AdminNotice tone="warning" role="status">
            The shop list is larger than the current read. Counts and search
            results may be incomplete.
          </AdminNotice>
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0">
          <div className="flex flex-col gap-4 border-b border-line pb-5 lg:flex-row lg:items-center lg:justify-between">
            <nav aria-label="Filter shops by status" className="flex flex-wrap gap-2">
              <AdminFilterPill
                href={shopsHref(query, "all")}
                active={statusFilter === "all"}
              >
                All
                <span className="ml-1.5 text-xs opacity-65">
                  {result.failed ? "—" : vendors.length}
                </span>
              </AdminFilterPill>
              {STATUS_ORDER.map((status) => {
                const count =
                  counts.find((item) => item.status === status)?.count ?? 0;
                return (
                  <AdminFilterPill
                    key={status}
                    href={shopsHref(query, status)}
                    active={statusFilter === status}
                  >
                    {VENDOR_STATUS_LABELS[status]}
                    <span className="ml-1.5 text-xs opacity-65">
                      {result.failed ? "—" : count}
                    </span>
                  </AdminFilterPill>
                );
              })}
            </nav>

            <form
              method="get"
              action="/admin/shops"
              className="flex w-full max-w-sm items-center gap-2"
            >
              {statusFilter !== "all" ? (
                <input type="hidden" name="status" value={statusFilter} />
              ) : null}
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Search shops</span>
                <input
                  type="search"
                  name="q"
                  defaultValue={query}
                  maxLength={80}
                  placeholder="Search name, email, city"
                  className="w-full rounded-full border border-line-strong bg-paper-soft py-2 pl-3.5 pr-3 text-sm text-ink placeholder:text-ink-mute focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/15"
                />
              </label>
              <button
                type="submit"
                className="rounded-full border border-line-strong bg-paper-soft px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft"
              >
                Search
              </button>
              {filtersActive ? (
                <Link
                  href="/admin/shops"
                  className="px-1 text-sm text-ink-mute hover:text-berry-deep"
                >
                  Clear
                </Link>
              ) : null}
            </form>
          </div>

          <p className="mt-4 text-xs text-ink-mute">
            {result.failed
              ? "Shop list unavailable"
              : filtersActive
                ? `${visible.length} of ${vendors.length} shops`
                : `${vendors.length} ${vendors.length === 1 ? "shop" : "shops"}`}
          </p>

          {result.failed ? (
            <div className="mt-4">
              <AdminNotice tone="danger" role="alert">
                Shops could not be loaded. Refresh the page to try again before
                onboarding or changing a shop.
              </AdminNotice>
            </div>
          ) : visible.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title={filtersActive ? "No shops match" : "No shops yet"}
              >
                {filtersActive ? (
                  <>
                    Try another search or{" "}
                    <Link
                      href="/admin/shops"
                      className="font-medium text-berry hover:underline"
                    >
                      clear the filters
                    </Link>
                    .
                  </>
                ) : (
                  <>
                    Use the onboarding form to create the first shop and invite
                    its owner.
                  </>
                )}
              </EmptyState>
            </div>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {visible.map((vendor) => {
                const location =
                  [vendor.city, vendor.governorate].filter(Boolean).join(", ") ||
                  "Location not set";
                const contact =
                  vendor.contact_email ?? vendor.contact_phone ?? "No contact";

                return (
                  <li
                    key={vendor.id}
                    className={`rounded-2xl border p-5 ${
                      vendor.status === "pending"
                        ? "border-warning/35 bg-warning-soft/45"
                        : "border-line bg-paper-soft"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="break-words text-lg font-medium text-ink">
                            {vendor.name}
                          </h2>
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${STATUS_STYLES[vendor.status]}`}
                          >
                            {VENDOR_STATUS_LABELS[vendor.status]}
                          </span>
                        </div>
                        <p className="mt-1 break-all font-mono text-xs text-ink-mute">
                          /shops/{vendor.slug}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
                          <span>{location}</span>
                          <span className="break-all">{contact}</span>
                          <span>Joined {formatJoined(vendor.created_at)}</span>
                          {vendor.status === "active" ? (
                            <Link
                              href={`/shops/${vendor.slug}`}
                              className="font-medium text-berry hover:underline"
                            >
                              View shop
                            </Link>
                          ) : null}
                        </div>
                      </div>

                      <div className="shrink-0 text-left sm:text-right">
                        <p className="font-display text-3xl leading-none tabular-nums text-ink">
                          {(Number(vendor.commission_rate) * 100).toFixed(2)}%
                        </p>
                        <p className="mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-mute">
                          Commission
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <VendorControls vendor={vendor} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside id="add-shop" className="scroll-mt-24">
          <div className="rounded-2xl border border-line bg-paper-soft p-5 xl:sticky xl:top-24">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-berry">
              New partner
            </p>
            <h2 className="mt-2 font-display text-3xl leading-none text-ink">
              Onboard a shop
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              The owner is invited immediately. You control when the storefront
              opens.
            </p>
            <div className="mt-5">
              {result.failed ? (
                <AdminNotice tone="warning" role="status">
                  Onboarding is unavailable until the shop list loads, so a
                  duplicate shop cannot be created by mistake.
                </AdminNotice>
              ) : (
                <VendorForm />
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
