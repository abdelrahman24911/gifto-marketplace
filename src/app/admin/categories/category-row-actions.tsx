"use client";

import { useActionState } from "react";

import {
  deleteCategory,
  updateCategory,
  type CategoryMutationState,
} from "../actions";

const inputClass =
  "w-full rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/15";
const labelClass =
  "flex flex-col gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-mute";

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  position: number;
  is_active: boolean;
};

function StateMessage({ state }: { state: CategoryMutationState }) {
  if (!state) return null;
  if (state.error) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-ink"
      >
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p
        role="status"
        className="rounded-lg border border-success/25 bg-success-soft px-3 py-2 text-sm text-ink"
      >
        {state.success}
      </p>
    );
  }
  return null;
}

export function CategoryRowActions({
  category,
  productCount,
  productCountLabel,
}: {
  category: Category;
  productCount: number;
  productCountLabel: string;
}) {
  const [updateState, updateFormAction, updatePending] = useActionState<
    CategoryMutationState,
    FormData
  >(updateCategory, null);
  const [deleteState, deleteFormAction, deletePending] = useActionState<
    CategoryMutationState,
    FormData
  >(deleteCategory, null);

  return (
    <div className="mt-3 flex flex-col gap-2">
      <details className="group">
        <summary className="cursor-pointer list-none text-xs font-semibold text-berry marker:content-none hover:text-berry-deep">
          Edit category
        </summary>
        <form
          action={updateFormAction}
          className="mt-3 flex flex-col gap-3 rounded-xl border border-line bg-paper p-3"
        >
          <input type="hidden" name="category_id" value={category.id} />
          <StateMessage state={updateState} />

          <label className={labelClass}>
            Name
            <input
              type="text"
              name="name"
              required
              minLength={2}
              maxLength={80}
              defaultValue={category.name}
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Description
            <input
              type="text"
              name="description"
              maxLength={200}
              defaultValue={category.description ?? ""}
              className={inputClass}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Position
              <input
                type="number"
                name="position"
                required
                min={0}
                max={10_000}
                step={1}
                defaultValue={category.position}
                className={inputClass}
              />
            </label>

            <label className="flex items-center gap-2 self-end rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm text-ink">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={category.is_active}
                className="h-4 w-4 accent-berry"
              />
              Visible
            </label>
          </div>

          <p className="text-xs leading-relaxed text-ink-mute">
            Public URL stays{" "}
            <span className="font-mono">/categories/{category.slug}</span> when
            you rename this category.
          </p>

          <button
            type="submit"
            disabled={updatePending}
            className="self-start rounded-full bg-berry px-4 py-2 text-xs font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            {updatePending ? "Saving…" : "Save changes"}
          </button>
        </form>
      </details>

      <details className="group">
        <summary className="cursor-pointer list-none text-xs font-semibold text-danger marker:content-none hover:underline">
          Delete category
        </summary>
        <div className="mt-3 rounded-xl border border-danger/20 bg-danger-soft/50 p-3">
          <p className="text-sm leading-relaxed text-ink-soft">
            {productCount > 0
              ? `${productCountLabel} ${productCount === 1 ? "product uses" : "products use"} this category. They will stay in the catalogue but become uncategorised.`
              : "No products currently use this category."}{" "}
            Occasion links to this category will also be removed. This cannot be
            undone.
          </p>
          <form action={deleteFormAction} className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="category_id" value={category.id} />
            <StateMessage state={deleteState} />
            <label className="flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="confirm"
                value="yes"
                required
                className="mt-0.5 h-4 w-4 accent-danger"
              />
              I understand and want to delete this category.
            </label>
            <button
              type="submit"
              disabled={deletePending}
              className="self-start rounded-full border border-danger/30 bg-paper px-4 py-2 text-xs font-semibold text-danger transition-colors hover:bg-danger hover:text-paper disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deletePending ? "Deleting…" : "Delete category"}
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}
