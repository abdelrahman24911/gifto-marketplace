"use client";

import { useActionState } from "react";

import { createCategory, type CategoryActionState } from "./actions";

const inputClass =
  "rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";

export function CategoryForm() {
  const [state, formAction, pending] = useActionState<CategoryActionState, FormData>(
    createCategory,
    null,
  );

  if (state && "success" in state) {
    return (
      <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
        {state.success}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state && "error" in state ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
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
          placeholder="e.g. Gift Boxes"
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Description
        <input
          type="text"
          name="description"
          maxLength={200}
          placeholder="Short line shown on the category page"
          className={inputClass}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add category"}
      </button>
    </form>
  );
}
