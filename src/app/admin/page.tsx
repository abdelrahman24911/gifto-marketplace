import Link from "next/link";

import { BarChart } from "@/components/bar-chart";
import { Breadcrumb } from "@/components/ui/section";
import {
  adminAnalyticsWindowStart,
  computeAdminMarketplaceMetrics,
} from "@/lib/admin-metrics";
import { requirePlatformAdmin } from "@/lib/auth";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { fetchAllRows } from "@/lib/fetch-all";
import { formatEgp } from "@/lib/money";
import { ORDER_STATUS_LABELS } from "@/lib/orders";

import {
  AdminActionLink,
  AdminNotice,
  AdminPageHeader,
  AdminSectionHeading,
  AdminStatStrip,
} from "./ui";

import type {
  AdminCommissionRecord,
  AdminOrderRecord,
} from "@/lib/admin-metrics";
import type {
  OrderStatus,
  VendorStatus,
} from "@/lib/supabase/database.types";

export const metadata = { title: "Overview — Admin — Gifto" };

type VendorRow = {
  id: string;
  name: string;
  slug: string;
  status: VendorStatus;
  city: string | null;
  governorate: string | null;
  created_at: string;
};

type RecentOrderRow = {
  id: string;
  public_reference: string | null;
  status: OrderStatus;
  subtotal_minor: number;
  created_at: string;
  order_vendors: {
    id: string;
    status: OrderStatus;
    vendor: { name: string } | null;
  }[];
};

const ATTENTION_STATUSES: OrderStatus[] = [
  "placed",
  "confirmed",
  "shipped",
];

const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  pending: "Pending review",
  active: "Active",
  suspended: "Suspended",
  rejected: "Rejected",
};

const VENDOR_STATUS_STYLES: Record<VendorStatus, string> = {
  pending: "border-warning/30 bg-warning-soft text-ink",
  active: "border-success/25 bg-success-soft text-ink",
  suspended: "border-danger/25 bg-danger-soft text-ink",
  rejected: "border-line-strong bg-paper text-ink-mute",
};

function orderRef(order: Pick<RecentOrderRow, "id" | "public_reference">) {
  return order.public_reference ?? `#${order.id.slice(0, 8)}`;
}

function shopNames(order: RecentOrderRow) {
  const names = (order.order_vendors ?? [])
    .map((line) => line.vendor?.name)
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? names.join(", ") : "Shop not recorded";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: BUSINESS_TIME_ZONE,
  });
}

