"use client";

import { useActionState } from "react";

import { setVendorAcceptingOrders, type PauseActionState } from "./actions";

const buttonClass =
  "rounded-full bg-berry px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60";

export function PauseOrders({
  vendorId,
  initialAccepting,
  canEdit,
}: {
  vendorId: string;
  initialAccepting: boolean;
  canEdit: boolean;
}) {
  const [state, submit, pending] = useActionState<PauseActionState, FormData>(
    setVendorAcceptingOrders,
    null,
  );

  const accepting =
    state && "accepting" in state ? state.accepting : initialAccepting;

  return (
    <section
      aria-labelledby="pause-heading"
      className="rounded-2xl border border-line bg-paper-soft p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="pause-heading" className="font-display text-lg text-ink">
            Order pause
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Pause new checkout while keeping your shop and products visible.
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-medium uppercase tracking-wide ${
            accepting
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {accepting ? "Accepting orders" : "Paused"}
        </span>
      </div>

      {canEdit ? (
        <form action={submit} className="mt-4">
          <input type="hidden" name="vendor" value={vendorId} />
          <input
            type="hidden"
            name="is_accepting_orders"
            value={accepting ? "false" : "true"}
          />
          <button
            type="submit"
            disabled={pending}
            className={
              accepting
                ? "rounded-full border border-warning/30 bg-warning-soft px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                : buttonClass
            }
          >
            {pending
              ? "Saving…"
              : accepting
                ? "Pause new orders"
                : "Resume orders"}
          </button>
        </form>
      ) : (
        <p className="mt-4 text-xs text-ink-mute">
          Only the shop owner can pause or resume orders.
        </p>
      )}

      {state && "error" in state ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state && "success" in state ? (
        <p role="status" className="mt-3 text-sm text-emerald-700">
          {state.success}
        </p>
      ) : null}
    </section>
  );
}
