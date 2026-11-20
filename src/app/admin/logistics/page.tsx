import Link from "next/link";
import { redirect } from "next/navigation";

import { Pagination } from "@/components/pagination";
import { Breadcrumb, EmptyState } from "@/components/ui/section";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  businessDateFromKey,
  startOfBusinessDay,
  startOfBusinessDayOffset,
} from "@/lib/business-time";
import {
  DEFAULT_PAGE_SIZE,
  clampPage,
  pageWindow,
  parsePage,
} from "@/lib/pagination";

import { AdminPageHeader } from "../ui";

import { formatOrderDateTime } from "../orders/order-shared";

export const metadata = { title: "Logistics — Admin — Gifto" };

function logisticsHref(courier = "", date = "", page = 1) {
  const params = new URLSearchParams();
  if (courier) params.set("courier", courier);
  if (date) params.set("date", date);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/logistics?${query}` : "/admin/logistics";
}

export default async function AdminLogisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ courier?: string; date?: string; page?: string }>;
}) {
  const { courier: courierParam, date: dateParam, page: pageParam } =
    await searchParams;
  const { supabase } = await requirePlatformAdmin();

  // Courier names are matched with ilike, so strip the pattern characters
  // the same way the orders list sanitizes its search term.
  const courier = (courierParam ?? "")
    .replace(/[,()" %_\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const dateParts = businessDateFromKey(dateParam ?? "");
  const dateKey = dateParts
    ? `${String(dateParts.year).padStart(4, "0")}-${String(dateParts.month).padStart(2, "0")}-${String(dateParts.day).padStart(2, "0")}`
    : "";
  const requestedPage = parsePage(pageParam);
  const range = pageWindow(requestedPage);

  // Shipped suborders only: a suborder joins this list when the shop records
  // a courier and tracking reference at handover (P1-15, H-08). Delivered
  // suborders keep their handover record, so they stay listed.
  let listQuery = supabase
    .from("order_vendors")
    .select(
      "id, order_id, status, courier_name, tracking_ref, shipped_at, handed_over_at, delivered_at, order:orders(public_reference), vendor:vendors(name, slug)",
      { count: "exact" },
    )
    .in("status", ["shipped", "delivered"])
    .not("courier_name", "is", null);

  if (courier) {
    listQuery = listQuery.ilike("courier_name", `%${courier}%`);
  }

  if (dateParts) {
    const dayStart = startOfBusinessDay(
      new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day)),
    );
    const dayEnd = startOfBusinessDayOffset(dayStart, -1);
    listQuery = listQuery
      .gte("shipped_at", dayStart.toISOString())
      .lt("shipped_at", dayEnd.toISOString());
  }

  const listResult = await listQuery
    .order("shipped_at", { ascending: false })
    .order("id", { ascending: false })
    .range(range.from, range.to);

  const total = listResult.count ?? 0;
  const currentPage = clampPage(requestedPage, total);

  if (requestedPage > 1 && currentPage !== requestedPage) {
    redirect(logisticsHref(courier, dateKey, currentPage));
  }

  const rows = listResult.data ?? [];

  return (
    <div className="w-full">
      <Breadcrumb
        items={[
          { href: "/admin", label: "Administration" },
          { label: "Logistics" },
        ]}
      />

      <div className="mt-4">
        <AdminPageHeader
          eyebrow="Operations"
          title="Logistics"
          description="Shipped suborders and their courier handover record: courier, tracking reference and handover time. Couriers are recorded by the shop at shipment; there is no live tracking integration."
        />
      </div>

      <section className="mt-8">
        <form
          action="/admin/logistics"
          method="get"
          className="flex flex-wrap items-center gap-2"
        >
          <label htmlFor="admin-logistics-courier" className="sr-only">
            Filter by courier
          </label>
          <input
            id="admin-logistics-courier"
            name="courier"
            type="search"
            defaultValue={courier}
            maxLength={80}
            placeholder="Courier name"
            className="w-full min-w-0 rounded-full border border-line-strong bg-paper px-4 py-2 text-sm text-ink sm:w-64"
          />
          <label htmlFor="admin-logistics-date" className="sr-only">
            Filter by shipped date
          </label>
          <input
            id="admin-logistics-date"
            name="date"
            type="date"
            defaultValue={dateKey}
            className="rounded-full border border-line-strong bg-paper px-4 py-2 text-sm text-ink"
          />
          <button
            type="submit"
            className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep"
          >
            Filter
          </button>
          {courier || dateKey ? (
            <Link
              href="/admin/logistics"
              className="text-xs font-medium text-berry hover:text-berry-deep"
            >
              Clear filters
            </Link>
          ) : null}
        </form>

        {listResult.error ? (
          <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            The logistics list could not be loaded. Try again.
          </p>
        ) : rows.length === 0 ? (
          <div className="mt-6">
            <EmptyState title="No shipped suborders">
              Nothing has been handed to a courier yet, or nothing matches
              the current filters.
            </EmptyState>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-paper">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
                  <th scope="col" className="px-4 py-3">
                    Order
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Shop
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Courier
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Tracking
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Handed over
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const orderRef = Array.isArray(row.order)
                    ? row.order[0]?.public_reference
                    : row.order?.public_reference;
                  const vendorName = Array.isArray(row.vendor)
                    ? row.vendor[0]?.name
                    : row.vendor?.name;
                  return (
                    <tr key={row.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">
                        {orderRef ? (
                          <Link
                            href={`/admin/orders/${row.order_id}`}
                            className="font-medium text-berry hover:text-berry-deep"
                          >
                            {orderRef}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">{vendorName ?? "—"}</td>
                      <td className="px-4 py-3">{row.courier_name ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {row.tracking_ref ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {row.handed_over_at
                          ? formatOrderDateTime(row.handed_over_at)
                          : row.shipped_at
                            ? formatOrderDateTime(row.shipped_at)
                            : "—"}
                      </td>
                      <td className="px-4 py-3 capitalize">{row.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6">
          <Pagination
            page={currentPage}
            total={total}
            pageSize={DEFAULT_PAGE_SIZE}
            buildHref={(page) => logisticsHref(courier, dateKey, page)}
          />
        </div>
      </section>
    </div>
  );
}
