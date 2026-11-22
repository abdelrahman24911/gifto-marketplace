import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { Link, redirect } from "@/i18n/navigation";
import { localePrefixFor } from "@/lib/locale-path";
import { pageMetadata } from "@/lib/metadata";
import type { AppLocale } from "@/i18n/routing";
import type { MoneyLocale } from "@/lib/money";

import { Pagination } from "@/components/pagination";
import { ProductRail } from "@/components/product-rail";
import { requireUser } from "@/lib/auth";
import {
  resolveAccountOrders,
  scopeOrdersToUser,
} from "@/lib/account-orders";
import { loadNewArrivals } from "@/lib/catalog";
import { formatEgp } from "@/lib/money";
import type { OrderStatus } from "@/lib/supabase/database.types";
import { orderShopsLabel } from "@/lib/order-vendors";
import { loadOrderVendorProfiles } from "@/lib/order-vendors.server";
import { ORDER_STATUS_STYLES, isOrderStatus } from "@/lib/orders";
import {
  clampPage,
  DEFAULT_PAGE_SIZE,
  pageWindow,
  parsePage,
  totalPages,
} from "@/lib/pagination";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("account");
  return pageMetadata({
    title: `${t("ordersTitle")} — Gifto`,
    description: t("ordersTitle"),
    path: `${localePrefixFor(locale)}/account/orders`,
  });
}

type Props = {
  searchParams: Promise<{ page?: string }>;
};

export default async function AccountOrdersPage({ searchParams }: Props) {
  const t = await getTranslations("account");
  const to = await getTranslations("order");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as AppLocale;
  const moneyLocale = locale as MoneyLocale;
  const dateLocale = locale === "ar" ? "ar-EG" : "en-GB";
  const statusLabels: Record<OrderStatus, string> = {
    placed: to("statusPlaced"),
    confirmed: to("statusConfirmed"),
    shipped: to("statusShipped"),
    delivered: to("statusDelivered"),
    cancelled: to("statusCancelled"),
    returned: to("statusReturned"),
    partially_completed: to("statusPartiallyCompleted"),
  };
  const { supabase, user } = await requireUser();
  const { page: pageParam } = await searchParams;
  const requestedPage = parsePage(pageParam);
  const window = pageWindow(requestedPage, DEFAULT_PAGE_SIZE);

  const [ordersResponse, recommendations] = await Promise.all([
    scopeOrdersToUser(
      supabase
        .from("orders")
        .select(
          "id, status, total_minor, created_at, order_vendors(id, status, vendor_id)",
          { count: "exact" },
        ),
      user.id,
    )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(window.from, window.to),
    loadNewArrivals(4),
  ]);
  const { data, error, count } = ordersResponse;

  // The exact count replaces the silent 1,000-row PostgREST cap: the page
  // shows the real total and paginates against it.
  const total = typeof count === "number" ? count : 0;
  const page = clampPage(requestedPage, total, DEFAULT_PAGE_SIZE);

  if (!error && total > 0 && requestedPage > totalPages(total, DEFAULT_PAGE_SIZE)) {
    redirect({ href: `/account/orders?page=${page}`, locale });
  }

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
        {t("ordersTitle")}
      </h1>

      {ordersResult.kind === "error" ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {t("ordersLoadError")}
        </p>
      ) : orders.length === 0 ? (
        <div className="mt-6">
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center">
            <p className="text-sm text-zinc-600">{t("noOrders")}</p>
            <Link
              href="/shops"
              className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            >
              {tc("browseShops")}
            </Link>
          </div>
          {recommendations.ok && recommendations.data.length > 0 ? (
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-zinc-900">
                {t("giftIdeas")}
              </h2>
              <div className="mt-4">
                <ProductRail products={recommendations.data} />
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm text-zinc-500">
            {t("ordersCount", { total })}
          </p>
          <ul className="mt-3 flex flex-col gap-3">
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
                      {t("orderNumber", { id: order.id.slice(0, 8) })}
                    </Link>
                    <p className="text-sm text-zinc-500">
                      {new Date(order.created_at).toLocaleDateString(dateLocale, {
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
                      {formatEgp(order.total_minor, moneyLocale)}
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        ORDER_STATUS_STYLES[
                          isOrderStatus(order.status) ? order.status : "placed"
                        ]
                      }`}
                    >
                      {
                        statusLabels[
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
          <Pagination
            page={page}
            total={total}
            pageSize={DEFAULT_PAGE_SIZE}
            buildHref={(nextPage) =>
              nextPage <= 1
                ? "/account/orders"
                : `/account/orders?page=${nextPage}`
            }
            label={t("ordersPagination")}
          />
        </>
      )}
    </div>
  );
}
