"use client";

import { useActionState, useEffect, useRef } from "react";

import { SUPPORT_CATEGORIES } from "@/lib/support-requests";

import { createSupportRequest, type SupportRequestState } from "./actions";

const fieldClass =
  "mt-1 w-full rounded-xl border border-line-strong bg-paper px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-berry focus:ring-2 focus:ring-berry/20";

export function SupportRequestForm({ vendorId }: { vendorId: string }) {
  const [state, submit, pending] = useActionState<
    SupportRequestState,
    FormData
  >(createSupportRequest, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && "success" in state) formRef.current?.reset();
  }, [state]);

  const errorValues = state && "error" in state ? state.values : null;

  return (
    <form ref={formRef} action={submit} className="mt-4">
      <input type="hidden" name="vendor" value={vendorId} />

      <label className="block text-sm font-medium text-ink">
        Topic
        <select
          name="category"
          required
          defaultValue={errorValues?.category ?? ""}
          className={fieldClass}
        >
          <option value="" disabled>
            Choose a topic
          </option>
          {SUPPORT_CATEGORIES.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-3 block text-sm font-medium text-ink">
        Subject
        <input
          type="text"
          name="subject"
          required
          minLength={5}
          maxLength={120}
          defaultValue={errorValues?.subject ?? ""}
          placeholder="Short summary of the issue"
          className={fieldClass}
        />
      </label>

      <label className="mt-3 block text-sm font-medium text-ink">
        What happened?
        <textarea
          name="body"
          required
          minLength={20}
          maxLength={4000}
          rows={5}
          defaultValue={errorValues?.body ?? ""}
          placeholder="Include order references, what you expected, and what happened."
          className={fieldClass}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-4 w-full rounded-full bg-berry px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send support request"}
      </button>

      {state && "error" in state ? (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}
      {state && "success" in state ? (
        <p
          role="status"
          className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800"
        >
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
