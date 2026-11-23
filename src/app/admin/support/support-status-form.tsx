"use client";

import { useActionState, useState } from "react";

import { ConfirmSubmit } from "@/components/dashboard/confirm-submit";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import {
  SUPPORT_REPLY_MAX,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
} from "@/lib/support-requests";

import {
  updateSupportRequestStatus,
  type SupportStatusState,
} from "./actions";

import type { SupportRequestStatus } from "@/lib/supabase/database.types";

/**
 * Reply + status for one support request. The reply is what the shop sees
 * in its dashboard (and in the status email when email is configured);
 * until now the admin could only change the status, so a vendor had no way
 * to see what Gifto actually said.
 */
export function SupportStatusForm({
  id,
  status,
  reply,
  repliedAt,
}: {
  id: string;
  status: SupportRequestStatus;
  reply: string | null;
  repliedAt: string | null;
}) {
  const [state, submit, pending] = useActionState<
    SupportStatusState,
    FormData
  >(updateSupportRequestStatus, null);
  const [nextStatus, setNextStatus] = useState<SupportRequestStatus>(status);
  const [replyText, setReplyText] = useState(reply ?? "");

  const replyChanged = replyText.trim() !== (reply ?? "").trim();
  const statusChanged = nextStatus !== status;
  const summary = [
    statusChanged
      ? `Change this request from ${SUPPORT_STATUS_LABELS[status]} to ${SUPPORT_STATUS_LABELS[nextStatus]}?`
      : null,
    replyChanged
      ? `Save this reply for the shop: “${replyText.trim().slice(0, 100)}${replyText.trim().length > 100 ? "…" : ""}”`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="mt-4 border-t border-line pt-4">
      {reply ? (
        <div className="rounded-xl border border-line bg-paper px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">
            Gifto&apos;s reply
            {repliedAt
              ? ` · ${new Date(repliedAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: BUSINESS_TIME_ZONE,
                })}`
              : ""}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
            {reply}
          </p>
        </div>
      ) : null}

      <form action={submit} className="mt-3">
        <input type="hidden" name="id" value={id} />
        <label
          className="block text-sm font-medium text-ink"
          htmlFor={`support-reply-${id}`}
        >
          Reply to the shop
        </label>
        <textarea
          id={`support-reply-${id}`}
          name="reply"
          rows={3}
          maxLength={SUPPORT_REPLY_MAX}
          value={replyText}
          onChange={(event) => setReplyText(event.target.value)}
          placeholder="Write what the shop should see — it appears in their dashboard and in the status email."
          className="mt-1 w-full rounded-xl border border-line-strong bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-mute focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/20"
        />
        <p className="mt-1 text-xs text-ink-mute">
          Leave the reply unchanged to keep the current one. An empty reply
          changes nothing.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
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
            disabled={!statusChanged && !replyChanged}
            summary={summary}
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
        </div>
      </form>
    </div>
  );
}
