import Link from "next/link";
import { redirect } from "next/navigation";

import { Pagination } from "@/components/pagination";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { Breadcrumb, EmptyState } from "@/components/ui/section";
import { requirePlatformAdmin } from "@/lib/auth";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { fetchAllRows } from "@/lib/fetch-all";
import {
  buildSettlementLineLookup,
  clawbackRemainingMinor,
  commissionEntriesById,
  settlementTotalsResult,
  totalsForEntries,
  totalsForFinanceState,
} from "@/lib/finance";
import { formatEgp } from "@/lib/money";
import {
  DEFAULT_PAGE_SIZE,
  clampPage,
  pageWindow,
  parsePage,
} from "@/lib/pagination";

import {
  AdminActionLink,
  AdminNotice,
  AdminPageHeader,
  AdminSectionHeading,
  AdminStatStrip,
} from "../ui";
import { CreateSettlementForm } from "./settlement-create-form";
import { ClawbackRepaymentForm } from "./clawback-repayment-form";

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

type OutstandingClawbackRow = {
  id: string;
  refund_case_id: string;
  vendor_id: string;
  amount_minor: number;
  status: string;
  created_at: string;
  vendor: { name: string; slug: string } | null;
  clawback_applications: { amount_minor: number }[];
};

type ClawbackCaseRow = {
  id: string;
  order_vendor: {
    order: { public_reference: string | null } | null;
  } | null;
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
    timeZone: BUSINESS_TIME_ZONE,
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

function settlementsHref({
  paidPage = 1,
  voidedPage = 1,
}: {
  paidPage?: number;
  voidedPage?: number;
}) {
  const params = new URLSearchParams();
  if (paidPage > 1) params.set("paidPage", String(paidPage));
  if (voidedPage > 1) params.set("voidedPage", String(voidedPage));
  const search = params.toString();
  return search ? `/admin/settlements?${search}` : "/admin/settlements";
}

export default async function AdminSettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ paidPage?: string; voidedPage?: string }>;
}) {
  const params = await searchParams;
  const { supabase } = await requirePlatformAdmin();
  const requestedPaidPage = parsePage(params.paidPage);
  const requestedVoidedPage = parsePage(params.voidedPage);

  const [settlementsResult, entriesResult, vendorsResult, clawbacksResult] =
    await Promise.all([
      fetchAllRows<SettlementQueryRow>((from, to) =>
        supabase
          .from("settlements")
          .select(
            "id, vendor_id, status, total_minor, clawback_minor, note, created_at, paid_at, created_by, paid_by, voided_at, voided_by, void_reason, paid_amount_minor, transfer_method, transfer_reference, proof_note, vendor:vendors(name, slug), settlement_lines(commission_entry_id, amount_minor, released_at, released_by, release_reason)",
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
      fetchAllRows<VendorQueryRow>((from, to) =>
        supabase
          .from("vendors")
          .select("id, name, slug")
          .eq("status", "active")
          .order("name", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to)
          .returns<VendorQueryRow[]>(),
      ),
      // R-02 (D-08, N-01): outstanding paid-return clawbacks — the
      // direct-repayment fallback needs a caller on this page.
      fetchAllRows<OutstandingClawbackRow>((from, to) =>
        supabase
          .from("commission_clawbacks")
          .select(
            "id, refund_case_id, vendor_id, amount_minor, status, created_at, vendor:vendors(name, slug), clawback_applications(amount_minor)",
          )
          .eq("status", "outstanding")
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to)
          .returns<OutstandingClawbackRow[]>(),
      ),
    ]);

  const settlements = settlementsResult.rows;
  const settlementsById = new Map(
    settlements.map((settlement) => [settlement.id, settlement]),
  );
  const entries = entriesResult.rows;
  const vendors = vendorsResult.rows;

  const records: SettlementRecord[] = settlements.map((settlement) => ({
    id: settlement.id,
    vendor_id: settlement.vendor_id,
    status: settlement.status,
    total_minor: settlement.total_minor,
    clawback_minor: settlement.clawback_minor,
    note: settlement.note,
    created_at: settlement.created_at,
    paid_at: settlement.paid_at,
    created_by: settlement.created_by,
    paid_by: settlement.paid_by,
    voided_at: settlement.voided_at,
    voided_by: settlement.voided_by,
    void_reason: settlement.void_reason,
    paid_amount_minor: settlement.paid_amount_minor,
    transfer_method: settlement.transfer_method,
    transfer_reference: settlement.transfer_reference,
    proof_note: settlement.proof_note,
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

  // R-02 (D-08, N-01): outstanding paid-return clawbacks, with what each
  // vendor still owes after any partial applications. A clawback that was
  // fully applied is consumed, so an outstanding one always has a
  // positive remainder; the filter guards a stale row either way.
  const outstandingClawbacks = clawbacksResult.rows
    .map((clawback) => ({
      ...clawback,
      clawback_applications: clawback.clawback_applications ?? [],
      remainingMinor: clawbackRemainingMinor(
        clawback,
        clawback.clawback_applications ?? [],
      ),
    }))
    .filter((clawback) => clawback.remainingMinor > 0);

  const clawbackCaseIds = Array.from(
    new Set(
      outstandingClawbacks.map((clawback) => clawback.refund_case_id),
    ),
  );
  const { data: clawbackCaseData } = clawbackCaseIds.length
    ? await supabase
        .from("refund_cases")
        .select(
          "id, order_vendor:order_vendors(order:orders(public_reference))",
        )
        .in("id", clawbackCaseIds)
    : { data: [] };
  const clawbackCases = new Map(
    ((clawbackCaseData ?? []) as unknown as ClawbackCaseRow[]).map(
      (refundCase) => [refundCase.id, refundCase],
    ),
  );
  const clawbacksFailed =
    clawbacksResult.failed || clawbacksResult.truncated;
  const paidSettlements = records.filter((record) => record.status === "paid");
  const voidedSettlements = records.filter(
    (record) => record.status === "voided" || record.voided_at,
  );

  const paidPage = clampPage(requestedPaidPage, paidSettlements.length);
  const voidedPage = clampPage(requestedVoidedPage, voidedSettlements.length);
  const paidWindow = pageWindow(paidPage);
  const voidedWindow = pageWindow(voidedPage);
  const visiblePaid = paidSettlements.slice(
    paidWindow.from,
    paidWindow.to + 1,
  );
  const visibleVoided = voidedSettlements.slice(
    voidedWindow.from,
    voidedWindow.to + 1,
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

  const settlementsFailed = settlementsResult.failed;
  const entriesFailed = entriesResult.failed;
  const vendorsFailed = vendorsResult.failed;
  const financeStateAvailable =
    !settlementsResult.failed &&
    !settlementsResult.truncated &&
    !entriesResult.failed &&
    !entriesResult.truncated;
  const vendorsIncomplete = vendorsResult.failed || vendorsResult.truncated;
  const totalsIncomplete =
    settlementsResult.truncated || entriesResult.truncated;
  const entryRead = {
    failed: entriesResult.failed,
    truncated: entriesResult.truncated,
  };

  if (
    !settlementsFailed &&
    (requestedPaidPage !== paidPage || requestedVoidedPage !== voidedPage)
  ) {
    redirect(
      settlementsHref({ paidPage, voidedPage }),
    );
  }

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

      {settlementsFailed || entriesFailed ? (
        <div className="mt-4">
          <AdminNotice tone="danger" role="alert">
            {settlementsFailed
              ? "Settlement and commission state could not be loaded."
              : "Commission entries could not be loaded, so settlement balances are unavailable."}
          </AdminNotice>
          <RefreshButton />
        </div>
      ) : null}

      {!settlementsFailed && !entriesFailed && vendorsFailed ? (
        <div className="mt-4">
          <AdminNotice tone="warning" role="alert">
            The shop list could not be loaded. Existing settlements remain
            visible, but opening a new one is unavailable until the shop list
            loads.
          </AdminNotice>
        </div>
      ) : null}

      {totalsIncomplete ? (
        <div className="mt-4">
          <AdminNotice tone="warning" role="status">
            This shop network has more settlement history than can be summed
            reliably. The balances below are incomplete; use individual shop
            finance pages for exact statements.
          </AdminNotice>
        </div>
      ) : null}

      {vendorsResult.truncated ? (
        <div className="mt-4">
          <AdminNotice tone="warning" role="status">
            The active shop list is larger than the current read, so the
            settlement form may omit shops.
          </AdminNotice>
        </div>
      ) : null}

      <div className="mt-6">
        <AdminStatStrip
          items={[
            {
              label: "Unsettled commission",
              value: financeStateAvailable
                ? formatEgp(unsettled.commissionMinor)
                : "—",
              hint: financeStateAvailable
                ? `${unsettled.count} suborders · ${formatEgp(unsettled.netMinor)} shop net`
                : "Unavailable until the ledger reads in full",
              emphasis:
                financeStateAvailable && unsettled.count > 0
                  ? "warning"
                  : "default",
            },
            {
              label: "In open batches",
              value: financeStateAvailable
                ? formatEgp(inOpenBatches.commissionMinor)
                : "—",
              hint: financeStateAvailable
                ? `${inOpenBatches.count} suborders · awaiting payout`
                : "Unavailable until the ledger reads in full",
              emphasis: "accent",
            },
            {
              label: "Paid to date",
              value: financeStateAvailable
                ? formatEgp(paid.commissionMinor)
                : "—",
              hint: financeStateAvailable
                ? `${paid.count} suborders · ${formatEgp(paid.netMinor)} shop net`
                : "Unavailable until the ledger reads in full",
              emphasis: "positive",
            },
            {
              label: "Earned lifetime",
              value: financeStateAvailable
                ? formatEgp(earnedLifetime.commissionMinor)
                : "—",
              hint: financeStateAvailable
                ? `${reversed.count} reversed · ${formatEgp(reversed.commissionMinor)} excluded`
                : "Unavailable until the ledger reads in full",
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
          {financeStateAvailable && !vendorsIncomplete ? (
            <CreateSettlementForm vendors={activeVendors} />
          ) : (
            <AdminNotice tone="warning" role="status">
              {!financeStateAvailable
                ? "Opening a settlement is unavailable until commission and settlement history can be read in full."
                : "Opening a settlement is unavailable until the active shop list loads completely."}
            </AdminNotice>
          )}
        </div>
      </section>

      {clawbacksFailed || outstandingClawbacks.length > 0 ? (
        <section className="mt-8 rounded-2xl border border-line bg-paper-soft p-5">
          <AdminSectionHeading
            title={`Outstanding paid-return clawbacks (${outstandingClawbacks.length})`}
            description="Commission Gifto already paid out that a shop owes back after a paid return (D-08). A clawback is netted against the shop's next settlement automatically; when a shop has no new commission to settle, record the direct repayment here instead — the shop repays Gifto directly and the reference is the proof. A clawback already being recovered through an open settlement cannot be repaid directly until that settlement is paid or voided."
          />
          {clawbacksFailed ? (
            <div className="mt-4">
              <AdminNotice tone="warning" role="alert">
                Outstanding clawbacks could not be loaded in full. Refresh
                the page to try again.
              </AdminNotice>
            </div>
          ) : null}
          {outstandingClawbacks.length === 0 ? null : (
            <ul className="mt-4 flex flex-col gap-4">
              {outstandingClawbacks.map((clawback) => {
                const refundCase = clawbackCases.get(
                  clawback.refund_case_id,
                );
                const orderReference =
                  refundCase?.order_vendor?.order?.public_reference;
                return (
                  <li
                    key={clawback.id}
                    className="rounded-2xl border border-line-strong bg-paper p-5"
                  >
                    <div>
                      <p className="text-lg font-medium text-ink">
                        {clawback.vendor?.name ?? "Unknown shop"} —{" "}
                        {formatEgp(clawback.remainingMinor)} owed
                      </p>
                      <p className="mt-1 text-xs text-ink-mute">
                        Opened {formatDate(clawback.created_at)}
                        {orderReference
                          ? ` · Refund case for order ${orderReference}`
                          : ""}
                      </p>
                    </div>
                    <ClawbackRepaymentForm
                      clawbackId={clawback.id}
                      remainingMinor={clawback.remainingMinor}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {!settlementsFailed ? (
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
      ) : null}

      {!settlementsFailed ? (
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
            {visiblePaid.map((settlement) => {
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
                      {settlement.transfer_reference
                        ? ` · reference ${settlement.transfer_reference}`
                        : ""}
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
        <Pagination
          page={paidPage}
          total={paidSettlements.length}
          pageSize={DEFAULT_PAGE_SIZE}
          label="Paid settlement pages"
          buildHref={(page) =>
            settlementsHref({ paidPage: page, voidedPage })
          }
        />
        </section>
      ) : null}

      {!settlementsFailed && voidedSettlements.length > 0 ? (
        <section className="mt-8">
          <AdminSectionHeading
            title={`Voided settlements (${voidedSettlements.length})`}
            description="Voiding releases entries for a new batch; the original batch and lines stay in the audit trail."
          />
          <ul className="mt-4 overflow-hidden rounded-2xl border border-line bg-paper-soft">
            {visibleVoided.map((settlement) => {
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
          <Pagination
            page={voidedPage}
            total={voidedSettlements.length}
            pageSize={DEFAULT_PAGE_SIZE}
            label="Voided settlement pages"
            buildHref={(page) =>
              settlementsHref({ paidPage, voidedPage: page })
            }
          />
        </section>
      ) : null}
    </div>
  );
}
