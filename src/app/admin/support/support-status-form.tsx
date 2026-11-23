"use client";

import { useActionState, useState } from "react";

import { ConfirmSubmit } from "@/components/dashboard/confirm-submit";
import {
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
} from "@/lib/support-requests";

import {
  updateSupportRequestStatus,
  type SupportStatusState,
} from "./actions";

import type { SupportRequestStatus } from "@/lib/supabase/database.types";

export function SupportStatusForm({
  id,
  status,
}: {
  id: string;
  status: SupportRequestStatus;
}) {
  const [state, submit, pending] = useActionState<
    SupportStatusState,
    FormData
  >(updateSupportRequestStatus, null);
  const [nextStatus, setNextStatus] = useState<SupportRequestStatus>(status);

  return (
    <form action={submit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`support-status-${id}`}>
        Support status
      </label>
      <select
        id={`support-status-${id}`}
        name="status"
        value={nextStatus}
        onChange={(event) =>
          setNextStatus(event.target.value as SupportRequestStatus)
        }
        className="rounded-full border border-line-strong bg-paper px-3 py-1.5 text-xs text-ink focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/15"
      >
        {SUPPORT_STATUSES.map((value) => (
          <option key={value} value={value}>
            {SUPPORT_STATUS_LABELS[value]}
          </option>
        ))}
      </select>
      <ConfirmSubmit
        label="Update"
        pendingLabel="Saving…"
        pending={pending}
        disabled={nextStatus === status}
        summary={`Change this request from ${SUPPORT_STATUS_LABELS[status]} to ${SUPPORT_STATUS_LABELS[nextStatus]}?`}
        className="rounded-full border border-line-strong bg-paper-soft px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft disabled:cursor-not-allowed disabled:opacity-60"
      />
      {state && "error" in state ? (
        <span role="alert" className="text-xs text-danger">
          {state.error}
        </span>
      ) : null}
      {state && "success" in state ? (
        <span role="status" className="text-xs text-success">
          {state.success}
        </span>
      ) : null}
    </form>
  );
}
