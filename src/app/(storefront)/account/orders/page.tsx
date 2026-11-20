import Link from "next/link";

import { ProductRail } from "@/components/product-rail";
import { requireUser } from "@/lib/auth";
import {
  resolveAccountOrders,
  scopeOrdersToUser,
} from "@/lib/account-orders";
import { loadNewArrivals } from "@/lib/catalog";
import { formatEgp } from "@/lib/money";
import { orderShopsLabel } from "@/lib/order-vendors";
import { loadOrderVendorProfiles } from "@/lib/order-vendors.server";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  isOrderStatus,
} from "@/lib/orders";

export const metadata = { title: "Your orders — Gifto" };

export default async function AccountOrdersPage() {
  const { supabase, user } = await requireUser();

  const [ordersResponse, recommendations] = await Promise.all([
    scopeOrdersToUser(
      supabase
        .from("orders")
        .select(
          "id, status, total_minor, created_at, order_vendors(id, status, vendor_id)",
        ),
      user.id,
    ).order("created_at", { ascending: false }),
    loadNewArrivals(4),
  ]);
  const { data, error } = ordersResponse;

  const ordersResult = resolveAccountOrders(data, error);
  const orders = ordersResult.kind === "loaded" ? ordersResult.orders : [];
  const vendorProfiles = ordersResult.kind === "error"
    ? new Map()
    : await loadOrderVendorProfiles(
        orders.flatMap((order) => order.order_vendors ?? []),
      );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Your orders
      </h1>

      {ordersResult.kind === "error" ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Your orders could not be loaded. Refresh the page to try again.
        </p>
      ) : orders.length === 0 ? (
        <div className="mt-6">
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center">
            <p className="text-sm text-zinc-600">You have no orders yet.</p>
            <Link
              href="/shops"
              className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            >
              Browse shops
            </Link>
          </div>
          {recommendations.ok && recommendations.data.length > 0 ? (
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-zinc-900">
                Gift ideas to get you started
              </h2>
              <div className="mt-4">
                <ProductRail products={recommendations.data} />
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {orders.map((order) => {
            return (
              <li
                key={order.id}
                className="rounded-2xl border border-zinc-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link
                      href={`/account/orders/${order.id}`}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      Order #{order.id.slice(0, 8)}
                    </Link>
                    <p className="text-sm text-zinc-500">
                      {new Date(order.created_at).toLocaleDateString("en-GB", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                      {orderShopsLabel(
                        order.order_vendors ?? [],
                        vendorProfiles,
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-medium text-zinc-900">
                      {formatEgp(order.total_minor)}
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        ORDER_STATUS_STYLES[
                          isOrderStatus(order.status) ? order.status : "placed"
                        ]
                      }`}
                    >
                      {
                        ORDER_STATUS_LABELS[
                          isOrderStatus(order.status) ? order.status : "placed"
                        ]
                      }
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
