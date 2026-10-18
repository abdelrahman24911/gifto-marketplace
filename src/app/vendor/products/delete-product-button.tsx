"use client";

import { useActionState } from "react";

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

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="product_id" value={productId} />
      <input type="hidden" name="vendor" value={vendorId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Deleting…" : `Delete “${productName}”`}
      </button>
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
