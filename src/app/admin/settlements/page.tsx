import Link from "next/link";

import { Breadcrumb, EmptyState } from "@/components/ui/section";
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

import {
  AdminActionLink,
  AdminNotice,
  AdminPageHeader,
  AdminSectionHeading,
  AdminStatStrip,
} from "../ui";
import { CreateSettlementForm } from "./settlement-create-form";

import type {
  CommissionEntryRecord,
  SettlementRecord,
} from "@/lib/finance";

export const metadata = { title: "Settlements — Admin — Gifto" };

type SettlementQueryRow = SettlementRecord & {
  vendor: { name: string; slug: string } | null;
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

function actorLabel(
  id: string | null,
  actors: ReadonlyMap<string, ActorRow>,
) {
  if (!id) return "Not recorded";
  const actor = actors.get(id);
  return actor?.full_name || actor?.email || "Removed administrator";
}

export default async function AdminSettlementsPage() {
  const { supabase } = await requirePlatformAdmin();

  const [
    settlementsResult,
    entriesResult,
    { data: vendorData, error: vendorsError },
  ] = await Promise.all([
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

  const loadError =
    settlementsResult.failed || entriesResult.failed || vendorsError;
  const totalsIncomplete =
    settlementsResult.truncated || entriesResult.truncated;
  const entryRead = {
    failed: entriesResult.failed,
    truncated: entriesResult.truncated,
  };

  return (
    <div className="w-full">
      <Breadcrumb
        items={[
          { href: "/admin", label: "Administration" },
          { label: "Settlements" },
        ]}
      />

      <div className="mt-4">
        <AdminPageHeader
          eyebrow="Finance operations"
          title="Settlements"
          description="Batch delivered commission, record external payouts, and preserve an auditable trail. A settlement total is Gifto's commission; the shop receives gross minus commission."
          actions={
            <AdminActionLink href="/admin/commissions">
              Commission ledger
            </AdminActionLink>
          }
        />
      </div>

      {loadError ? (
        <div className="mt-4">
          <AdminNotice tone="danger" role="alert">
            Settlement data could not be loaded. Refresh the page to try again.
          </AdminNotice>
        </div>
      ) : null}

      {totalsIncomplete ? (
        <div className="mt-4">
          <AdminNotice tone="warning" role="status">
            This shop network has more settlement history than can be summed in
            one page. The balances below are incomplete; use individual shop
            finance pages for exact statements.
          </AdminNotice>
        </div>
      ) : null}

      <div className="mt-6">
        <AdminStatStrip
          items={[
            {
              label: "Unsettled commission",
              value: formatEgp(unsettled.commissionMinor),
              hint: `${unsettled.count} suborders · ${formatEgp(unsettled.netMinor)} shop net`,
              emphasis: unsettled.count > 0 ? "warning" : "default",
            },
            {
              label: "In open batches",
              value: formatEgp(inOpenBatches.commissionMinor),
              hint: `${inOpenBatches.count} suborders · awaiting payout`,
              emphasis: "accent",
            },
            {
              label: "Paid to date",
              value: formatEgp(paid.commissionMinor),
              hint: `${paid.count} suborders · ${formatEgp(paid.netMinor)} shop net`,
              emphasis: "positive",
            },
            {
              label: "Earned lifetime",
              value: formatEgp(earnedLifetime.commissionMinor),
              hint: `${reversed.count} reversed · ${formatEgp(reversed.commissionMinor)} excluded`,
            },
          ]}
        />
      </div>

      <section className="mt-8 rounded-2xl border border-line bg-paper-soft p-5">
        <AdminSectionHeading
          title="Open a settlement"
          description="Available commission is snapshotted into a new batch. A shop can have only one open settlement at a time."
        />
        <div className="mt-4">
          <CreateSettlementForm vendors={activeVendors} />
        </div>
      </section>

      <section className="mt-8">
        <AdminSectionHeading
          title={`Open settlements (${openSettlements.length})`}
          description="Batches waiting for an external payout"
        />
        {openSettlements.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No open settlements">
              No settlement is waiting for an external payout.
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {openSettlements.map((settlement) => {
              const row = settlementsById.get(settlement.id);
              const vendor = row?.vendor;
              const totalsResult = settlementTotalsResult(
                settlement,
                entriesById,
                entryRead,
              );
              const totals = totalsResult.totals;
              return (
                <li
                  key={settlement.id}
                  className="rounded-2xl border border-berry/25 bg-berry-soft/35 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-medium text-ink">
                        {vendor?.name ?? "Unknown shop"}
                      </p>
                      <p className="mt-1 text-xs text-ink-mute">
                        Opened {formatDate(settlement.created_at)} by{" "}
                        {actorLabel(row?.created_by ?? null, actors)}
                      </p>
                    </div>
                    <span className="rounded-full border border-berry/25 bg-paper px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-ink">
                      Open batch
                    </span>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-berry/15 bg-paper/70 p-4 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-ink-mute">Delivered gross</dt>
                      <dd className="mt-0.5 font-medium tabular-nums text-ink">
                        {totals.grossMinor === null
                          ? "Unavailable"
                          : formatEgp(totals.grossMinor)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-mute">Commission</dt>
                      <dd className="mt-0.5 font-medium tabular-nums text-ink">
                        {formatEgp(totals.commissionMinor)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-mute">Shop net</dt>
                      <dd className="mt-0.5 font-medium tabular-nums text-ink">
                        {totals.netMinor === null
                          ? "Unavailable"
                          : formatEgp(totals.netMinor)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-mute">Suborders</dt>
                      <dd className="mt-0.5 font-medium tabular-nums text-ink">
                        {totals.count}
                      </dd>
                    </div>
                  </dl>

                  {!totals.complete ? (
                    <p className="mt-3 text-xs text-warning">
                      {totalsResult.state === "read_failed"
                        ? "Gross and shop net are unavailable because commission data could not be read."
                        : totalsResult.state === "truncated"
                          ? "Gross and shop net are unavailable because commission history was truncated."
                          : "Gross and shop net are unavailable because one or more commission entries are missing."}
                    </p>
                  ) : null}

                  {settlement.note ? (
                    <p className="mt-3 rounded-lg border border-berry/15 bg-paper/70 px-3 py-2 text-sm text-ink-soft">
                      {settlement.note}
                    </p>
                  ) : null}

                  <Link
                    href={`/admin/settlements/${settlement.id}`}
                    className="mt-4 inline-flex text-sm font-semibold text-berry hover:text-berry-deep hover:underline"
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
        <AdminSectionHeading
          title={`Payment history (${paidSettlements.length})`}
          description="Batches already paid out"
        />
        {paidSettlements.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No payments yet">
              No settlements have been marked paid yet.
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-4 overflow-hidden rounded-2xl border border-line bg-paper-soft">
            {paidSettlements.map((settlement) => {
              const row = settlementsById.get(settlement.id);
              const totalsResult = settlementTotalsResult(
                settlement,
                entriesById,
                entryRead,
              );
              const totals = totalsResult.totals;
              return (
                <li
                  key={settlement.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {row?.vendor?.name ?? "Unknown shop"}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-mute">
                      Paid{" "}
                      {settlement.paid_at
                        ? formatDate(settlement.paid_at)
                        : "date not recorded"}{" "}
                      by {actorLabel(row?.paid_by ?? null, actors)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <span className="text-ink-mute">
                      Commission{" "}
                      <span className="font-medium tabular-nums text-ink">
                        {formatEgp(totals.commissionMinor)}
                      </span>
                    </span>
                    <span className="text-ink-mute">
                      Shop net{" "}
                      <span className="font-medium tabular-nums text-ink">
                        {totals.netMinor === null
                          ? "Unavailable"
                          : formatEgp(totals.netMinor)}
                      </span>
                    </span>
                    <Link
                      href={`/admin/settlements/${settlement.id}`}
                      className="font-medium text-berry hover:underline"
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
          <AdminSectionHeading
            title={`Voided settlements (${voidedSettlements.length})`}
            description="Voiding releases entries for a new batch; the original batch and lines stay in the audit trail."
          />
          <ul className="mt-4 overflow-hidden rounded-2xl border border-line bg-paper-soft">
            {voidedSettlements.map((settlement) => {
              const row = settlementsById.get(settlement.id);
              const totalsResult = settlementTotalsResult(
                settlement,
                entriesById,
                entryRead,
              );
              const totals = totalsResult.totals;
              return (
                <li
                  key={settlement.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {row?.vendor?.name ?? "Unknown shop"}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-mute">
                      Voided{" "}
                      {settlement.voided_at
                        ? formatDate(settlement.voided_at)
                        : "date not recorded"}{" "}
                      by {actorLabel(row?.voided_by ?? null, actors)}
                    </p>
                    {settlement.void_reason ? (
                      <p className="mt-1 max-w-xl text-sm text-ink-soft">
                        {settlement.void_reason}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <span className="text-ink-mute">
                      Original commission{" "}
                      <span className="font-medium tabular-nums text-ink line-through decoration-ink-mute/60">
                        {formatEgp(totals.commissionMinor)}
                      </span>
                    </span>
                    <span className="text-ink-mute">
                      {totals.count} {totals.count === 1 ? "line" : "lines"}{" "}
                      kept
                    </span>
                    <Link
                      href={`/admin/settlements/${settlement.id}`}
                      className="font-medium text-berry hover:underline"
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
