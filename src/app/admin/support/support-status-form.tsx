"use client";

import { useActionState } from "react";

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

  return (
    <form action={submit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`support-status-${id}`}>
        Support status
      </label>
      <select
        id={`support-status-${id}`}
        name="status"
        defaultValue={status}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900"
      >
        {SUPPORT_STATUSES.map((value) => (
          <option key={value} value={value}>
            {SUPPORT_STATUS_LABELS[value]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-900 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving…" : "Update"}
      </button>
      {state && "error" in state ? (
        <span role="alert" className="text-xs text-red-700">
          {state.error}
        </span>
      ) : null}
      {state && "success" in state ? (
        <span role="status" className="text-xs text-emerald-700">
          {state.success}
        </span>
      ) : null}
    </form>
  );
}
