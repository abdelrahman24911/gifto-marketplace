"use client";

import { useActionState } from "react";

import { createCategory, type CategoryActionState } from "../actions";

const inputClass =
  "w-full rounded-xl border border-line-strong bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/15";
const labelClass =
  "flex flex-col gap-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-mute";

export function CategoryForm() {
  const [state, formAction, pending] = useActionState<
    CategoryActionState,
    FormData
  >(createCategory, null);

  if (state && "success" in state) {
    return (
      <div className="rounded-2xl border border-success/25 bg-success-soft px-4 py-4">
        <p role="status" className="text-sm leading-relaxed text-ink">
          {state.success}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 text-sm font-semibold text-berry underline decoration-berry/30 underline-offset-4 hover:text-berry-deep"
        >
          Add another category
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-ink-soft">
        Categories are shared by every shop. The slug is generated from the
        name and becomes the public catalog URL.
      </p>

      {state && "error" in state ? (
        <p
          role="alert"
          className="rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-ink"
        >
          {state.error}
        </p>
      ) : null}

      <label className={labelClass}>
        Category name
        <input
          type="text"
          name="name"
          required
          minLength={2}
          maxLength={80}
          placeholder="e.g. Gift boxes"
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Description
        <input
          type="text"
          name="description"
          maxLength={200}
          placeholder="e.g. A short line shown on the category page"
          className={inputClass}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-berry px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add category"}
      </button>
    </form>
  );
}
