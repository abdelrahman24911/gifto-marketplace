"use client";

import { useActionState } from "react";

import { claimGuestOrder, type ClaimOrderState } from "./claim-actions";

export function ClaimOrderButton({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState<
    ClaimOrderState,
    FormData
  >(claimGuestOrder, null);

  return (
    <div className="mt-4">
      <form action={formAction}>
        <input type="hidden" name="order_id" value={orderId} readOnly />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Claiming…" : "Claim this order for my account"}
        </button>
      </form>
      <p className="mt-2 text-xs text-zinc-500">
        Moves this guest order onto your signed-in account so it stays in
        your order history after this browser&apos;s link expires.
      </p>
      {state && "error" in state ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
