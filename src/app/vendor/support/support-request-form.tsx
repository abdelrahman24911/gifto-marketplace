"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  SUPPORT_CATEGORIES,
  supportCategoryLabel,
} from "@/lib/support-requests";

import { createSupportRequest, type SupportRequestState } from "./actions";

const fieldClass =
  "mt-1 w-full rounded-xl border border-line-strong bg-paper px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-berry focus:ring-2 focus:ring-berry/20";

type Preview = { category: string; subject: string; body: string };

export function SupportRequestForm({ vendorId }: { vendorId: string }) {
  const [state, submit, pending] = useActionState<
    SupportRequestState,
    FormData
  >(createSupportRequest, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    if (state && "success" in state) {
      formRef.current?.reset();
    }
  }, [state]);

  // A successful send dismisses the preview; the stored values are replaced
  // the next time the vendor reviews a request.
  const showPreview =
    preview !== null && !(state && "success" in state);

  const errorValues = state && "error" in state ? state.values : null;

  // Read the filled-in values straight from the form so the preview shows
  // exactly what will be sent. The fields stay mounted while previewing
  // (hidden, not unmounted) so nothing is lost when going back to edit.
  const handleReview = () => {
    const form = formRef.current;
    if (!form) return;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    setPreview({
      category: String(data.get("category") ?? ""),
      subject: String(data.get("subject") ?? ""),
      body: String(data.get("body") ?? ""),
    });
  };

  return (
    <form ref={formRef} action={submit} className="mt-4">
      <input type="hidden" name="vendor" value={vendorId} />

      <div hidden={showPreview}>
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
          type="button"
          onClick={handleReview}
          className="mt-4 w-full rounded-full bg-berry px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep"
        >
          Review request
        </button>
      </div>

      {showPreview && preview ? (
        <div className="rounded-2xl border border-line bg-paper-soft p-4">
          <p className="text-sm font-medium text-ink">
            Check before you send
          </p>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-mute">
                Topic
              </dt>
              <dd className="mt-0.5 text-ink">
                {supportCategoryLabel(preview.category)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-mute">
                Subject
              </dt>
              <dd className="mt-0.5 text-ink">{preview.subject}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-mute">
                What happened?
              </dt>
              <dd className="mt-0.5 whitespace-pre-line text-ink-soft">
                {preview.body}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-ink-mute">
            Gifto support will see exactly this. You can still edit it.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="rounded-full border border-line-strong bg-paper px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft"
            >
              Edit request
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-berry px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Sending…" : "Send support request"}
            </button>
          </div>
        </div>
      ) : null}

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
