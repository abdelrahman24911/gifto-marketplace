"use client";

import { useActionState } from "react";

import {
  acceptVendorInvitation,
  type AcceptInvitationState,
} from "./actions";

export function AcceptInvitationForm({
  invitationId,
}: {
  invitationId: string;
}) {
  const [state, formAction, pending] = useActionState<
    AcceptInvitationState,
    FormData
  >(acceptVendorInvitation, null);

  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="invitation_id" value={invitationId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Accepting." : "Accept invitation"}
      </button>
      {state && "error" in state ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
