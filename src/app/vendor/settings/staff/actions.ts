"use server";

import { revalidatePath } from "next/cache";

import { isValidEmail } from "@/lib/guest-order";
import {
  sendVendorStaffAddedEmail,
  sendVendorStaffInviteEmail,
} from "@/lib/mail";
import { checkMutationQuota } from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/site-url";
import { safeDbError } from "@/lib/safe-db-error";
import { createServiceClient } from "@/lib/supabase/service";
import { requireVendorRole } from "@/lib/vendor";

import type { VendorRole } from "@/lib/supabase/database.types";

/**
 * Vendor staff management (P1-14, H-07).
 *
 * Only shop owners manage members; managers and staff see a read-only list.
 * Role changes and removals go through the owner's RLS-scoped client, so
 * the "owner manage/update/delete" policies and migration 08's last-owner
 * guard are the real gates — this file only repeats the owner check so the
 * UI fails fast with a readable message.
 *
 * Invites reuse Supabase Auth invites the way the admin createVendor flow
 * does, but the email itself goes through Gifto's own mail module (P1-01):
 * generateLink mints the link without sending anything, and the membership
 * row is created right after the invite, so accepting the link lands the
 * new member straight in the shop. Supabase's own invite email is never
 * relied on. If no SMTP provider is configured, the membership is still
 * created and the action says so plainly instead of pretending an email
 * was sent.
 */

export type VendorStaffState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

const INVITE_ROLES: VendorRole[] = ["manager", "staff"];
const ALL_ROLES: VendorRole[] = ["owner", "manager", "staff"];

function isVendorRole(value: string): value is VendorRole {
  return (ALL_ROLES as string[]).includes(value);
}

function ownerOnly(
  access: { role: string },
  isPlatformAdmin: boolean,
): string | null {
  if (access.role === "owner" || isPlatformAdmin) return null;
  return "Only the shop owner can manage staff.";
}

async function inviteRedirectTo(): Promise<string> {
  return `${getSiteUrl()}/auth/accept-invite`;
}

export async function inviteVendorMember(
  prev: VendorStaffState,
  formData: FormData,
): Promise<VendorStaffState> {
  const attempt =
    (prev && typeof prev.attempt === "number" ? prev.attempt : 0) + 1;

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roleInput = String(formData.get("role") ?? "").trim();

  if (!isValidEmail(email) || email.length > 160) {
    return { error: "Enter a valid email address.", attempt };
  }
  if (!(INVITE_ROLES as string[]).includes(roleInput)) {
    return { error: "Invite as manager or staff.", attempt };
  }
  const role = roleInput as VendorRole;

  const { supabase, access, user, isPlatformAdmin } = await requireVendorRole(
    formData.get("vendor") as string | null,
    { verifyWithAuthServer: true },
  );

  const quotaError = await checkMutationQuota("vendor", user.id);
  if (quotaError) return { error: quotaError, attempt };

  const notOwner = ownerOnly(access, isPlatformAdmin);
  if (notOwner) return { error: notOwner, attempt };

  const admin = createServiceClient();

  // An existing account joins directly — no invite link is needed.
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (profile) {
    const { data: existing } = await admin
      .from("vendor_members")
      .select("id")
      .eq("vendor_id", access.vendorId)
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (existing) {
      return { error: "That person is already a member of this shop.", attempt };
    }

    const { error: insertError } = await supabase
      .from("vendor_members")
      .insert({ vendor_id: access.vendorId, profile_id: profile.id, role });
    if (insertError) {
      return {
        error:
          insertError.code === "23505"
            ? "That person is already a member of this shop."
            : "Could not add the staff member. Please try again.",
        attempt,
      };
    }

    const sent = await sendVendorStaffAddedEmail(
      email,
      access.vendorName,
      role,
    );
    revalidatePath("/vendor/settings/staff");
    return {
      success: sent.sent
        ? `${email} was added to ${access.vendorName} as ${role}, and an email was sent.`
        : `${email} was added to ${access.vendorName} as ${role}, but the email could not be sent because SMTP is not configured. They can sign in with their existing account.`,
      attempt,
    };
  }

  // New account: mint the invite link without sending anything, create the
  // membership, then send the link through Gifto's own mail module.
  let redirectTo: string;
  try {
    redirectTo = await inviteRedirectTo();
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "The public site URL is not configured correctly.",
      attempt,
    };
  }

  let memberId: string | null = null;
  let inviteUrl: string | null = null;
  let createdNewUser = false;

  const { data: invite, error: inviteError } =
    await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo },
    });

  if (!inviteError && invite?.user && invite.properties?.action_link) {
    memberId = invite.user.id;
    inviteUrl = invite.properties.action_link;
    createdNewUser = true;
  } else {
    // Supabase rejects invitations to existing auth users. An auth user
    // without a profile row (e.g. created by the service role) lands here:
    // recover their id and send a password link instead of failing outright.
    const { data: link, error: linkError } =
      await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });

    if (linkError || !link.user || !link.properties?.action_link) {
      return {
        error:
          "Could not prepare the staff account. Check the email address and that email delivery is configured.",
        attempt,
      };
    }

    memberId = link.user.id;
    inviteUrl = link.properties.action_link;

    // The profile row is normally created by the on_auth_user_created
    // trigger; make sure one exists before the membership FK is used.
    await admin
      .from("profiles")
      .upsert({ id: memberId, email }, { onConflict: "id" });
  }

  const { error: memberError } = await admin.from("vendor_members").insert({
    vendor_id: access.vendorId,
    profile_id: memberId,
    role,
  });

  if (memberError) {
    if (createdNewUser) {
      await admin.auth.admin.deleteUser(memberId);
    }
    return {
      error:
        memberError.code === "23505"
          ? "That person is already a member of this shop."
          : "Could not add the staff member. The invitation was cancelled.",
      attempt,
    };
  }

  const sent = await sendVendorStaffInviteEmail(
    email,
    access.vendorName,
    role,
    inviteUrl,
  );

  revalidatePath("/vendor/settings/staff");
  return {
    success: sent.sent
      ? `An invitation was sent to ${email} to join ${access.vendorName} as ${role}.`
      : `${email} was invited to join ${access.vendorName} as ${role}, but the invitation email could not be sent because SMTP is not configured. Share the invitation again once email is set up.`,
    attempt,
  };
}

