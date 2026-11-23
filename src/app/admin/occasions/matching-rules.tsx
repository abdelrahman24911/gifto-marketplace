"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useState } from "react";

import { useUnsavedChangesGuard } from "@/components/navigation-guard";
import { OCCASION_MATCH_MODE_NOTES } from "@/lib/occasions";
import {
  tagSelectionIsDirty,
  toggleTagSelection,
} from "@/lib/tagging";
import type { OccasionMatchMode } from "@/lib/supabase/database.types";

import {
  saveOccasionMatchingRules,
  type OccasionMatchingRulesState,
} from "./actions";

type Option = { id: string; name: string };

const MODE_NOTES: Record<OccasionMatchMode, string> =
  OCCASION_MATCH_MODE_NOTES;

const primaryButtonClass =
  "rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass =
  "rounded-full border border-line-strong bg-paper px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-50";

export function MatchingRules({
  occasionId,
  matchMode,
  categories,
  tags,
  initialCategoryIds,
  initialTagIds,
  unavailableCategories,
  unavailableTags,
}: {
  occasionId: string;
  matchMode: OccasionMatchMode;
  categories: Option[];
  tags: Option[];
  initialCategoryIds: string[];
  initialTagIds: string[];
  unavailableCategories: Option[];
  unavailableTags: Option[];
}) {
  const titleId = useId();
  const categoryHelpId = useId();
  const tagHelpId = useId();
  const categoryPrefix = useId();
  const tagPrefix = useId();
  const router = useRouter();
  const [selectedCategoryIds, setSelectedCategoryIds] =
    useState(initialCategoryIds);
  const [selectedTagIds, setSelectedTagIds] = useState(initialTagIds);
  const [savedCategoryIds, setSavedCategoryIds] =
    useState(initialCategoryIds);
  const [savedTagIds, setSavedTagIds] = useState(initialTagIds);
  const [handledSaveAttempt, setHandledSaveAttempt] = useState<number | null>(
    null,
  );
  const [saveState, saveAction, savePending] = useActionState<
    OccasionMatchingRulesState,
    FormData
  >(saveOccasionMatchingRules, null);

  if (saveState?.success && saveState.attempt !== handledSaveAttempt) {
    setHandledSaveAttempt(saveState.attempt);
    setSavedCategoryIds(saveState.categoryIds ?? selectedCategoryIds);
    setSavedTagIds(saveState.tagIds ?? selectedTagIds);
  }

  const savedAttempt = saveState?.success ? saveState.attempt : null;
  useEffect(() => {
    if (savedAttempt !== null) router.refresh();
  }, [router, savedAttempt]);

  const categoryDirty = tagSelectionIsDirty(
    selectedCategoryIds,
    savedCategoryIds,
  );
  const tagDirty = tagSelectionIsDirty(selectedTagIds, savedTagIds);
  const dirty = categoryDirty || tagDirty;
  useUnsavedChangesGuard(dirty);

  const unavailableCategoryIds = new Set(
    unavailableCategories.map((category) => category.id),
  );
  const unavailableTagIds = new Set(unavailableTags.map((tag) => tag.id));
  const unavailableStillSelected =
    selectedCategoryIds.some((id) => unavailableCategoryIds.has(id)) ||
    selectedTagIds.some((id) => unavailableTagIds.has(id));
  const saveError = saveState?.error;
  const saveSuccess = dirty ? null : saveState?.success;

  function toggleCategory(id: string, checked: boolean) {
    setSelectedCategoryIds((current) =>
      toggleTagSelection(current, id, checked),
    );
  }

  function toggleTag(id: string, checked: boolean) {
    setSelectedTagIds((current) => toggleTagSelection(current, id, checked));
  }

  function removeUnavailableCategory(id: string) {
    setSelectedCategoryIds((current) =>
      current.filter((currentId) => currentId !== id),
    );
  }

  function removeUnavailableTag(id: string) {
    setSelectedTagIds((current) =>
      current.filter((currentId) => currentId !== id),
    );
  }

  function discardChanges() {
    if (savePending) return;
    setSelectedCategoryIds(savedCategoryIds);
    setSelectedTagIds(savedTagIds);
  }

  return (
    <section
      id="matching-rules"
      aria-labelledby={titleId}
      className="mt-12 border-t border-line pt-10"
    >
      <div className="max-w-3xl">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-berry">
          Automatic matching
        </p>
        <h2
          id={titleId}
          className="mt-2 font-display text-3xl leading-tight text-ink sm:text-4xl"
        >
          Matching rules
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          {MODE_NOTES[matchMode]}
        </p>
      </div>

      <form action={saveAction} className="mt-6">
        <input type="hidden" name="occasion_id" value={occasionId} />

        {saveError ? (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {saveError}
          </p>
        ) : null}
        {saveSuccess ? (
          <p
            role="status"
            className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          >
            {saveSuccess}
          </p>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-2">
          <fieldset className="rounded-2xl border border-line bg-paper-soft p-4 sm:p-5">
            <legend className="sr-only">Category rules</legend>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-2xl text-ink">Category rules</h3>
              <span className="text-xs font-medium text-ink-mute">
                {selectedCategoryIds.length} selected
              </span>
            </div>
            <p id={categoryHelpId} className="mt-2 text-sm text-ink-soft">
              Every active product in a selected category is eligible for
              automatic matching.
            </p>

            {categories.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-line-strong bg-paper px-4 py-5 text-sm text-ink-mute">
                No active categories.{" "}
                <Link href="/admin" className="underline hover:text-ink">
                  Add or reactivate a category
                </Link>
                .
              </p>
            ) : (
              <ul
                aria-describedby={categoryHelpId}
                className="mt-4 grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"
              >
                {categories.map((category) => {
                  const inputId = `${categoryPrefix}-${category.id}`;
                  return (
                    <li key={category.id}>
                      <label
                        htmlFor={inputId}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink transition-colors hover:border-berry/40"
                      >
                        <input
                          id={inputId}
                          type="checkbox"
                          name="category_ids"
                          value={category.id}
                          checked={selectedCategoryIds.includes(category.id)}
                          disabled={savePending}
                          onChange={(event) =>
                            toggleCategory(category.id, event.target.checked)
                          }
                          className="mt-0.5 h-4 w-4 rounded border-line-strong text-berry focus:ring-berry"
                        />
                        <span className="break-words">{category.name}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}

            <UnavailableSelections
              title="Hidden categories"
              description="These selected categories are inactive and are ignored by matching."
              items={unavailableCategories}
              selectedIds={selectedCategoryIds}
              disabled={savePending}
              onRemove={removeUnavailableCategory}
            />
          </fieldset>

          <fieldset className="rounded-2xl border border-line bg-paper-soft p-4 sm:p-5">
            <legend className="sr-only">Tag rules</legend>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-2xl text-ink">Tag rules</h3>
              <span className="text-xs font-medium text-ink-mute">
                {selectedTagIds.length} selected
              </span>
            </div>
            <p id={tagHelpId} className="mt-2 text-sm text-ink-soft">
              Products with any selected approved tag are eligible for automatic
              matching.
            </p>

            {tags.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-line-strong bg-paper px-4 py-5 text-sm text-ink-mute">
                No active tags.{" "}
                <Link href="/admin/tags" className="underline hover:text-ink">
                  Manage the tag vocabulary
                </Link>
                .
              </p>
            ) : (
              <ul
                aria-describedby={tagHelpId}
                className="mt-4 grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"
              >
                {tags.map((tag) => {
                  const inputId = `${tagPrefix}-${tag.id}`;
                  return (
                    <li key={tag.id}>
                      <label
                        htmlFor={inputId}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink transition-colors hover:border-berry/40"
                      >
                        <input
                          id={inputId}
                          type="checkbox"
                          name="tag_ids"
                          value={tag.id}
                          checked={selectedTagIds.includes(tag.id)}
                          disabled={savePending}
                          onChange={(event) =>
                            toggleTag(tag.id, event.target.checked)
                          }
                          className="mt-0.5 h-4 w-4 rounded border-line-strong text-berry focus:ring-berry"
                        />
                        <span className="break-words">{tag.name}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}

            <UnavailableSelections
              title="Inactive tags"
              description="Inactive tags cannot be saved as matching rules. Remove them to continue."
              items={unavailableTags}
              selectedIds={selectedTagIds}
              disabled={savePending}
              onRemove={removeUnavailableTag}
            />
          </fieldset>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={savePending || unavailableStillSelected}
            className={primaryButtonClass}
          >
            {savePending ? "Saving..." : "Save matching rules"}
          </button>
          <button
            type="button"
            onClick={discardChanges}
            disabled={savePending || !dirty}
            className={secondaryButtonClass}
          >
            Discard rule changes
          </button>
          {unavailableStillSelected ? (
            <p className="text-xs font-medium text-amber-800">
              Remove the unavailable selections before saving.
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function UnavailableSelections({
  title,
  description,
  items,
  selectedIds,
  disabled,
  onRemove,
}: {
  title: string;
  description: string;
  items: Option[];
  selectedIds: string[];
  disabled: boolean;
  onRemove: (id: string) => void;
}) {
  const visible = items.filter((item) => selectedIds.includes(item.id));
  if (visible.length === 0) return null;

  return (
    <div
      role="note"
      className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-amber-950"
    >
      <p className="text-xs font-semibold uppercase tracking-wide">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-amber-900">
        {description}
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {visible.map((item) => (
          <li
            key={item.id}
            className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-paper px-2.5 py-1 text-xs font-medium"
          >
            {item.name}
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              disabled={disabled}
              aria-label={`Remove unavailable ${item.name}`}
              className="text-amber-900 underline hover:text-ink disabled:opacity-50"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
