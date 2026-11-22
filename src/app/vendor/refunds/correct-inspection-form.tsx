"use client";

import { useActionState } from "react";

import {
  correctInspectionCondition,
  type VendorRefundState,
} from "./actions";

const CONDITION_COPY = {
  good: {
    label: "Good condition",
    hint: "The customer pays the return courier; the item can be restocked after inspection.",
  },
  wrong_item: {
    label: "Wrong item",
    hint: "The shop pays the return courier; the item is not the product ordered, so it is never restocked against this order.",
  },
  damaged: {
    label: "Damaged",
    hint: "The shop pays the return courier; a damaged item is never restocked.",
  },
} as const;

type InspectionCondition = keyof typeof CONDITION_COPY;

// R-05 correction path: the shop fixes a wrong inspection call before
// Gifto restocks. Only the other two conditions are offered — the
// current one is already recorded, and the database refuses a
// same-value correction.
export function CorrectInspectionForm({
  caseId,
  vendorId,
  currentCondition,
}: {
  caseId: string;
  vendorId: string;
  currentCondition: InspectionCondition;
}) {
  const [state, formAction, pending] = useActionState<
    VendorRefundState,
    FormData
  >(correctInspectionCondition, null);
  const options = (
    Object.keys(CONDITION_COPY) as InspectionCondition[]
  ).filter((c) => c !== currentCondition);

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="case_id" value={caseId} />
      <input type="hidden" name="vendor_id" value={vendorId} />
      <div>
        <span className="block text-xs font-semibold uppercase tracking-wide text-ink-mute">
          What actually arrived
        </span>
        <div className="mt-2 grid gap-2">
          {options.map((condition, index) => (
            <label
              key={condition}
              className="flex items-start gap-2 text-sm text-ink"
            >
              <input
                type="radio"
                name="condition"
                value={condition}
                defaultChecked={index === 0}
                className="mt-0.5"
              />
              <span>
                {CONDITION_COPY[condition].label}
                <span className="block text-xs text-ink-mute">
                  {CONDITION_COPY[condition].hint}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Correcting…" : "Correct the inspection"}
        </button>
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state && "success" in state ? (
        <p role="status" className="text-sm text-success">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
