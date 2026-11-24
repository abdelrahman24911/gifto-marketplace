"use client";

import { useActionState } from "react";

import {
  changeVendorMemberRole,
  inviteVendorMember,
  removeVendorMember,
  revokeVendorInvitation,
  type VendorStaffState,
} from "./actions";

import type { VendorRole } from "@/lib/supabase/database.types";

export type StaffMember = {
  profileId: string;
  email: string;
  fullName: string | null;
  role: VendorRole;
  createdAt: string;
};

export type StaffInvitation = {
  id: string;
  email: string;
  role: VendorRole;
  createdAt: string;
  expiresAt: string;
};

const inputClass =
  "rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm text-ink";
const labelClass = "flex flex-col gap-1 text-sm text-ink";
const primaryClass =
  "rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60";
const secondaryClass =
  "rounded-full border border-line-strong bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-60";
const dangerClass =
  "rounded-full border border-red-300 bg-paper px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60";

const ROLE_LABELS: Record<VendorRole, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
};

function StateMessage({ state }: { state: VendorStaffState }) {
  if (!state) return null;
  if ("error" in state) {
    return (
      <p
        role="alert"
        className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {state.error}
      </p>
    );
  }
  return (
    <p role="status" className="mt-3 text-sm text-emerald-700">
      {state.success}
    </p>
  );
}

function InviteForm({ vendorId }: { vendorId: string }) {
  const [state, formAction, pending] = useActionState<
    VendorStaffState,
    FormData
  >(inviteVendorMember, null);

  return (
    <div>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="vendor" value={vendorId} />
        <label className={labelClass}>
          <span className="font-medium">Email</span>
          <input
            type="email"
            name="email"
            required
            maxLength={160}
            placeholder="teammate@example.com"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className="font-medium">Role</span>
          <select name="role" required defaultValue="staff" className={inputClass}>
            <option value="manager">Manager — confirm, ship and manage orders</option>
            <option value="staff">Staff — read-only</option>
          </select>
        </label>
        <button type="submit" disabled={pending} className={primaryClass}>
          {pending ? "Sending…" : "Send invitation"}
        </button>
      </form>
      <p className="mt-2 text-xs text-ink-mute">
        A new teammate gets an invitation email to set a password, then
        accepts from their account. Someone with a Gifto account gets a
        notice and accepts there too. Nothing changes until they accept.
        Ownership is transferred by changing a member&apos;s role, never by
        invitation.
      </p>
      <StateMessage state={state} />
    </div>
  );
}

