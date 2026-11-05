import Link from "next/link";
import { notFound } from "next/navigation";

import { requirePlatformAdmin } from "@/lib/auth";
import {
  commissionEntriesById,
  settlementEffectiveStatus,
  settlementTotals,
} from "@/lib/finance";
import { formatEgp } from "@/lib/money";

import { SettlementPaidButton } from "./settlement-paid-button";
import { SettlementVoidButton } from "./settlement-void-button";

import type {
  CommissionEntryRecord,
  SettlementRecord,
} from "@/lib/finance";

export const metadata = { title: "Settlement — Admin — Gifto" };

type SettlementDetailRow = {
  id: string;
  vendor_id: string;
  status: SettlementRecord["status"];
  total_minor: number;
  note: string | null;
  created_at: string;
  paid_at: string | null;
  created_by: string | null;
  paid_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  vendor: { name: string; slug: string } | null;
  settlement_lines: {
    commission_entry_id: string;
    amount_minor: number;
    released_at: string | null;
    released_by: string | null;
    release_reason: string | null;
  }[];
};

type DetailCommissionEntry = CommissionEntryRecord & {
  order_vendor_id: string;
};

type OrderVendorRow = {
  id: string;
  order: { public_reference: string | null } | { public_reference: string | null }[] | null;
  order_items: { product_name: string; quantity: number }[] | null;
};