export async function changeVendorMemberRole(
  prev: VendorStaffState,
  formData: FormData,
): Promise<VendorStaffState> {
  const attempt =
    (prev && typeof prev.attempt === "number" ? prev.attempt : 0) + 1;

  const memberProfileId = String(formData.get("member_id") ?? "").trim();
  const roleInput = String(formData.get("role") ?? "").trim();

  if (!memberProfileId) {
    return { error: "Missing member id.", attempt };
  }
  if (!isVendorRole(roleInput)) {
    return { error: "Choose a valid role.", attempt };
  }
  const role = roleInput as VendorRole;

  const { supabase, access, user, isPlatformAdmin } = await requireVendorRole(
    formData.get("vendor") as string | null,
    { verifyWithAuthServer: true },
  );

  const quotaError = await checkMutationQuota("vendor", user.id);
  if (quotaError) return { error: quotaError, attempt };

  const notOwner = ownerOnly(access, isPlatformAdmin);
  if (notOwner) return { error: notOwner, attempt };

  const { data, error } = await supabase
    .from("vendor_members")
    .update({ role })
    .eq("vendor_id", access.vendorId)
    .eq("profile_id", memberProfileId)
    .select("profile_id")
    .maybeSingle();

  if (error) {
    return {
      error:
        error.code === "42501"
          ? "Your account doesn't have permission to change this member."
          : safeDbError(
              error,
              "The member's role could not be changed. Please try again.",
            ),
      attempt,
    };
  }
  if (!data) {
    return { error: "That member was not found in this shop.", attempt };
  }

  revalidatePath("/vendor/settings/staff");
  return { success: `Role updated to ${role}.`, attempt };
}

export async function removeVendorMember(
  prev: VendorStaffState,
  formData: FormData,
): Promise<VendorStaffState> {
  const attempt =
    (prev && typeof prev.attempt === "number" ? prev.attempt : 0) + 1;

  const memberProfileId = String(formData.get("member_id") ?? "").trim();

  if (!memberProfileId) {
    return { error: "Missing member id.", attempt };
  }

  const { supabase, access, user, isPlatformAdmin } = await requireVendorRole(
    formData.get("vendor") as string | null,
    { verifyWithAuthServer: true },
  );

  const quotaError = await checkMutationQuota("vendor", user.id);
  if (quotaError) return { error: quotaError, attempt };

  const notOwner = ownerOnly(access, isPlatformAdmin);
  if (notOwner) return { error: notOwner, attempt };

  const { data, error } = await supabase
    .from("vendor_members")
    .delete()
    .eq("vendor_id", access.vendorId)
    .eq("profile_id", memberProfileId)
    .select("profile_id")
    .maybeSingle();

  if (error) {
    return {
      error:
        error.code === "42501"
          ? "Your account doesn't have permission to remove this member."
          : safeDbError(
              error,
              "The member could not be removed. Please try again.",
            ),
      attempt,
    };
  }
  if (!data) {
    return { error: "That member was not found in this shop.", attempt };
  }

  revalidatePath("/vendor/settings/staff");
  return { success: "Member removed. Their access to this shop is revoked.", attempt };
}
