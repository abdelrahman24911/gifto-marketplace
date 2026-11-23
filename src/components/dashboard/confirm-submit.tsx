"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A submit button that asks once before acting. The first click reveals an
 * inline summary ("Change Nile Blossoms from Active to Suspended?") with
 * Confirm/Cancel; only the Confirm click submits the enclosing form, so the
 * form's server action runs unchanged. The confirm step closes when the
 * action settles, leaving the result message visible.
 *
 * Used for every one-click money or destructive action across both
 * dashboards: shop status/commission changes, tag approve/reject/deactivate,
 * support status updates, pausing orders, occasion publish/hide. Product
 * deletion has its own typed confirmation (see DeleteProductButton).
 */
export function ConfirmSubmit({
  label,
  pendingLabel,
  pending,
  summary,
  confirmLabel = "Confirm",
  className,
  ariaLabel,
  name,
  value,
  disabled,
}: {
  label: string;
  pendingLabel: string;
  pending: boolean;
  summary: string;
  confirmLabel?: string;
  className?: string;
  ariaLabel?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) setConfirming(false);
    wasPending.current = pending;
  }, [pending]);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={disabled || pending}
        aria-label={ariaLabel}
        className={className}
      >
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-2">
      <span
        role="alert"
        className="text-xs font-medium leading-relaxed text-ink"
      >
        {summary}
      </span>
      <span className="inline-flex flex-wrap gap-2">
        <button
          type="submit"
          name={name}
          value={value}
          disabled={pending}
          className={className}
        >
          {pending ? pendingLabel : confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded-full border border-line-strong bg-paper px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </span>
    </span>
  );
}
