"use client";

import { useActionState, useState } from "react";

import { deleteConfirmationMatches } from "@/lib/confirm-delete";

import { deleteProduct, type DeleteProductState } from "./actions";

export function DeleteProductButton({
  productId,
  vendorId,
  productName,
}: {
  productId: string;
  vendorId: string;
  productName: string;
}) {
  const [state, formAction, pending] = useActionState<
    DeleteProductState,
    FormData
  >(deleteProduct, null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  // Deletion used to fire on a single unconfirmed click — it deleted the
  // demo "Plant Pot" product during QA (2026-11-23). The vendor must now
  // type the product name, and the server action re-checks it.
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
      >
        {`Delete “${productName}”`}
      </button>
    );
  }

  const matches = deleteConfirmationMatches(productName, typed);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="product_id" value={productId} />
      <input type="hidden" name="vendor" value={vendorId} />
      <p role="alert" className="text-sm leading-relaxed text-red-800">
        This removes “{productName}” from Gifto permanently. Its order
        history stays intact.
      </p>
      <label
        htmlFor="delete-confirmation"
        className="text-sm font-medium text-red-900"
      >
        Type <span className="font-semibold">{productName}</span> to confirm
      </label>
      <input
        id="delete-confirmation"
        name="confirmation"
        type="text"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        autoComplete="off"
        placeholder={productName}
        className="w-full max-w-sm rounded-md border border-red-300 bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending || !matches}
          className="rounded-md border border-red-300 bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Deleting…" : "Delete permanently"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setTyped("");
          }}
          className="rounded-md border border-line-strong bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-deep"
        >
          Cancel
        </button>
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : state && "success" in state ? (
        <p role="status" className="text-sm text-emerald-700">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
