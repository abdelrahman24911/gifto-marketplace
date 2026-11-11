"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { removeOccasionImage, type OccasionSimpleState } from "./actions";

export function RemoveOccasionImageButton({
  occasionId,
  onRemoved,
}: {
  occasionId: string;
  onRemoved: (warning?: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<OccasionSimpleState>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [open]);

  useEffect(() => {
    if (!state?.success) return;
    dialogRef.current?.close();
    onRemoved(state.warning);
  }, [onRemoved, state]);

  function openDialog() {
    setState(null);
    setOpen(true);
  }

  function removeImage() {
    const formData = new FormData();
    formData.set("occasion_id", occasionId);

    startTransition(async () => {
      try {
        const nextState = await removeOccasionImage(null, formData);
        setState(nextState);
      } catch {
        setState({
          attempt: Date.now(),
          error: "Something went wrong while removing the image. Try again.",
        });
      }
    });
  }

  function closeDialog() {
    if (pending) return;
    dialogRef.current?.close();
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="rounded-full px-2 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-50 hover:text-red-800"
      >
        Remove image
      </button>

      {open ? (
        <dialog
          ref={dialogRef}
          onClose={() => setOpen(false)}
          onCancel={(event) => {
            if (pending) event.preventDefault();
          }}
          aria-labelledby={`remove-image-title-${occasionId}`}
          className="w-[min(92vw,28rem)] rounded-2xl border border-line bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/45 backdrop:backdrop-blur-sm"
        >
          <div className="p-5 sm:p-6">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-red-700">
              Image removal
            </p>
            <h2
              id={`remove-image-title-${occasionId}`}
              className="mt-2 font-display text-2xl leading-tight text-ink"
            >
              Remove this image?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              The image is detached immediately and the occasion will show no
              image until a new one is uploaded. Other unsaved changes on this
              form are not affected.
            </p>

            <div className="mt-5">
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
                  Keep image
                </button>
                <button
                  type="button"
                  onClick={removeImage}
                  disabled={pending}
                  className="rounded-full bg-red-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pending ? "Removing." : "Remove image"}
                </button>
              </div>
            </div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
