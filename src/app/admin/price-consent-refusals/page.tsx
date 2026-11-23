import { redirect } from "next/navigation";

import { Pagination } from "@/components/pagination";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { Breadcrumb, EmptyState } from "@/components/ui/section";
import { requirePlatformAdmin } from "@/lib/auth";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { formatEgp } from "@/lib/money";
import {
  DEFAULT_PAGE_SIZE,
  clampPage,
  pageWindow,
  parsePage,
} from "@/lib/pagination";

import { AdminNotice, AdminPageHeader } from "../ui";

export const metadata = { title: "Price-change refusals — Admin — Gifto" };

type RefusalRow = {
  id: string;
  idempotency_key: string;
  user_id: string | null;
  guest_token_hash: string | null;
  expected_prices: unknown;
  expected_total_minor: number;
  live_total_minor: number;
  created_at: string;
};

type ExpectedLine = {
  product_id: string;
  unit_price_minor: number;
};

function expectedLines(value: unknown): ExpectedLine[] {
  if (!Array.isArray(value)) return [];
  const lines: ExpectedLine[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as {
      product_id?: unknown;
      unit_price_minor?: unknown;
    };
    if (
      typeof record.product_id === "string" &&
      typeof record.unit_price_minor === "number"
    ) {
      lines.push({
        product_id: record.product_id,
        unit_price_minor: record.unit_price_minor,
      });
    }
  }
  return lines;
}

function refusalsHref(page = 1) {
  return page > 1
    ? `/admin/price-consent-refusals?page=${page}`
    : "/admin/price-consent-refusals";
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BUSINESS_TIME_ZONE,
  });
}

/**
 * Price-change refusals (migration 64, S-08/S-12): checkout attempts
 * refused with PRICE_CHANGED, one append-only row per attempt. No order
 * was created for these attempts, so there is no order to link to —
 * the row is the audit record of what the customer was shown versus
 * what the live prices were. Read-only: the trail is written only by
 * the service-role recorder and cannot be edited from the app.
 */
export default async function AdminPriceConsentRefusalsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const { supabase } = await requirePlatformAdmin();

  const requestedPage = parsePage(pageParam);
  const range = pageWindow(requestedPage);

  const listResult = await supabase
    .from("price_consent_refusals")
    .select(
      "id, idempotency_key, user_id, guest_token_hash, expected_prices, expected_total_minor, live_total_minor, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(range.from, range.to);

  const total = listResult.count ?? 0;
  const currentPage = clampPage(requestedPage, total);

  if (requestedPage > 1 && currentPage !== requestedPage) {
    redirect(refusalsHref(currentPage));
  }

  const refusals = (listResult.data ?? []) as unknown as RefusalRow[];
  const pageCount = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  // Resolve who attempted (signed-in profile name/email) and what the
  // expected lines were for (product names), so a dispute can be
  // answered from names instead of bare UUIDs.
  const userIds = Array.from(
    new Set(
      refusals
        .map((row) => row.user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const { data: profileData } = userIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds)
    : { data: [] };
  const profiles = new Map(
    ((profileData ?? []) as unknown as {
      id: string;
      full_name: string | null;
      email: string;
    }[]).map((row) => [row.id, row]),
  );

  const productIds = Array.from(
    new Set(
      refusals.flatMap((row) =>
        expectedLines(row.expected_prices).map((line) => line.product_id),
      ),
    ),
  );
  const { data: productData } = productIds.length
    ? await supabase
        .from("products")
        .select("id, name")
        .in("id", productIds)
    : { data: [] };
  const productNames = new Map(
    ((productData ?? []) as unknown as { id: string; name: string }[]).map(
      (row) => [row.id, row.name],
    ),
  );

  return (
    <div className="w-full">
      <Breadcrumb
        items={[
          { href: "/admin", label: "Admin" },
          { label: "Price-change refusals" },
        ]}
      />
      <AdminPageHeader
        title="Price-change refusals"
        description="Checkout attempts refused because a price changed since the customer saw it. No order was created for these attempts — the row records what the customer was shown versus the live prices, so a dispute can be answered without a database query."
      />

      {listResult.error ? (
        <div className="mt-4">
          {listResult.error.code === "PGRST205" ? (
            <AdminNotice tone="warning" role="status">
              Price-change refusal records are waiting for migration 64 to be
              applied to the hosted database. The page is ready, but no audit
              records can be shown until it is deployed.
            </AdminNotice>
          ) : (
            <>
              <AdminNotice tone="danger" role="alert">
                Price-change refusals could not be loaded.
              </AdminNotice>
              <RefreshButton />
            </>
          )}
        </div>
      ) : refusals.length === 0 ? (
        <EmptyState title="No refused checkouts yet">
          When checkout refuses an order because a price changed, the
          attempt appears here with the prices the customer saw and the
          live prices at the time.
        </EmptyState>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs text-ink-mute">
              {total.toLocaleString("en-US")}{" "}
              {total === 1 ? "refusal" : "refusals"}
            </p>
            <p className="text-xs text-ink-mute">
              Newest first · page {currentPage} of {pageCount}
            </p>
          </div>

          <ul className="mt-3 flex flex-col gap-4">
            {refusals.map((row) => {
              const lines = expectedLines(row.expected_prices);
              const profile = row.user_id
                ? profiles.get(row.user_id)
                : undefined;
              const difference =
                row.live_total_minor - row.expected_total_minor;
              return (
                <li
                  key={row.id}
                  className="rounded-2xl border border-line bg-paper-soft p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        {profile
                          ? (profile.full_name ?? profile.email)
                          : row.guest_token_hash
                            ? `Guest · token ${row.guest_token_hash.slice(0, 12)}…`
                            : "Unknown customer"}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-mute">
                        {formatDateTime(row.created_at)} · attempt{" "}
                        {row.idempotency_key.slice(0, 8)}
                      </p>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-right text-xs">
                      <dt className="text-ink-mute">Shown total</dt>
                      <dd className="tabular-nums text-ink">
                        {formatEgp(row.expected_total_minor)}
                      </dd>
                      <dt className="text-ink-mute">Live total</dt>
                      <dd className="tabular-nums text-ink">
                        {formatEgp(row.live_total_minor)}
                      </dd>
                      <dt className="text-ink-mute">Difference</dt>
                      <dd className="tabular-nums text-ink">
                        {difference > 0 ? "+" : ""}
                        {formatEgp(difference)}
                      </dd>
                    </dl>
                  </div>

                  {lines.length > 0 ? (
                    <ul className="mt-3 flex flex-col gap-1 border-t border-line pt-3 text-sm text-ink-soft">
                      {lines.map((line) => (
                        <li
                          key={line.product_id}
                          className="flex flex-wrap justify-between gap-2"
                        >
                          <span>
                            {productNames.get(line.product_id) ??
                              `Product ${line.product_id.slice(0, 8)}`}
                          </span>
                          <span className="tabular-nums">
                            {formatEgp(line.unit_price_minor)} each
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <Pagination
            page={currentPage}
            total={total}
            pageSize={DEFAULT_PAGE_SIZE}
            buildHref={(page) => refusalsHref(page)}
            label="Price-change refusal pages"
          />
        </>
      )}
    </div>
  );
}