export default async function AdminPage() {
  const { supabase } = await requirePlatformAdmin();
  const now = new Date();
  const windowStart = adminAnalyticsWindowStart("30d", now);

  const [
    ordersResult,
    commissionsResult,
    vendorsResult,
    attentionResult,
    attentionOrdersResult,
    recentOrdersResult,
    openRefundsResult,
  ] = await Promise.all([
    fetchAllRows<AdminOrderRecord>((from, to) =>
      supabase
        .from("orders")
        .select("id, status, subtotal_minor, created_at")
        .gte("created_at", windowStart.toISOString())
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<AdminOrderRecord[]>(),
    ),
    fetchAllRows<AdminCommissionRecord>((from, to) =>
      supabase
        .from("commission_entries")
        .select(
          "id, vendor_id, status, amount_minor, base_minor, earned_at, reversed_at",
        )
        .gte("earned_at", windowStart.toISOString())
        .order("earned_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<AdminCommissionRecord[]>(),
    ),
    fetchAllRows<VendorRow>((from, to) =>
      supabase
        .from("vendors")
        .select("id, name, slug, status, city, governorate, created_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<VendorRow[]>(),
    ),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", ATTENTION_STATUSES),
    supabase
      .from("orders")
      .select(
        "id, public_reference, status, subtotal_minor, created_at, order_vendors(id, status, vendor:vendors(name))",
      )
      .in("status", ATTENTION_STATUSES)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(5),
    supabase
      .from("orders")
      .select(
        "id, public_reference, status, subtotal_minor, created_at, order_vendors(id, status, vendor:vendors(name))",
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(6),
    supabase
      .from("refund_cases")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
  ]);

  const metrics = computeAdminMarketplaceMetrics(
    ordersResult.rows,
    commissionsResult.rows,
    "30d",
    now,
  );
  const vendors = vendorsResult.rows;
  const activeShops = vendors.filter(
    (vendor) => vendor.status === "active",
  ).length;
  const pendingShops = vendors.filter(
    (vendor) => vendor.status === "pending",
  ).length;
  const attentionCount = attentionResult.count ?? 0;
  const openRefunds = openRefundsResult.error
    ? null
    : (openRefundsResult.count ?? 0);
  const attentionOrders = (attentionOrdersResult.data ?? []) as RecentOrderRow[];
  const recentOrders = (recentOrdersResult.data ?? []) as RecentOrderRow[];
  const newestShops = vendors.slice(0, 5);
  const incomplete =
    ordersResult.failed ||
    ordersResult.truncated ||
    commissionsResult.failed ||
    commissionsResult.truncated ||
    Boolean(openRefundsResult.error);
  const shopsIncomplete = vendorsResult.failed || vendorsResult.truncated;

  return (
    <div className="w-full">
      <Breadcrumb items={[{ label: "Administration" }]} />

      <div className="mt-4">
        <AdminPageHeader
          eyebrow="Marketplace pulse"
          title="Overview"
          description="A working view of demand, money earned, and the shops that need your attention. Last 30 days unless stated otherwise."
          actions={
            <>
              <AdminActionLink href="/admin/analytics">
                Full analytics
              </AdminActionLink>
              <AdminActionLink href="/admin/shops#add-shop" primary>
                Onboard a shop
              </AdminActionLink>
            </>
          }
        />
      </div>

      {incomplete || shopsIncomplete ? (
        <div className="mt-4">
          <AdminNotice tone="warning" role="alert">
            Part of this overview could not be read in full. Values marked with
            a dash or shown as partial are not exact. Refresh the page to try
            again.
          </AdminNotice>
        </div>
      ) : null}

      <div className="mt-6">
        <AdminStatStrip
          items={[
            {
              label: "Placed GMV · 30d",
              value: ordersResult.failed ? "—" : formatEgp(metrics.gmvMinor),
              hint: "Product subtotal, delivery excluded",
              emphasis: "accent",
            },
            {
              label: "Orders · 30d",
              value: ordersResult.failed
                ? "—"
                : metrics.totalOrders.toLocaleString("en-US"),
              hint: "Every status, by placed date",
            },
            {
              label: "Active shops",
              value: vendorsResult.failed ? "—" : activeShops,
              hint:
                vendorsResult.failed
                  ? "Shop data unavailable"
                  : `${pendingShops} pending review`,
              emphasis: pendingShops > 0 ? "warning" : "positive",
            },
            {
              label: "Commission · 30d",
              value: commissionsResult.failed
                ? "—"
                : formatEgp(metrics.commissionEarnedMinor),
              hint: "Earned on delivery only — placed orders that have not been delivered yet earn nothing",
              emphasis: "positive",
            },
          ]}
        />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-line bg-paper-soft p-5">
          <AdminSectionHeading
            title="Demand, last 30 days"
            description="Placed GMV by day · all order statuses · delivery fees excluded"
            href="/admin/analytics"
            linkLabel="Explore analytics"
          />
          {ordersResult.failed ? (
            <div className="mt-4">
              <AdminNotice tone="danger" role="alert">
                Order demand is unavailable right now.
              </AdminNotice>
            </div>
          ) : (
            <BarChart
              points={metrics.gmvSeries}
              formatValue={formatEgp}
              ariaLabel="Placed GMV by day for the last 30 days"
              emptyLabel="No orders were placed in the last 30 days."
              tone="berry"
            />
          )}
        </section>

        <section className="rounded-2xl border border-berry/20 bg-berry-soft p-5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-berry-deep">
            Needs attention
          </p>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div>
              <p className="font-display text-5xl leading-none tabular-nums text-ink">
                {attentionResult.error ? "—" : attentionCount}
              </p>
              <p className="mt-2 max-w-40 text-sm leading-relaxed text-ink-soft">
                orders waiting to be confirmed, shipped, or delivered
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-3xl leading-none tabular-nums text-ink">
                {vendorsResult.failed ? "—" : pendingShops}
              </p>
              <p className="mt-1 text-xs text-ink-soft">shops pending</p>
            </div>
          </div>

          {attentionOrdersResult.error ? (
            <p className="mt-4 text-xs text-ink-soft">
              Attention queue unavailable.
            </p>
          ) : attentionOrders.length === 0 ? (
            <p className="mt-4 rounded-xl border border-berry/15 bg-paper/70 px-3 py-3 text-sm text-ink-soft">
              Nothing is stuck. The operational queue is clear.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {attentionOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    href="/admin/orders?status=attention"
                    className="flex items-center justify-between gap-3 rounded-xl border border-berry/15 bg-paper/70 px-3 py-2.5 transition-colors hover:border-berry/35 hover:bg-paper"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">
                        {orderRef(order)}
                      </span>
                      <span className="block truncate text-xs text-ink-mute">
                        {ORDER_STATUS_LABELS[order.status]} ·{" "}
                        {shopNames(order)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-berry-deep">
                      Review
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={
                pendingShops > 0
                  ? "/admin/shops?status=pending"
                  : "/admin/shops"
              }
              className="rounded-full border border-berry/25 bg-paper px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-berry/50"
            >
              {pendingShops > 0 ? "Review pending shops" : "Manage shops"}
            </Link>
            <Link
              href="/admin/refunds"
              className="rounded-full border border-berry/25 bg-paper px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-berry/50"
            >
              {openRefunds ? `Refund queue (${openRefunds})` : "Refund queue"}
            </Link>
            <Link
              href="/admin/support"
              className="rounded-full border border-berry/25 bg-paper px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-berry/50"
            >
              Support queue
            </Link>
          </div>
        </section>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section>
          <AdminSectionHeading
            title="Latest orders"
            description="Newest across every shop and status"
            href="/admin/orders"
            linkLabel="All orders"
          />
          {recentOrdersResult.error ? (
            <div className="mt-4">
              <AdminNotice tone="danger" role="alert">
                Recent orders could not be loaded.
              </AdminNotice>
            </div>
          ) : recentOrders.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-line-strong bg-paper-soft px-4 py-8 text-center text-sm text-ink-soft">
              No orders have been placed yet.
            </p>
          ) : (
            <ul className="mt-4 overflow-hidden rounded-2xl border border-line bg-paper-soft">
              {recentOrders.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {orderRef(order)}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink-mute">
                      {shopNames(order)} · {formatDate(order.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="rounded-full border border-line-strong bg-paper px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-ink-soft">
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                    <span className="text-sm tabular-nums text-ink">
                      {formatEgp(order.subtotal_minor)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <AdminSectionHeading
            title="New shops"
            description="Freshest partners in the network"
            href="/admin/shops"
            linkLabel="Manage shops"
          />
          {vendorsResult.failed ? (
            <div className="mt-4">
              <AdminNotice tone="danger" role="alert">
                Shop data could not be loaded.
              </AdminNotice>
            </div>
          ) : newestShops.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-line-strong bg-paper-soft px-4 py-8 text-center text-sm text-ink-soft">
              No shops yet. Onboard the first partner.
            </p>
          ) : (
            <ul className="mt-4 overflow-hidden rounded-2xl border border-line bg-paper-soft">
              {newestShops.map((vendor) => (
                <li
                  key={vendor.id}
                  className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {vendor.name}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-mute">
                      {[vendor.city, vendor.governorate]
                        .filter(Boolean)
                        .join(", ") || "Location not set"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide ${VENDOR_STATUS_STYLES[vendor.status]}`}
                  >
                    {VENDOR_STATUS_LABELS[vendor.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link
              href="/admin/categories"
              className="rounded-xl border border-line bg-paper-soft px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-berry/30 hover:bg-berry-soft"
            >
              Categories
            </Link>
            <Link
              href="/admin/settlements"
              className="rounded-xl border border-line bg-paper-soft px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-berry/30 hover:bg-berry-soft"
            >
              Settlements
            </Link>
            <Link
              href="/admin/commissions"
              className="rounded-xl border border-line bg-paper-soft px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-berry/30 hover:bg-berry-soft"
            >
              Commissions
            </Link>
            <Link
              href="/admin/products"
              className="rounded-xl border border-line bg-paper-soft px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-berry/30 hover:bg-berry-soft"
            >
              Products
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
