"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePlatformAdmin } from "@/lib/auth";
import { fetchAllRows } from "@/lib/fetch-all";
import {
  commissionEntriesById,
  settlementTotalsResult,
} from "@/lib/finance";

import type {
  CommissionEntryRecord,
  SettlementRecord,
} from "@/lib/finance";

export type CreateSettlementState =
  | { error: string; attempt: number }
  | null;

export type SettlementPaidState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

export type VoidSettlementState = SettlementPaidState;

function attemptFrom(prev: { attempt?: number } | null): number {
  return (prev?.attempt ?? 0) + 1;
}

export async function createSettlement(
  prev: CreateSettlementState,
  formData: FormData,
): Promise<CreateSettlementState> {
  const attempt = attemptFrom(prev);
  const vendorId = String(formData.get("vendor_id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!vendorId) return { error: "Missing shop id.", attempt };
  if (note.length > 500) {
    return { error: "A settlement note must be 500 characters or fewer.", attempt };
  }

  const { supabase } = await requirePlatformAdmin();

  const { data: settlementId, error } = await supabase.rpc(
    "create_settlement",
    {
      p_vendor_id: vendorId,
      p_note: note || null,
    },
  );

  if (error || !settlementId) {
    return {
      error:
        error?.code === "23514"
          ? error.message
          : error?.code === "42501"
            ? "Only platform administrators can open settlements."
            : "The settlement could not be opened. Refresh the page and try again.",
      attempt,
    };
  }

  revalidatePath("/admin/settlements");
  revalidatePath("/vendor/finance");
  redirect(`/admin/settlements/${settlementId}`);
}

export async function markSettlementPaid(
  prev: SettlementPaidState,
  formData: FormData,
): Promise<SettlementPaidState> {
  const attempt = attemptFrom(prev);
  const settlementId = String(formData.get("settlement_id") ?? "").trim();

  if (!settlementId) return { error: "Missing settlement id.", attempt };

  const { supabase } = await requirePlatformAdmin();

  const { data: settlementData, error: settlementError } = await supabase
    .from("settlements")
    .select(
      "settlement_lines(commission_entry_id, amount_minor, released_at, released_by, release_reason)",
    )
    .eq("id", settlementId)
    .maybeSingle();

  if (settlementError || !settlementData) {
    return {
      error: "The settlement could not be verified. Refresh the page and try again.",
      attempt,
    };
  }

  const settlement = settlementData as Pick<
    SettlementRecord,
    "settlement_lines"
  >;
  const entryIds = settlement.settlement_lines.map(
    (line) => line.commission_entry_id,
  );
  const entriesResult = entryIds.length
    ? await fetchAllRows<CommissionEntryRecord>(
        (from, to) =>
          supabase
            .from("commission_entries")
            .select(
              "id, vendor_id, status, rate, base_minor, amount_minor, earned_at, reversed_at",
            )
            .in("id", entryIds)
            .order("id", { ascending: true })
            .range(from, to)
            .returns<CommissionEntryRecord[]>(),
      )
    : { rows: [], failed: false, truncated: false };
  const totalsResult = settlementTotalsResult(
    settlement,
    commissionEntriesById(entriesResult.rows),
    {
      failed: entriesResult.failed,
      truncated: entriesResult.truncated,
    },
  );

  if (!totalsResult.totals.complete) {
    return {
      error:
        totalsResult.state === "read_failed"
          ? "Commission data could not be read. The settlement was not marked paid."
          : totalsResult.state === "truncated"
            ? "Commission data is too large to verify safely. The settlement was not marked paid."
            : "One or more commission entries are missing. The settlement was not marked paid.",
      attempt,
    };
  }

  const { error } = await supabase.rpc("mark_settlement_paid", {
    p_settlement_id: settlementId,
  });

  if (error) {
    return {
      error:
        error.code === "23514"
          ? error.message
          : error.code === "22023"
            ? "That settlement no longer exists."
            : "The settlement could not be marked paid. Refresh the page and try again.",
      attempt,
    };
  }

  revalidatePath("/admin/settlements");
  revalidatePath(`/admin/settlements/${settlementId}`);
  revalidatePath("/vendor/finance");

  return {
    success: "Settlement marked paid. The external payout should already be complete.",
    attempt,
  };
}

export async function voidSettlement(
  prev: VoidSettlementState,
  formData: FormData,
): Promise<VoidSettlementState> {
  const attempt = attemptFrom(prev);
  const settlementId = String(formData.get("settlement_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!settlementId) return { error: "Missing settlement id.", attempt };
  if (!reason) {
    return { error: "Enter a reason before voiding the settlement.", attempt };
  }
  if (reason.length > 500) {
    return { error: "A void reason must be 500 characters or fewer.", attempt };
  }

  const { supabase } = await requirePlatformAdmin();

  const { error } = await supabase.rpc("void_settlement", {
    p_settlement_id: settlementId,
    p_reason: reason,
  });

  if (error) {
    return {
      error:
        error.code === "23514"
          ? error.message
          : error.code === "22023"
            ? error.message
            : "The settlement could not be voided. Refresh the page and try again.",
      attempt,
    };
  }

  revalidatePath("/admin/settlements");
  revalidatePath(`/admin/settlements/${settlementId}`);
  revalidatePath("/vendor/finance");

  return {
    success:
      "Settlement voided. Its lines and reason are preserved; the commission is available for a new batch.",
    attempt,
  };
}
