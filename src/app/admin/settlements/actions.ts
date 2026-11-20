"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePlatformAdmin } from "@/lib/auth";
import { checkMutationQuota } from "@/lib/rate-limit";
import { fetchAllRows } from "@/lib/fetch-all";
import {
  commissionEntriesById,
  isTransferMethod,
  settlementNetDueMinor,
  settlementTotalsResult,
} from "@/lib/finance";
import { formatEgp, parseEgpToMinor } from "@/lib/money";

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

  const { supabase, user } = await requirePlatformAdmin();

  const quotaError = await checkMutationQuota("admin", user.id);
  if (quotaError) return { error: quotaError, attempt };

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

  const { supabase, user } = await requirePlatformAdmin();

  const quotaError = await checkMutationQuota("admin", user.id);
  if (quotaError) return { error: quotaError, attempt };

  const { data: settlementData, error: settlementError } = await supabase
    .from("settlements")
    .select(
      "id, total_minor, clawback_minor, settlement_lines(commission_entry_id, amount_minor, released_at, released_by, release_reason)",
    )
    .eq("id", settlementId)
    .maybeSingle();

  if (settlementError || !settlementData) {
    return {
      error: "The settlement could not be verified. Refresh the page and try again.",
      attempt,
    };
  }

  const settlementRow = settlementData as Pick<
    SettlementRecord,
    "total_minor" | "clawback_minor" | "settlement_lines"
  >;
  const entryIds = settlementRow.settlement_lines.map(
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
    settlementRow,
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

  // P1-05 (D-08): marking paid attests that Gifto received the
  // commission. The amount, the transfer method and the vendor's transfer
  // reference are part of the attestation; the database rejects a wrong
  // amount or a missing reference, and this validation surfaces the same
  // errors before the RPC call.
  //
  // N-01 (D-08): the amount due is the NET commission — the lines'
  // snapshot less the paid-return clawbacks applied to this batch — which
  // is the stored total_minor. The proof validation compares the entered
  // amount to that derived net, never to the gross lines total. When the
  // batch is fully offset by clawbacks the net due is zero, no transfer
  // took place, and no proof is collected or recorded.
  const paidAmountMinor = parseEgpToMinor(
    String(formData.get("paid_amount") ?? ""),
  );
  const transferMethod = String(formData.get("transfer_method") ?? "").trim();
  const transferReference = String(
    formData.get("transfer_reference") ?? "",
  ).trim();
  const proofNote = String(formData.get("proof_note") ?? "").trim();

  if (paidAmountMinor === null || paidAmountMinor < 0) {
    return {
      error: "Enter the amount Gifto received, in pounds, of zero or more.",
      attempt,
    };
  }

  const netDueMinor = settlementNetDueMinor(
    totalsResult.totals.commissionMinor,
    settlementRow.clawback_minor ?? 0,
  );
  if (settlementRow.total_minor !== netDueMinor) {
    return {
      error:
        "The settlement total does not match its lines net of clawbacks. The settlement was not marked paid.",
      attempt,
    };
  }

  // The derived D-08 amount is the net commission. Check it here for a
  // fast, specific error; the RPC re-checks it and is the authority, so
  // a race cannot slip a wrong amount through.
  if (paidAmountMinor !== netDueMinor) {
    return {
      error: `The amount received (${formatEgp(paidAmountMinor)}) does not match the commission due (${formatEgp(netDueMinor)}).`,
      attempt,
    };
  }

  if (netDueMinor === 0) {
    if (transferMethod !== "" || transferReference !== "" || proofNote !== "") {
      return {
        error:
          "This settlement is fully offset by clawbacks, so no transfer took place and no proof is recorded.",
        attempt,
      };
    }

    const { error } = await supabase.rpc("mark_settlement_paid", {
      p_settlement_id: settlementId,
      p_paid_amount_minor: 0,
      p_transfer_method: null,
      p_transfer_reference: null,
      p_proof_note: null,
    });

    if (error) {
      return {
        error:
          error.code === "23514" || error.code === "22023"
            ? error.message
            : "The settlement could not be marked paid. Refresh the page and try again.",
        attempt,
      };
    }

    revalidatePath("/admin/settlements");
    revalidatePath(`/admin/settlements/${settlementId}`);
    revalidatePath("/vendor/finance");

    return {
      success:
        "No commission was due — this batch was fully offset by paid-return clawbacks.",
      attempt,
    };
  }

  if (!isTransferMethod(transferMethod)) {
    return { error: "Choose how the commission was transferred.", attempt };
  }
  if (transferReference.length < 3 || transferReference.length > 200) {
    return {
      error: "Enter the transfer reference (3–200 characters).",
      attempt,
    };
  }
  if (proofNote.length > 500) {
    return {
      error: "A proof note must be 500 characters or fewer.",
      attempt,
    };
  }

  const { error } = await supabase.rpc("mark_settlement_paid", {
    p_settlement_id: settlementId,
    p_paid_amount_minor: paidAmountMinor,
    p_transfer_method: transferMethod,
    p_transfer_reference: transferReference,
    p_proof_note: proofNote || null,
  });

  if (error) {
    return {
      error:
        error.code === "23514" || error.code === "22023"
          ? error.message
          : "The settlement could not be marked paid. Refresh the page and try again.",
      attempt,
    };
  }

  revalidatePath("/admin/settlements");
  revalidatePath(`/admin/settlements/${settlementId}`);
  revalidatePath("/vendor/finance");

  return {
    success:
      "Commission receipt recorded. Gifto's receipt of the commission is now on file with the transfer reference.",
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

  const { supabase, user } = await requirePlatformAdmin();

  const quotaError = await checkMutationQuota("admin", user.id);
  if (quotaError) return { error: quotaError, attempt };

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
