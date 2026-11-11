"use client";

import { useActionState } from "react";

import {
  TAG_DESCRIPTION_MAX,
  TAG_NAME_MAX,
} from "@/lib/tagging";

import { createTag, type TagActionState } from "./actions";

const inputClass =
  "w-full rounded-lg border border-line-strong bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/15";
const labelClass = "flex flex-col gap-1.5 text-sm font-medium text-ink";

export function TagForm() {
  const [state, formAction, pending] = useActionState<
    TagActionState,
    FormData
  >(createTag, null);
  const values = state?.values;
  const formKey = state?.attempt ?? 0;

  return (
    <form
      key={formKey}
      action={formAction}
      className="flex flex-col gap-4 rounded-2xl border border-line bg-paper-soft p-5"
    >
      {state?.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          {state.success}
        </p>
      ) : null}

      <label className={labelClass}>
        Tag name
        <input
          type="text"
          name="name"
          required
          minLength={2}
          maxLength={TAG_NAME_MAX}
          defaultValue={values?.name ?? ""}
          placeholder="e.g. Thoughtful"
          aria-invalid={Boolean(state?.fieldErrors?.name)}
          className={inputClass}
        />
        {state?.fieldErrors?.name ? (
          <span className="text-xs font-medium text-red-700">
            {state.fieldErrors.name}
          </span>
        ) : null}
      </label>

      <label className={labelClass}>
        Description
        <textarea
          name="description"
          rows={3}
          maxLength={TAG_DESCRIPTION_MAX}
          defaultValue={values?.description ?? ""}
          placeholder="What kinds of products should carry this tag?"
          aria-invalid={Boolean(state?.fieldErrors?.description)}
          className={inputClass}
        />
        {state?.fieldErrors?.description ? (
          <span className="text-xs font-medium text-red-700">
            {state.fieldErrors.description}
          </span>
        ) : (
          <span className="text-xs font-normal text-ink-mute">
            Optional guidance for vendors and admins.
          </span>
        )}
      </label>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Creating..." : "Create tag"}
      </button>
    </form>
  );
}