type ActorRow = {
  id: string;
  full_name: string | null;
  email: string;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRate(rate: number) {
  const percent = rate * 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2)}%`;
}

function actorLabel(id: string | null, actors: ReadonlyMap<string, ActorRow>) {
  if (!id) return "Not recorded";
  const actor = actors.get(id);
  return actor?.full_name || actor?.email || "Removed administrator";
}

function orderReference(row: OrderVendorRow | undefined) {
  if (!row?.order) return "Order reference unavailable";
  const order = Array.isArray(row.order) ? row.order[0] : row.order;
  return order?.public_reference ?? "Order reference unavailable";
}

export default async function SettlementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requirePlatformAdmin();

  const { data: settlementData, error: settlementError } = await supabase
    .from("settlements")
    .select(
      "id, vendor_id, status, total_minor, note, created_at, paid_at, created_by, paid_by, voided_at, voided_by, void_reason, vendor:vendors(name, slug), settlement_lines(commission_entry_id, amount_minor, released_at, released_by, release_reason)",
    )
    .eq("id", id)
    .maybeSingle();

  if (settlementError || !settlementData) notFound();

  const row = settlementData as unknown as SettlementDetailRow;
  const settlement: SettlementRecord = {
    id: row.id,
    vendor_id: row.vendor_id,
    status: row.status,
    total_minor: row.total_minor,
    note: row.note,
    created_at: row.created_at,
    paid_at: row.paid_at,
    created_by: row.created_by,
    paid_by: row.paid_by,
    voided_at: row.voided_at,
    voided_by: row.voided_by,
    void_reason: row.void_reason,
    settlement_lines: row.settlement_lines ?? [],
  };

  const entryIds = settlement.settlement_lines.map(
    (line) => line.commission_entry_id,
  );

  const { data: entryData } = entryIds.length
    ? await supabase
        .from("commission_entries")
        .select(
          "id, order_vendor_id, vendor_id, status, rate, base_minor, amount_minor, earned_at, reversed_at",
        )
        .in("id", entryIds)
    : { data: [] };

  const detailEntries = (entryData ?? []) as DetailCommissionEntry[];
  const detailEntriesById = new Map(
    detailEntries.map((entry) => [entry.id, entry]),
  );
  const entries: CommissionEntryRecord[] = detailEntries;
  const entriesById = commissionEntriesById(entries);
  const totals = settlementTotals(settlement, entriesById);

  const orderVendorIds = Array.from(
    new Set(detailEntries.map((entry) => entry.order_vendor_id)),
  );

  const { data: orderVendorData } = orderVendorIds.length
    ? await supabase
        .from("order_vendors")
        .select("id, order:orders(public_reference), order_items(product_name, quantity)")
        .in("id", orderVendorIds)
    : { data: [] };

  const orderVendors = new Map(
    ((orderVendorData ?? []) as unknown as OrderVendorRow[]).map((suborder) => [
      suborder.id,
      suborder,
    ]),
  );

  const actorIds = Array.from(
    new Set(
      [
        row.created_by,
        row.paid_by,
        row.voided_by,
        ...settlement.settlement_lines.map((line) => line.released_by),
      ].filter((actorId): actorId is string => Boolean(actorId)),
    ),
  );

  const { data: actorData } = actorIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", actorIds)
    : { data: [] };

  const actors = new Map(
    ((actorData ?? []) as ActorRow[]).map((actor) => [actor.id, actor]),
  );

  const lines = [...settlement.settlement_lines].sort((a, b) => {
    const entryA = entriesById.get(a.commission_entry_id);
    const entryB = entriesById.get(b.commission_entry_id);
    return (entryA?.earned_at ?? "").localeCompare(entryB?.earned_at ?? "");
  });

  const effectiveStatus = settlementEffectiveStatus(settlement);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <Link
        href="/admin/settlements"
        className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
      >
        ← Back to settlements
      </Link>

      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {row.vendor?.name ?? "Unknown shop"}
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Settlement opened {formatDate(row.created_at)} ·{" "}
            {totals.count} delivered{" "}
            {totals.count === 1 ? "suborder" : "suborders"}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            effectiveStatus === "paid"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : effectiveStatus === "voided"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-sky-200 bg-sky-50 text-sky-800"
          }`}
        >
          {effectiveStatus}
        </span>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <dt className="text-xs uppercase tracking-wide text-zinc-500">
            Delivered gross
          </dt>
          <dd className="mt-1 text-xl font-semibold text-zinc-900">
            {formatEgp(totals.grossMinor)}
          </dd>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <dt className="text-xs uppercase tracking-wide text-zinc-500">
            Commission
          </dt>
          <dd className="mt-1 text-xl font-semibold text-zinc-900">
            {formatEgp(totals.commissionMinor)}
          </dd>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <dt className="text-xs uppercase tracking-wide text-emerald-800">
            Shop net
          </dt>
          <dd className="mt-1 text-xl font-semibold text-emerald-950">
            {formatEgp(totals.netMinor)}
          </dd>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <dt className="text-xs uppercase tracking-wide text-zinc-500">
            {effectiveStatus === "voided"
              ? "Original total"
              : "Recorded total"}
          </dt>
          <dd className="mt-1 text-xl font-semibold text-zinc-900">
            {formatEgp(row.total_minor)}
          </dd>
          <p className="mt-1 text-xs text-zinc-500">
            {effectiveStatus === "voided"
              ? "Released for re-settlement"
              : "Commission only"}
          </p>
        </div>
      </dl>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="font-semibold text-zinc-900">Opened by</h2>
          <p className="mt-1 text-zinc-700">
            {actorLabel(row.created_by, actors)}
          </p>
          <p className="text-zinc-500">{formatDate(row.created_at)}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="font-semibold text-zinc-900">Paid by</h2>
          {effectiveStatus === "paid" ? (
            <>
              <p className="mt-1 text-zinc-700">
                {actorLabel(row.paid_by, actors)}
              </p>
              <p className="text-zinc-500">
                {row.paid_at
                  ? formatDate(row.paid_at)
                  : "Payment date not recorded"}
              </p>
            </>
          ) : (
            <p className="mt-1 text-zinc-600">
              {effectiveStatus === "voided"
                ? "This batch was voided before payment."
                : "Not paid yet. Confirm the external payout before recording it."}
            </p>
          )}
        </div>
        {effectiveStatus === "voided" ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
            <h2 className="font-semibold text-red-900">Voided by</h2>
            <p className="mt-1 text-red-800">
              {actorLabel(row.voided_by, actors)}
            </p>
            <p className="text-red-700">
              {row.voided_at
                ? formatDate(row.voided_at)
                : "Void date not recorded"}
            </p>
            <p className="mt-3 font-medium text-red-900">Reason</p>
            <p className="mt-1 whitespace-pre-wrap text-red-800">
              {row.void_reason ?? "No reason was recorded for this legacy void."}
            </p>
          </div>
        ) : null}
      </section>

      {row.note ? (
        <p className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          {row.note}
        </p>
      ) : null}

      {effectiveStatus === "open" ? (
        <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="font-semibold text-emerald-950">Record payout</h2>
          <p className="mt-1 text-sm text-emerald-800">
            Transfer or hand over <strong>{formatEgp(totals.netMinor)}</strong>{" "}
            to the shop. Marking this paid records the external payout; it does
            not move money.
          </p>
          <div className="mt-3">
            <SettlementPaidButton settlementId={row.id} />
          </div>
          <div className="mt-6 border-t border-emerald-200 pt-4">
            <h3 className="font-semibold text-emerald-950">
              Opened by mistake?
            </h3>
            <p className="mt-1 text-sm text-emerald-800">
              Voiding keeps this batch and its lines for audit, releases the
              commission so it can be settled again, and cannot be undone. A
              reason is required.
            </p>
            <div className="mt-3">
              <SettlementVoidButton settlementId={row.id} />
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-900">
          Included suborders ({lines.length})
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Each line is a delivered shop suborder and the commission snapshot
          taken when that order was placed.
        </p>

        {lines.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
            {effectiveStatus === "voided"
              ? "This legacy void has no preserved settlement lines."
              : "This settlement has no lines."}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            {lines.map((line) => {
              const entry = detailEntriesById.get(line.commission_entry_id);
              const suborder = entry
                ? orderVendors.get(entry.order_vendor_id)
                : undefined;
              const items = (suborder?.order_items ?? [])
                .map((item) => `${item.product_name} × ${item.quantity}`)
                .join(", ");

              return (
                <li key={line.commission_entry_id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-900">
                        {orderReference(suborder)}
                      </p>
                      <p className="mt-1 text-sm text-zinc-600">
                        {items || "Line items unavailable"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Delivered{" "}
                        {entry ? formatDate(entry.earned_at) : "date unavailable"}
                        {entry ? ` · rate ${formatRate(entry.rate)}` : ""}
                      </p>
                      {line.released_at ? (
                        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                          Released {formatDate(line.released_at)} by{" "}
                          {actorLabel(line.released_by, actors)}. Reason:{" "}
                          {line.release_reason ?? "not recorded"}.
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-zinc-500">
                        Gross{" "}
                        <span className="font-medium text-zinc-900">
                          {formatEgp(entry?.base_minor ?? line.amount_minor)}
                        </span>
                      </p>
                      <p className="text-zinc-500">
                        Commission{" "}
                        <span className="font-medium text-zinc-900">
                          {formatEgp(line.amount_minor)}
                        </span>
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
