"use client";

import { useActionState } from "react";

import { ConfirmSubmit } from "@/components/dashboard/confirm-submit";
import {
  TAG_DESCRIPTION_MAX,
  TAG_NAME_MAX,
} from "@/lib/tagging";

import {
  setTagActive,
  updateTag,
  type TagActionState,
  type TagToggleState,
} from "./actions";

export type AdminTagRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  productCount: number;
  occasionCount: number;
};

const inputClass =
  "w-full rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/15";
const labelClass = "flex flex-col gap-1.5 text-xs font-medium text-ink";

export function TagControls({ tag }: { tag: AdminTagRow }) {
  const [updateState, updateAction, updatePending] = useActionState<
    TagActionState,
    FormData
  >(updateTag, null);
  const [toggleState, toggleAction, togglePending] = useActionState<
    TagToggleState,
    FormData
  >(setTagActive, null);

  const values = updateState?.values ?? {
    name: tag.name,
    description: tag.description ?? "",
  };
  const formKey = updateState?.attempt ?? 0;

  return (
    <li className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words font-medium text-ink">{tag.name}</h3>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${
                tag.is_active
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-line-strong bg-paper-soft text-ink-mute"
              }`}
            >
              {tag.is_active ? "Active" : "Inactive"}
            </span>
          </div>
          <p className="mt-1 break-all font-mono text-xs text-ink-mute">
            /tags/{tag.slug}
          </p>
          {tag.description ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
              {tag.description}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-ink-mute">
            {tag.productCount}{" "}
            {tag.productCount === 1 ? "product assignment" : "product assignments"}{" "}
            · {tag.occasionCount}{" "}
            {tag.occasionCount === 1 ? "occasion rule" : "occasion rules"}
          </p>
        </div>

        <form action={toggleAction}>
          <input type="hidden" name="tag_id" value={tag.id} />
          <input
            type="hidden"
            name="state"
            value={tag.is_active ? "inactive" : "active"}
          />
          <ConfirmSubmit
            label={tag.is_active ? "Deactivate" : "Activate"}
            pendingLabel="Saving..."
            pending={togglePending}
            summary={
              tag.is_active
                ? `Deactivate “${tag.name}”? It stays on the ${tag.productCount} ${tag.productCount === 1 ? "product" : "products"} already using it, but vendors can no longer pick it.`
                : `Activate “${tag.name}” so vendors can pick it again?`
            }
            className="rounded-full border border-line-strong bg-paper-soft px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-50"
          />
        </form>
      </div>

      {toggleState?.error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-red-700">
          {toggleState.error}
        </p>
      ) : null}
      {toggleState?.success ? (
        <p role="status" className="mt-3 text-sm font-medium text-emerald-800">
          {toggleState.success}
        </p>
      ) : null}

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-ink-soft underline hover:text-ink">
          Edit tag details
        </summary>
        <form
          key={formKey}
          action={updateAction}
          className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-2"
        >
          <input type="hidden" name="tag_id" value={tag.id} />
          <label className={labelClass}>
            Name
            <input
              type="text"
              name="name"
              required
              minLength={2}
              maxLength={TAG_NAME_MAX}
              defaultValue={values.name}
              aria-invalid={Boolean(updateState?.fieldErrors?.name)}
              className={inputClass}
            />
            {updateState?.fieldErrors?.name ? (
              <span className="font-medium text-red-700">
                {updateState.fieldErrors.name}
              </span>
            ) : null}
          </label>

          <label className={labelClass}>
            Description
            <textarea
              name="description"
              rows={2}
              maxLength={TAG_DESCRIPTION_MAX}
              defaultValue={values.description}
              aria-invalid={Boolean(updateState?.fieldErrors?.description)}
              className={inputClass}
            />
            {updateState?.fieldErrors?.description ? (
              <span className="font-medium text-red-700">
                {updateState.fieldErrors.description}
              </span>
            ) : null}
          </label>

          <div className="sm:col-span-2">
            {updateState?.error ? (
              <p role="alert" className="mb-2 text-sm font-medium text-red-700">
                {updateState.error}
              </p>
            ) : null}
            {updateState?.success ? (
              <p
                role="status"
                className="mb-2 text-sm font-medium text-emerald-800"
              >
                {updateState.success}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={updatePending}
              className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              {updatePending ? "Saving..." : "Save tag details"}
            </button>
          </div>
        </form>
      </details>
    </li>
  );
}
