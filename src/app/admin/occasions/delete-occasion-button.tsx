"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { deleteOccasion } from "./actions";

export function DeleteOccasionButton({
  occasionId,
  occasionName,
}: {
  occasionId: string;
  occasionName: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(deleteOccasion, null);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [open]);

  useEffect(() => {
    if (!state?.success) return;
    const params = new URLSearchParams({ deleted: "1" });
    if (state.warning) params.set("warning", "image");
    dialogRef.current?.close();
    router.push(`/admin/occasions?${params.toString()}`);
  }, [router, state]);

  function closeDialog() {
    if (pending) return;
    dialogRef.current?.close();
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Delete ${occasionName}`}
        className="rounded-full px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 hover:text-red-800"
      >
        Delete
      </button>

      {open ? (
        <dialog
          ref={dialogRef}
          onClose={() => setOpen(false)}
          onCancel={(event) => {
            if (pending) event.preventDefault();
          }}
          aria-labelledby={`delete-occasion-title-${occasionId}`}
          className="m-auto max-h-[90dvh] w-[min(92vw,28rem)] overflow-y-auto rounded-2xl border border-line bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/45 backdrop:backdrop-blur-sm"
        >
          <div className="p-5 sm:p-6">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-red-700">
              Permanent action
            </p>
            <h2
              id={`delete-occasion-title-${occasionId}`}
              className="mt-2 break-words font-display text-2xl leading-tight text-ink"
            >
              Delete “{occasionName}”?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              This removes the occasion and its managed image. Published
              occasions will disappear from public surfaces immediately. This
              cannot be undone.
            </p>

            <form action={formAction} className="mt-5">
              <input type="hidden" name="occasion_id" value={occasionId} />
              {state?.error ? (
                <p
                  role="alert"
                  className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                >
                  {state.error}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  autoFocus
                  onClick={closeDialog}
                  disabled={pending}
                  className="rounded-full border border-line-strong bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-soft disabled:opacity-60"
                >
                  Keep occasion
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-full bg-red-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pending ? "Deleting…" : "Delete permanently"}
                </button>
              </div>
            </form>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
