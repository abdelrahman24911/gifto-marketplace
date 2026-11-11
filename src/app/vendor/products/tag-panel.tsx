"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useState } from "react";

import { useUnsavedChangesGuard } from "@/components/navigation-guard";
import {
  PRODUCT_TAG_LIMIT,
  TAG_DESCRIPTION_MAX,
  TAG_NAME_MAX,
  tagSelectionIsDirty,
  toggleTagSelection,
} from "@/lib/tagging";

import {
  saveProductTags,
  suggestProductTag,
  type ProductTagAssignmentState,
  type ProductTagSuggestionState,
} from "./tag-actions";

import type { ProductTagOption, ProductTagSuggestion } from "./tag-data";

const primaryButtonClass =
  "rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass =
  "rounded-full border border-line-strong bg-paper px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "w-full rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/15";
const labelClass = "flex flex-col gap-1.5 text-sm font-medium text-ink";

const STATUS_STYLES: Record<ProductTagSuggestion["status"], string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-900",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rejected: "border-line-strong bg-paper-soft text-ink-mute",
};

function FieldError({ message }: { message?: string }) {
  return message ? (
    <span className="text-xs font-medium text-red-700">{message}</span>
  ) : null;
}

export function ProductTagPanel({
  productId,
  vendorId,
  canManage,
  tags,
  initialTagIds,
  inactiveSelectionCount,
  suggestions,
}: {
  productId: string;
  vendorId: string;
  canManage: boolean;
  tags: ProductTagOption[];
  initialTagIds: string[];
  inactiveSelectionCount: number;
  suggestions: ProductTagSuggestion[];
}) {
  const titleId = useId();
  const helpId = useId();
  const prefix = useId();
  const router = useRouter();
  const [selectedTagIds, setSelectedTagIds] = useState(initialTagIds);
  const [savedTagIds, setSavedTagIds] = useState(initialTagIds);
  const [handledAssignment, setHandledAssignment] = useState<number | null>(
    null,
  );
  const [handledSuggestion, setHandledSuggestion] = useState<number | null>(
    null,
  );
  const [assignmentState, assignmentAction, assignmentPending] =
    useActionState<ProductTagAssignmentState, FormData>(saveProductTags, null);
  const [suggestionState, suggestionAction, suggestionPending] =
    useActionState<ProductTagSuggestionState, FormData>(
      suggestProductTag,
      null,
    );

  if (
    assignmentState?.success &&
    assignmentState.attempt !== handledAssignment
  ) {
    setHandledAssignment(assignmentState.attempt);
    setSavedTagIds(assignmentState.tagIds ?? selectedTagIds);
  }

  if (
    suggestionState?.success &&
    suggestionState.attempt !== handledSuggestion
  ) {
    setHandledSuggestion(suggestionState.attempt);
  }

  const savedAssignmentAttempt = assignmentState?.success
    ? assignmentState.attempt
    : null;
  const savedSuggestionAttempt = suggestionState?.success
    ? suggestionState.attempt
    : null;

  useEffect(() => {
    if (savedAssignmentAttempt !== null) router.refresh();
  }, [router, savedAssignmentAttempt]);

  useEffect(() => {
    if (savedSuggestionAttempt !== null) router.refresh();
  }, [router, savedSuggestionAttempt]);

  const dirty = tagSelectionIsDirty(selectedTagIds, savedTagIds);
  useUnsavedChangesGuard(canManage && dirty);
  const atLimit = selectedTagIds.length >= PRODUCT_TAG_LIMIT;
  const assignmentSuccess = dirty ? null : assignmentState?.success;
  const suggestionValues =
    suggestionState?.values ?? { name: "", description: "" };
  const suggestionFormKey = suggestionState?.attempt ?? 0;

  function toggle(tagId: string, checked: boolean) {
    setSelectedTagIds((current) =>
      toggleTagSelection(current, tagId, checked),
    );
  }

  function discard() {
    if (assignmentPending) return;
    setSelectedTagIds(savedTagIds);
  }

  return (
    <section
      aria-labelledby={titleId}
      className="mt-8 rounded-2xl border border-line bg-paper-soft p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-berry">
            Occasion discovery
          </p>
          <h2
            id={titleId}
            className="mt-1 font-display text-2xl text-ink"
          >
            Product tags
          </h2>
        </div>
        <span className="rounded-full border border-line-strong bg-paper px-3 py-1 text-xs font-semibold text-ink-soft">
          {selectedTagIds.length} / {PRODUCT_TAG_LIMIT}
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Approved tags help this product appear in matching occasions. Choose
        the terms that genuinely describe it.
      </p>

      {!canManage ? (
        <div className="mt-4">
          {initialTagIds.length === 0 ? (
            <p className="text-sm text-ink-mute">No tags assigned.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {tags
                .filter((tag) => initialTagIds.includes(tag.id))
                .map((tag) => (
                  <li
                    key={tag.id}
                    className="rounded-full border border-line-strong bg-paper px-3 py-1 text-sm text-ink"
                  >
                    {tag.name}
                  </li>
                ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-mute">
            Shop owners and managers can edit product tags.
          </p>
        </div>
      ) : (
        <>
          {inactiveSelectionCount > 0 ? (
            <p
              role="note"
              className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900"
            >
              {inactiveSelectionCount}{" "}
              {inactiveSelectionCount === 1
                ? "inactive tag assignment is"
                : "inactive tag assignments are"}{" "}
              hidden and will be removed the next time you save.
            </p>
          ) : null}

          <form action={assignmentAction} className="mt-4">
            <input type="hidden" name="product_id" value={productId} />
            <input type="hidden" name="vendor" value={vendorId} />

            {tags.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line-strong bg-paper px-4 py-5 text-sm text-ink-mute">
                No active tags are available yet. Suggest a missing term below.
              </p>
            ) : (
              <fieldset>
                <legend className="sr-only">Choose product tags</legend>
                <p id={helpId} className="text-xs text-ink-mute">
                  Select up to {PRODUCT_TAG_LIMIT}. Tags apply immediately to
                  automatic occasion matching after saving.
                </p>
                <ul
                  aria-describedby={helpId}
                  className="mt-3 grid gap-2 sm:grid-cols-2"
                >
                  {tags.map((tag) => {
                    const inputId = `${prefix}-${tag.id}`;
                    const checked = selectedTagIds.includes(tag.id);
                    return (
                      <li key={tag.id}>
                        <label
                          htmlFor={inputId}
                          className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink transition-colors hover:border-berry/40"
                        >
                          <input
                            id={inputId}
                            type="checkbox"
                            name="tag_ids"
                            value={tag.id}
                            checked={checked}
                            disabled={
                              assignmentPending || (!checked && atLimit)
                            }
                            onChange={(event) =>
                              toggle(tag.id, event.target.checked)
                            }
                            className="mt-0.5 h-4 w-4 rounded border-line-strong text-berry focus:ring-berry"
                          />
                          <span className="min-w-0">
                            <span className="block break-words">{tag.name}</span>
                            {tag.description ? (
                              <span className="mt-0.5 block text-xs font-normal leading-snug text-ink-mute">
                                {tag.description}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            )}

            {assignmentState?.error ? (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
              >
                {assignmentState.error}
              </p>
            ) : null}
            {assignmentSuccess ? (
              <p
                role="status"
                className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800"
              >
                {assignmentSuccess}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={assignmentPending || !dirty}
                className={primaryButtonClass}
              >
                {assignmentPending ? "Saving..." : "Save product tags"}
              </button>
              <button
                type="button"
                onClick={discard}
                disabled={assignmentPending || !dirty}
                className={secondaryButtonClass}
              >
                Discard tag changes
              </button>
            </div>
          </form>

          <details className="mt-6 border-t border-line pt-5">
            <summary className="cursor-pointer text-sm font-medium text-ink-soft underline hover:text-ink">
              Suggest a missing tag
            </summary>
            <p className="mt-2 text-xs leading-relaxed text-ink-mute">
              Suggestions go to the platform admin queue. Approved tags become
              available to every shop.
            </p>

            <form
              key={suggestionFormKey}
              action={suggestionAction}
              className="mt-3 grid gap-3 sm:grid-cols-2"
            >
              <input type="hidden" name="product_id" value={productId} />
              <input type="hidden" name="vendor" value={vendorId} />

              <label className={labelClass}>
                Tag name
                <input
                  type="text"
                  name="name"
                  required
                  minLength={2}
                  maxLength={TAG_NAME_MAX}
                  defaultValue={suggestionValues.name}
                  placeholder="e.g. Sustainable"
                  aria-invalid={Boolean(suggestionState?.fieldErrors?.name)}
                  className={inputClass}
                />
                <FieldError message={suggestionState?.fieldErrors?.name} />
              </label>

              <label className={labelClass}>
                Why does it fit?
                <textarea
                  name="description"
                  rows={2}
                  maxLength={TAG_DESCRIPTION_MAX}
                  defaultValue={suggestionValues.description}
                  placeholder="Optional note for the reviewer"
                  aria-invalid={Boolean(
                    suggestionState?.fieldErrors?.description,
                  )}
                  className={inputClass}
                />
                <FieldError
                  message={suggestionState?.fieldErrors?.description}
                />
              </label>

              <div className="sm:col-span-2">
                {suggestionState?.error ? (
                  <p
                    role="alert"
                    className="mb-2 text-sm font-medium text-red-700"
                  >
                    {suggestionState.error}
                  </p>
                ) : null}
                {suggestionState?.success ? (
                  <p
                    role="status"
                    className="mb-2 text-sm font-medium text-emerald-800"
                  >
                    {suggestionState.success}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={suggestionPending}
                  className={secondaryButtonClass}
                >
                  {suggestionPending ? "Sending..." : "Send suggestion"}
                </button>
              </div>
            </form>

            {suggestions.length > 0 ? (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-mute">
                  Recent suggestions
                </h3>
                <ul className="mt-2 flex flex-col gap-2">
                  {suggestions.map((suggestion) => (
                    <li
                      key={suggestion.id}
                      className="rounded-xl border border-line bg-paper px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-ink">
                          {suggestion.name}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${STATUS_STYLES[suggestion.status]}`}
                        >
                          {suggestion.status}
                        </span>
                      </div>
                      {suggestion.rejection_reason ? (
                        <p className="mt-1 text-xs text-ink-mute">
                          {suggestion.rejection_reason}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </details>
        </>
      )}
    </section>
  );
}
