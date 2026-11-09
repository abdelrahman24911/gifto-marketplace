"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformAdmin } from "@/lib/auth";
import { isSupportStatus } from "@/lib/support-requests";

import type { SupportRequestStatus } from "@/lib/supabase/database.types";

export type SupportStatusState =
  | { error: string; attempt: number }
  | { success: string; status: SupportRequestStatus; attempt: number }
  | null;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function updateSupportRequestStatus(
  prev: SupportStatusState,
  formData: FormData,
): Promise<SupportStatusState> {
  const attempt =
    (prev && "attempt" in prev && typeof prev.attempt === "number"
      ? prev.attempt
      : 0) + 1;

  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!UUID_PATTERN.test(id)) {
    return { error: "That support request could not be found.", attempt };
  }
  if (!isSupportStatus(status)) {
    return { error: "Choose a valid support status.", attempt };
  }

  const { supabase } = await requirePlatformAdmin();
  const { data, error } = await supabase
    .from("support_requests")
    .update({ status })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return {
      error:
        error.code === "42501"
          ? "Your account doesn't have permission to update support requests."
          : "The request couldn't be updated. Please try again.",
      attempt,
    };
  }
  if (!data) {
    return { error: "That support request could not be found.", attempt };
  }

  revalidatePath("/admin/support");
  revalidatePath("/vendor/support");
  return {
    success: "Support status updated.",
    status,
    attempt,
  };
}
