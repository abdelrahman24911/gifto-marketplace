import Link from "next/link";

import { requirePlatformAdmin } from "@/lib/auth";
import { fetchAllRows } from "@/lib/fetch-all";
import {
  buildSettlementLineLookup,
  commissionEntriesById,
  settlementTotalsResult,
  totalsForEntries,
  totalsForFinanceState,
} from "@/lib/finance";
import { formatEgp } from "@/lib/money";

import { CreateSettlementForm } from "./settlement-create-form";

import type {
  CommissionEntryRecord,
  SettlementRecord,
} from "@/lib/finance";

export const metadata = { title: "Settlements — Admin — Gifto" };

type SettlementQueryRow = {
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

type VendorQueryRow = {
  id: string;
  name: string;
  slug: string;
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

function actorLabel(id: string | null, actors: ReadonlyMap<string, ActorRow>) {
  if (!id) return "Not recorded";
  const actor = actors.get(id);
  return actor?.full_name || actor?.email || "Removed administrator";
}

export default async function AdminSettlementsPage() {
  const { supabase } = await requirePlatformAdmin();

  const [settlementsResult, entriesResult, { data: vendorData, error: vendorsError }] =
    await Promise.all([
      fetchAllRows<SettlementQueryRow>((from, to) =>
        supabase
          .from("settlements")
          .select(
            "id, vendor_id, status, total_minor, note, created_at, paid_at, created_by, paid_by, voided_at, voided_by, void_reason, vendor:vendors(name, slug), settlement_lines(commission_entry_id, amount_minor, released_at, released_by, release_reason)",
          )
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to)
          .returns<SettlementQueryRow[]>(),
      ),
      fetchAllRows<CommissionEntryRecord>((from, to) =>
        supabase
          .from("commission_entries")
          .select(
            "id, vendor_id, status, rate, base_minor, amount_minor, earned_at, reversed_at",
          )
          .order("earned_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to)
          .returns<CommissionEntryRecord[]>(),
      ),
      supabase
        .from("vendors")
        .select("id, name, slug")
        .eq("status", "active")
        .order("name", { ascending: true }),
    ]);

  const settlements = settlementsResult.rows;
  const settlementsById = new Map(
    settlements.map((settlement) => [settlement.id, settlement]),
  );
  const entries = entriesResult.rows;
  const vendors = (vendorData ?? []) as VendorQueryRow[];

  const records: SettlementRecord[] = settlements.map((settlement) => ({
    id: settlement.id,
    vendor_id: settlement.vendor_id,
    status: settlement.status,
    total_minor: settlement.total_minor,
    note: settlement.note,
    created_at: settlement.created_at,
    paid_at: settlement.paid_at,
    created_by: settlement.created_by,
    paid_by: settlement.paid_by,
    voided_at: settlement.voided_at,
    voided_by: settlement.voided_by,
    void_reason: settlement.void_reason,
    settlement_lines: settlement.settlement_lines ?? [],
  }));

  const lookup = buildSettlementLineLookup(records);
  const entriesById = commissionEntriesById(entries);
  const earned = entries.filter((entry) => entry.status === "earned");

  const unsettled = totalsForFinanceState(entries, lookup, "unsettled");
  const inOpenBatches = totalsForFinanceState(entries, lookup, "open");
  const paid = totalsForFinanceState(entries, lookup, "paid");
  const reversed = totalsForFinanceState(entries, lookup, "reversed");
  const earnedLifetime = totalsForEntries(earned);

  const activeVendors = vendors
    .map((vendor) => {
      const totals = totalsForFinanceState(
        entries.filter((entry) => entry.vendor_id === vendor.id),
        lookup,
        "unsettled",
      );
      return { ...vendor, totals };
    })
    .filter((vendor) => vendor.totals.count > 0);

  const openSettlements = records.filter(
    (record) => record.status === "open" && !record.voided_at,
  );
  const paidSettlements = records.filter((record) => record.status === "paid");
  const voidedSettlements = records.filter(
    (record) => record.status === "voided" || record.voided_at,
  );

  const actorIds = Array.from(
    new Set(
      records
        .flatMap((record) => [
          record.created_by,
          record.paid_by,
          record.voided_by,
        ])
        .filter((id): id is string => Boolean(id)),
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

  const loadError = settlementsResult.failed || entriesResult.failed || vendorsError;
  const totalsIncomplete =
    settlementsResult.truncated || entriesResult.truncated;
  const entryRead = {
    failed: entriesResult.failed,
    truncated: entriesResult.truncated,
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <div>
        <Link
          href="/admin"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
        >
          ← Back to administration
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
          Shop settlements
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Commission batches recorded after delivery. A settlement total is the
          commission Gifto collects; the shop receives gross minus commission.
          Mistaken open batches can be voided before any external payout.
        </p>
      </div>

      {loadError ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Settlement data could not be loaded. Refresh the page to try again.
        </p>
      ) : null}

      {totalsIncomplete ? (
        <p
          role="status"
          className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          This shop network has more settlement history than can be summed on
          one page. The balances below are incomplete; use the individual shop
          finance pages for exact statements.
        </p>
      ) : null}

      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-amber-800">
            Unsettled
          </dt>
          <dd className="mt-1 text-2xl font-semibold text-amber-950">
            {formatEgp(unsettled.commissionMinor)}
          </dd>
          <p className="mt-1 text-xs text-amber-800">
            {unsettled.count} delivered{" "}
            {unsettled.count === 1 ? "suborder" : "suborders"} ·{" "}
            {formatEgp(unsettled.netMinor)} shop net
          </p>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-sky-800">
            In open batches
          </dt>
          <dd className="mt-1 text-2xl font-semibold text-sky-950">
            {formatEgp(inOpenBatches.commissionMinor)}
          </dd>
          <p className="mt-1 text-xs text-sky-800">
            {inOpenBatches.count} delivered{" "}
            {inOpenBatches.count === 1 ? "suborder" : "suborders"} ·{" "}
            {formatEgp(inOpenBatches.netMinor)} shop net
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-emerald-800">
            Paid to date
          </dt>
          <dd className="mt-1 text-2xl font-semibold text-emerald-950">
            {formatEgp(paid.commissionMinor)}
          </dd>
          <p className="mt-1 text-xs text-emerald-800">
            {paid.count} delivered{" "}
            {paid.count === 1 ? "suborder" : "suborders"} ·{" "}
            {formatEgp(paid.netMinor)} shop net
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Earned lifetime
          </dt>
          <dd className="mt-1 text-2xl font-semibold text-zinc-900">
            {formatEgp(earnedLifetime.commissionMinor)}
          </dd>
          <p className="mt-1 text-xs text-zinc-500">
            {reversed.count} reversed · {formatEgp(reversed.commissionMinor)}{" "}
            excluded
          </p>
        </div>
      </dl>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-900">
          Open a settlement
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Available commission is snapshotted into a new batch. A shop can have
          only one open settlement at a time.
        </p>
        <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-5">
          <CreateSettlementForm vendors={activeVendors} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-900">
          Open settlements ({openSettlements.length})
        </h2>
        {openSettlements.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
            No settlement is waiting for an external payout.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-4">
            {openSettlements.map((settlement) => {
              const row = settlementsById.get(settlement.id);
              const vendor = row?.vendor;
              const totalsResult = settlementTotalsResult(settlement, entriesById, entryRead);
              const totals = totalsResult.totals;
              return (
                <li
                  key={settlement.id}
                  className="rounded-2xl border border-sky-200 bg-white p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-zinc-900">
                        {vendor?.name ?? "Unknown shop"}
                      </p>
                      <p className="mt-1 text-sm text-zinc-500">
                        Opened {formatDate(settlement.created_at)} by{" "}
                        {actorLabel(row?.created_by ?? null, actors)}
                      </p>
                    </div>
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800">
                      open
                    </span>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-zinc-500">Delivered gross</dt>
                      <dd className="font-medium text-zinc-900">
                        {totals.grossMinor === null ? "Unavailable" : formatEgp(totals.grossMinor)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">Commission</dt>
                      <dd className="font-medium text-zinc-900">
                        {formatEgp(totals.commissionMinor)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">Shop net</dt>
                      <dd className="font-medium text-zinc-900">
                        {totals.netMinor === null ? "Unavailable" : formatEgp(totals.netMinor)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">Suborders</dt>
                      <dd className="font-medium text-zinc-900">
                        {totals.count}
                      </dd>
                    </div>
                  </dl>
                  {!totals.complete ? (
                    <p className="mt-3 text-xs text-amber-800">
                      {totalsResult.state === "read_failed"
                        ? "Gross and shop net are unavailable because commission data could not be read."
                        : totalsResult.state === "truncated"
                          ? "Gross and shop net are unavailable because commission history was truncated."
                          : "Gross and shop net are unavailable because one or more commission entries are missing."}
                    </p>
                  ) : null}

                  {settlement.note ? (
                    <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                      {settlement.note}
                    </p>
                  ) : null}

                  <Link
                    href={`/admin/settlements/${settlement.id}`}
                    className="mt-4 inline-block text-sm font-medium text-zinc-900 underline"
                  >
                    Review and mark paid
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-900">
          Payment history ({paidSettlements.length})
        </h2>
        {paidSettlements.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
            No settlements have been marked paid yet.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            {paidSettlements.map((settlement) => {
              const row = settlementsById.get(settlement.id);
              const totalsResult = settlementTotalsResult(settlement, entriesById, entryRead);
              const totals = totalsResult.totals;
              return (
                <li
                  key={settlement.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900">
                      {row?.vendor?.name ?? "Unknown shop"}
                    </p>
                    <p className="text-sm text-zinc-500">
                      Paid{" "}
                      {settlement.paid_at
                        ? formatDate(settlement.paid_at)
                        : "date not recorded"}{" "}
                      by {actorLabel(row?.paid_by ?? null, actors)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <span className="text-zinc-500">
                      Commission{" "}
                      <span className="font-medium text-zinc-900">
                        {formatEgp(totals.commissionMinor)}
                      </span>
                    </span>
                    <span className="text-zinc-500">
                      Shop net{" "}
                      <span className="font-medium text-zinc-900">
                        {totals.netMinor === null ? "Unavailable" : formatEgp(totals.netMinor)}
                      </span>
                    </span>
                    <Link
                      href={`/admin/settlements/${settlement.id}`}
                      className="font-medium text-zinc-900 underline"
                    >
                      View
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {voidedSettlements.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-zinc-900">
            Voided settlements ({voidedSettlements.length})
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Voiding releases the included entries so they can be settled again.
            The voided batches and their lines are kept for audit.
          </p>
          <ul className="mt-3 flex flex-col divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            {voidedSettlements.map((settlement) => {
              const row = settlementsById.get(settlement.id);
              const totalsResult = settlementTotalsResult(settlement, entriesById, entryRead);
              const totals = totalsResult.totals;
              return (
                <li
                  key={settlement.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900">
                      {row?.vendor?.name ?? "Unknown shop"}
                    </p>
                    <p className="text-sm text-zinc-500">
                      Voided{" "}
                      {settlement.voided_at
                        ? formatDate(settlement.voided_at)
                        : "date not recorded"}{" "}
                      by {actorLabel(row?.voided_by ?? null, actors)}
                    </p>
                    {settlement.void_reason ? (
                      <p className="mt-1 max-w-xl text-sm text-zinc-700">
                        {settlement.void_reason}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <span className="text-zinc-500">
                      Original commission{" "}
                      <span className="font-medium text-zinc-900">
                        {formatEgp(totals.commissionMinor)}
                      </span>
                    </span>
                    <span className="text-zinc-500">
                      {totals.count} {totals.count === 1 ? "line" : "lines"} kept
                    </span>
                    <Link
                      href={`/admin/settlements/${settlement.id}`}
                      className="font-medium text-zinc-900 underline"
                    >
                      View
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
