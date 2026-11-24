"use server";

import { revalidatePath } from "next/cache";

import { isValidEmail } from "@/lib/guest-order";
import {
  sendVendorStaffInviteEmail,
  sendVendorStaffPendingInviteEmail,
} from "@/lib/mail";
import { checkMutationQuota } from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/site-url";
import { safeDbError } from "@/lib/safe-db-error";
import { createServiceClient } from "@/lib/supabase/service";
import { requireVendorRole } from "@/lib/vendor";

import type { VendorRole } from "@/lib/supabase/database.types";

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

function inviteRedirectTo(siteUrl: string): string {
  const url = new URL("/auth/accept-invite", siteUrl);
  url.searchParams.set("next", "/account/invitations");
  return url.toString();
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

  let siteUrl: string;
  try {
    siteUrl = getSiteUrl();
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "The public site URL is not configured correctly.",
      attempt,
    };
  }

  const admin = createServiceClient();

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
  }

  const { error: expireError } = await supabase
    .from("vendor_invitations")
    .update({ status: "expired" })
    .eq("vendor_id", access.vendorId)
    .eq("email", email)
    .eq("status", "pending")
    .lte("expires_at", new Date().toISOString());
  if (expireError) {
    return {
      error: "The invitation could not be prepared. Please try again.",
      attempt,
    };
  }

  const { data: pending } = await supabase
    .from("vendor_invitations")
    .select("id")
    .eq("vendor_id", access.vendorId)
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();
  if (pending) {
    return {
      error:
        "That email already has a pending invitation for this shop. Revoke it before inviting again.",
      attempt,
    };
  }

  if (profile) {
    const { error: insertError } = await supabase
      .from("vendor_invitations")
      .insert({
        vendor_id: access.vendorId,
        email,
        role,
        invited_by: user.id,
        auth_user_id: profile.id,
      });
    if (insertError) {
      return {
        error:
          insertError.code === "23505"
            ? "That email already has a pending invitation for this shop."
            : "The invitation could not be created. Please try again.",
        attempt,
      };
    }

    const sent = await sendVendorStaffPendingInviteEmail(
      email,
      access.vendorName,
      role,
      `${siteUrl}/account/invitations`,
    );
    revalidatePath("/vendor/settings/staff");
    return {
      success: sent.sent
        ? `${email} has been invited to join ${access.vendorName} as ${role}. They get access after accepting.`
        : `${email} has a pending invitation to join ${access.vendorName} as ${role}, but the email could not be sent. They can accept it from their account invitations page after signing in.`,
      attempt,
    };
  }

  const redirectTo = inviteRedirectTo(siteUrl);
  let inviteeUserId: string | null = null;
  let inviteUrl: string | null = null;
  let createdNewUser = false;

  const { data: invite, error: inviteError } =
    await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo },
    });

  if (!inviteError && invite?.user && invite.properties?.action_link) {
    inviteeUserId = invite.user.id;
    inviteUrl = invite.properties.action_link;
    createdNewUser = true;
  } else {
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

    inviteeUserId = link.user.id;
    inviteUrl = link.properties.action_link;

    await admin
      .from("profiles")
      .upsert({ id: inviteeUserId, email }, { onConflict: "id" });
  }

  if (!inviteeUserId || !inviteUrl) {
    return {
      error: "Could not prepare the staff account. Please try again.",
      attempt,
    };
  }

  const { error: invitationError } = await supabase
    .from("vendor_invitations")
    .insert({
      vendor_id: access.vendorId,
      email,
      role,
      invited_by: user.id,
      auth_user_id: inviteeUserId,
    });

  if (invitationError) {
    if (createdNewUser) {
      await admin.auth.admin.deleteUser(inviteeUserId);
    }
    return {
      error:
        invitationError.code === "23505"
          ? "That email already has a pending invitation for this shop."
          : "Could not create the invitation. The staff account was cancelled.",
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
      ? `An invitation was sent to ${email} to join ${access.vendorName} as ${role}. They get access after setting a password and accepting.`
      : `${email} has a pending invitation to join ${access.vendorName} as ${role}, but the email could not be sent because SMTP is not configured. Revoke the invitation and invite them again once email is set up.`,
    attempt,
  };
}

export async function revokeVendorInvitation(
  prev: VendorStaffState,
  formData: FormData,
): Promise<VendorStaffState> {
  const attempt =
    (prev && typeof prev.attempt === "number" ? prev.attempt : 0) + 1;

  const invitationId = String(formData.get("invitation_id") ?? "").trim();
  if (!invitationId) {
    return { error: "Missing invitation id.", attempt };
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
    .from("vendor_invitations")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
    })
    .eq("id", invitationId)
    .eq("vendor_id", access.vendorId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    return {
      error:
        error.code === "42501"
          ? "Your account doesn't have permission to revoke this invitation."
          : safeDbError(
              error,
              "The invitation could not be revoked. Please try again.",
            ),
      attempt,
    };
  }
  if (!data) {
    return { error: "That invitation is no longer pending.", attempt };
  }

  revalidatePath("/vendor/settings/staff");
  return { success: "Invitation revoked.", attempt };
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
