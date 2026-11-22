"use client";

import { useActionState } from "react";

import {
  correctInspectionCondition,
  type CorrectInspectionState,
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

// R-05 correction path, admin side: Gifto fixes a wrong inspection call
// before restocking — the same RPC the shop's case page uses. Only the
// other two conditions are offered; the database refuses a same-value
// correction, a correction after restock, and a correction on a case
// that is not approved with a recorded receipt.
export function CorrectInspectionForm({
  caseId,
  currentCondition,
}: {
  caseId: string;
  currentCondition: InspectionCondition;
}) {
  const [state, formAction, pending] = useActionState<
    CorrectInspectionState,
    FormData
  >(correctInspectionCondition, null);
  const options = (
    Object.keys(CONDITION_COPY) as InspectionCondition[]
  ).filter((c) => c !== currentCondition);

  return (
    <form action={formAction} className="mt-3 grid gap-3">
      <input type="hidden" name="case_id" value={caseId} />
      <div>
        <span className="block text-xs font-semibold uppercase tracking-wide text-ink-mute">
          Correct the inspection
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
