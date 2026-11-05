"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  saveProduct,
  type ProductActionState,
  type ProductFormValues,
} from "./actions";

import type { ProductStatus } from "@/lib/supabase/database.types";

type Category = { id: string; name: string };

const inputClass =
  "w-full rounded-md border border-line-strong px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-berry focus:outline-none focus:ring-1 focus:ring-berry";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-ink-soft";

const STATUS_HELP: Record<ProductStatus, string> = {
  draft: "Only your shop can see drafts.",
  active: "Visible to everyone browsing Gifto.",
  archived: "Archived products are hidden everywhere.",
};

export function ProductForm({
  initial,
  productId,
  categories,
  vendorId,
}: {
  initial: ProductFormValues;
  productId?: string;
  categories: Category[];
  vendorId: string;
}) {
  const [state, formAction, pending] = useActionState<
    ProductActionState,
    FormData
  >(saveProduct, null);

  // React 19 resets the form after each action, so re-mount with the echoed
  // values on failure instead of silently discarding what was typed.
  const values =
    state && "values" in state ? state.values : (initial as ProductFormValues);
  const formKey =
    state && "attempt" in state ? `state-${state.attempt}` : "pristine";

  if (state && "success" in state) {
    return (
      <div
        role="status"
        className="flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"
      >
        <p className="text-sm text-emerald-800">{state.success}</p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/vendor/products/${state.productId}?vendor=${vendorId}`}
            className="rounded-md bg-berry px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-berry-deep"
          >
            Edit product
          </Link>
          <Link
            href={`/vendor/products?vendor=${vendorId}`}
            className="rounded-md border border-line-strong bg-paper-soft px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-deep"
          >
            Back to products
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="vendor" value={vendorId} />
      {productId ? (
        <input type="hidden" name="product_id" value={productId} />
      ) : null}

      {state && "error" in state ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}

      <label className={labelClass}>
        Product name
        <input
          type="text"
          name="name"
          required
          minLength={2}
          maxLength={120}
          defaultValue={values.name}
          placeholder="e.g. Handmade gift box"
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Description
        <textarea
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={values.description}
          placeholder="What is inside, materials, occasion…"
          className={inputClass}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className={labelClass}>
          Price (EGP)
          <input
            type="text"
            name="price"
            inputMode="decimal"
            required
            defaultValue={values.price}
            placeholder="150.00"
            className={inputClass}
          />
          <span className="text-xs font-normal text-ink-mute">
            Up to two decimals, e.g. 149.50
          </span>
        </label>

        {productId ? (
          <div className="flex flex-col gap-1 text-sm font-medium text-ink-soft">
            Stock
            <p className="py-2 text-lg font-semibold text-ink">
              {values.stock}
            </p>
            <Link
              href={`/vendor/products/${productId}/inventory?vendor=${vendorId}`}
              className="text-xs font-normal text-ink-soft underline hover:text-ink"
            >
              Adjust stock and view history
            </Link>
          </div>
        ) : (
          <label className={labelClass}>
            Opening stock
            <input
              type="number"
              name="stock"
              min={0}
              max={1_000_000}
              step={1}
              defaultValue={values.stock}
              className={inputClass}
            />
            <span className="text-xs font-normal text-ink-mute">
              Set once when the product is created
            </span>
          </label>
        )}

        <label className={labelClass}>
          Category
          <select
            name="category_id"
            defaultValue={values.categoryId}
            className={inputClass}
          >
            <option value="">Uncategorised</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className={labelClass}>
        Visibility
        <select
          name="status"
          defaultValue={values.status}
          className={inputClass}
        >
          <option value="draft">Draft — hidden from customers</option>
          <option value="active">Active — visible on Gifto</option>
          <option value="archived">Archived — retired, hidden everywhere</option>
        </select>
        <span className="text-xs font-normal text-ink-mute">
          {STATUS_HELP[values.status]}
        </span>
      </label>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-berry px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save product"}
        </button>
        <Link
          href={`/vendor/products?vendor=${vendorId}`}
          className="rounded-md border border-line-strong px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-deep"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
