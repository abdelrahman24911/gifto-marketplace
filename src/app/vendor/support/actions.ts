"use server";

import { revalidatePath } from "next/cache";

import {
  SUPPORT_BODY_MAX,
  SUPPORT_BODY_MIN,
  SUPPORT_SUBJECT_MAX,
  SUPPORT_SUBJECT_MIN,
  isSupportCategory,
} from "@/lib/support-requests";
import { requireVendorRole } from "@/lib/vendor";
import { safeDbError } from "@/lib/safe-db-error";

export type SupportRequestValues = {
  category: string;
  subject: string;
  body: string;
};

export type SupportRequestState =
  | { error: string; values: SupportRequestValues; attempt: number }
  | { success: string; attempt: number }
  | null;

export async function createSupportRequest(
  prev: SupportRequestState,
  formData: FormData,
): Promise<SupportRequestState> {
  const attempt =
    (prev && typeof prev.attempt === "number" ? prev.attempt : 0) + 1;

  const values: SupportRequestValues = {
    category: String(formData.get("category") ?? "").trim(),
    subject: String(formData.get("subject") ?? "").trim(),
    body: String(formData.get("body") ?? "").trim(),
  };

  const invalid = (error: string) => ({ error, values, attempt });

  if (!isSupportCategory(values.category)) {
    return invalid("Choose the topic that best matches your question.");
  }

  if (
    values.subject.length < SUPPORT_SUBJECT_MIN ||
    values.subject.length > SUPPORT_SUBJECT_MAX
  ) {
    return invalid(
      `Add a subject between ${SUPPORT_SUBJECT_MIN} and ${SUPPORT_SUBJECT_MAX} characters.`,
    );
  }

  if (
    values.body.length < SUPPORT_BODY_MIN ||
    values.body.length > SUPPORT_BODY_MAX
  ) {
    return invalid(
      `Describe the issue in ${SUPPORT_BODY_MIN}–${SUPPORT_BODY_MAX} characters.`,
    );
  }

  const { supabase, access } = await requireVendorRole(
    formData.get("vendor") as string | null,
    { verifyWithAuthServer: true },
  );

  // Only vendor_id/category/subject/body are in the INSERT grant; created_by
  // and status are assigned by the database. RLS also re-checks membership.
  const { error } = await supabase.from("support_requests").insert({
    vendor_id: access.vendorId,
    category: values.category,
    subject: values.subject,
    body: values.body,
  });

  if (error) {
    if (error.code === "42501") {
      return invalid(
        "Your account doesn't have permission to contact support for this shop.",
      );
    }
    if (error.code === "22023" || error.code === "23514") {
      return invalid(
        safeDbError(
          error,
          "Your request couldn't be sent. Please try again.",
        ),
      );
    }
    return invalid("Your request couldn't be sent. Please try again.");
  }

  revalidatePath("/vendor/support");
  revalidatePath("/admin/support");
  return {
    success:
      "Request sent to the Gifto team. It will appear in the admin support queue.",
    attempt,
  };
}