function PendingInvitationRow({
  invitation,
  vendorId,
  canManage,
}: {
  invitation: StaffInvitation;
  vendorId: string;
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    VendorStaffState,
    FormData
  >(revokeVendorInvitation, null);

  return (
    <li className="rounded-xl border border-line bg-paper px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="break-all text-sm font-medium text-ink">
          {invitation.email}
        </p>
        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide text-amber-800">
          Pending
        </span>
      </div>
      <p className="mt-0.5 text-xs text-ink-mute">
        Invited as {ROLE_LABELS[invitation.role]}
      </p>
      <p className="mt-0.5 text-xs text-ink-mute">
        Sent {new Date(invitation.createdAt).toLocaleDateString("en-GB")} -
        expires{" "}
        {new Date(invitation.expiresAt).toLocaleDateString("en-GB")}
      </p>

      {canManage ? (
        <form action={formAction} className="mt-3">
          <input type="hidden" name="vendor" value={vendorId} />
          <input type="hidden" name="invitation_id" value={invitation.id} />
          <button
            type="submit"
            disabled={pending}
            className={dangerClass}
            onClick={(event) => {
              if (
                !window.confirm(
                  `Revoke the invitation for ${invitation.email}?`,
                )
              ) {
                event.preventDefault();
              }
            }}
          >
            {pending ? "Revoking." : "Revoke invitation"}
          </button>
        </form>
      ) : null}

      <StateMessage state={state} />
    </li>
  );
}

function MemberRow({
  member,
  vendorId,
  canManage,
  isSelf,
}: {
  member: StaffMember;
  vendorId: string;
  canManage: boolean;
  isSelf: boolean;
}) {
  const [roleState, roleAction, rolePending] = useActionState<
    VendorStaffState,
    FormData
  >(changeVendorMemberRole, null);
  const [removeState, removeAction, removePending] = useActionState<
    VendorStaffState,
    FormData
  >(removeVendorMember, null);

  return (
    <li className="rounded-xl border border-line bg-paper px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ink">
          {member.fullName ?? member.email}
          {isSelf ? <span className="text-ink-mute"> (you)</span> : null}
        </p>
        <span className="rounded-full border border-line-strong px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide text-ink-mute">
          {ROLE_LABELS[member.role]}
        </span>
      </div>
      <p className="mt-0.5 break-all text-xs text-ink-mute">{member.email}</p>
      <p className="mt-0.5 text-xs text-ink-mute">
        Joined {new Date(member.createdAt).toLocaleDateString("en-GB")}
      </p>

      {canManage ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <form action={roleAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="vendor" value={vendorId} />
            <input type="hidden" name="member_id" value={member.profileId} />
            <label className="sr-only" htmlFor={`role-${member.profileId}`}>
              Role for {member.email}
            </label>
            <select
              id={`role-${member.profileId}`}
              name="role"
              defaultValue={member.role}
              className={inputClass}
            >
              {(Object.keys(ROLE_LABELS) as VendorRole[]).map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={rolePending}
              className={secondaryClass}
            >
              {rolePending ? "Saving…" : "Change role"}
            </button>
          </form>

          <details className="rounded-xl border border-red-200 bg-red-50/50 px-3 py-2">
            <summary className={`${dangerClass} inline-flex cursor-pointer list-none`}>
              Remove
            </summary>
            <form action={removeAction} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="vendor" value={vendorId} />
              <input type="hidden" name="member_id" value={member.profileId} />
              <p className="text-sm text-ink">
                Remove {member.email} from this shop? They lose access to
                orders, products and settings immediately.
                {member.role === "owner"
                  ? " The last owner cannot be removed — promote someone else first."
                  : ""}
              </p>
              <button
                type="submit"
                disabled={removePending}
                onClick={(event) => {
                  if (
                    !window.confirm(
                      `Remove ${member.email} from this shop?`,
                    )
                  ) {
                    event.preventDefault();
                  }
                }}
                className={`${dangerClass} self-start`}
              >
                {removePending ? "Removing…" : "Confirm removal"}
              </button>
            </form>
          </details>
        </div>
      ) : null}

      <StateMessage state={roleState} />
      <StateMessage state={removeState} />
    </li>
  );
}

/**
 * Shop staff list and management (P1-14, H-07). Owners send pending
 * invitations, re-role and remove; managers and staff see the list read-only.
 */
export function StaffManagement({
  vendorId,
  members,
  invitations,
  invitationsUnavailable,
  canManage,
  selfId,
}: {
  vendorId: string;
  members: StaffMember[];
  invitations: StaffInvitation[];
  invitationsUnavailable: boolean;
  canManage: boolean;
  selfId: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        <section className="rounded-2xl border border-line bg-paper-soft p-5">
          <h2 className="font-display text-lg text-ink">Invite a teammate</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Managers can confirm, ship and manage orders. Staff can only view
            the shop.
          </p>
          <div className="mt-4">
            <InviteForm vendorId={vendorId} />
          </div>
        </section>
      ) : (
        <p className="rounded-2xl border border-line bg-paper-soft p-5 text-sm text-ink-soft">
          Only the shop owner can invite staff or change roles. You can see
          who has access to this shop below.
        </p>
      )}

      {canManage && !invitationsUnavailable ? (
        <section className="rounded-2xl border border-line bg-paper-soft p-5">
          <h2 className="font-display text-lg text-ink">
            Pending invitations ({invitations.length})
          </h2>
          {invitations.length === 0 ? (
            <p className="mt-2 text-sm text-ink-mute">
              No pending invitations. Invited people appear here until they
              accept or the invitation expires.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {invitations.map((invitation) => (
                <PendingInvitationRow
                  key={invitation.id}
                  invitation={invitation}
                  vendorId={vendorId}
                  canManage={canManage}
                />
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="rounded-2xl border border-line bg-paper-soft p-5">
        <h2 className="font-display text-lg text-ink">
          Shop staff ({members.length})
        </h2>
        {members.length === 0 ? (
          <p className="mt-2 text-sm text-ink-mute">
            No staff members found for this shop.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {members.map((member) => (
              <MemberRow
                key={member.profileId}
                member={member}
                vendorId={vendorId}
                canManage={canManage}
                isSelf={member.profileId === selfId}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
