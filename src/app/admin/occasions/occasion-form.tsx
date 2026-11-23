"use client";

import Image from "next/image";
import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { GuardedLink, useUnsavedChangesGuard } from "@/components/navigation-guard";
import { ProductImage } from "@/components/product-image";
import {
  OCCASION_DESCRIPTION_MAX,
  OCCASION_IMAGE_ALT_MAX,
  OCCASION_IMAGE_MAX_BYTES,
  OCCASION_MATCH_MODES,
  OCCASION_MATCH_MODE_LABELS,
  OCCASION_NAME_MAX,
  OCCASION_NAME_MIN,
  OCCASION_SLUG_MAX,
  attachPreservedOccasionImage,
  isOccasionFormDirty,
  isOccasionMatchMode,
  validateOccasionImageBasics,
  validateOccasionInput,
  type OccasionFieldErrors,
  type OccasionFormValues,
} from "@/lib/occasions";
import { slugify } from "@/lib/slugify";
import { OCCASION_IMAGES_BUCKET } from "@/lib/supabase/database.types";

import { saveOccasion, type OccasionFormState } from "./actions";
import { RemoveOccasionImageButton } from "./remove-occasion-image-button";

const inputClass =
  "w-full rounded-lg border border-line-strong bg-paper-soft px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-mute transition-colors focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/15";
const labelClass = "flex flex-col gap-1.5 text-sm font-medium text-ink";
const helpClass = "text-xs leading-relaxed text-ink-mute";
const errorClass = "text-xs font-medium text-red-700";
const FILE_ACCEPT = "image/jpeg,image/png,image/webp";

type Props = {
  mode: "create" | "edit";
  occasionId?: string;
  initialValues: OccasionFormValues;
  initialImagePath: string | null;
};

export function OccasionForm({
  mode,
  occasionId,
  initialValues,
  initialImagePath,
}: Props) {
  const [state, formAction, pending] = useActionState(saveOccasion, null);
  const [savedValues, setSavedValues] = useState(initialValues);
  const [lastSuccess, setLastSuccess] = useState<OccasionFormState>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [imageRemovedWarning, setImageRemovedWarning] = useState<string | null>(
    null,
  );
  const createSucceeded = mode === "create" && Boolean(state?.success);
  const values = state?.values ?? initialValues;
  const imagePath = imageRemoved
    ? null
    : state?.imagePath !== undefined
      ? state.imagePath
      : initialImagePath;

  if (state?.success && state !== lastSuccess) {
    setLastSuccess(state);
    setSavedValues(state.values);
    setSelectedImageFile(null);
    setPreviewUrl(null);
    setImageRemoved(false);
    setImageRemovedWarning(null);
  }

  const baselineValues = state?.success ? state.values : savedValues;

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const handleImageSelected = useCallback((file: File | null) => {
    setSelectedImageFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
    if (file) setImageRemoved(false);
  }, []);

  const handleImageRemoved = useCallback((warning?: string) => {
    setImageRemoved(true);
    setImageRemovedWarning(warning ?? null);
    setSelectedImageFile(null);
    setPreviewUrl(null);
  }, []);

  return (
    <div className="mt-8">
      {state?.success ? (
        <SuccessNotice
          mode={mode}
          occasionId={state.occasionId ?? occasionId}
          slug={state.slug ?? values.slug}
          message={state.success}
          warning={state.warning}
        />
      ) : null}

      {createSucceeded ? null : (
        <OccasionFields
          key={state?.attempt ?? 0}
          mode={mode}
          occasionId={occasionId}
          initialValues={values}
          baselineValues={baselineValues}
          initialImagePath={imagePath}
          selectedImageFile={selectedImageFile}
          previewUrl={previewUrl}
          imageRemoved={imageRemoved}
          imageRemovedWarning={imageRemovedWarning}
          serverState={state}
          formAction={formAction}
          pending={pending}
          onImageSelected={handleImageSelected}
          onImageRemoved={handleImageRemoved}
        />
      )}
    </div>
  );
}

function SuccessNotice({
  mode,
  occasionId,
  slug,
  message,
  warning,
}: {
  mode: "create" | "edit";
  occasionId?: string;
  slug: string;
  message: string;
  warning?: string;
}) {
  return (
    <div
      role="status"
      className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-950"
    >
      <p className="font-medium">{message}</p>
      <p className="mt-1 text-sm text-emerald-800">
        Planned public address:{" "}
        <span className="font-mono">/occasions/{slug}</span>
      </p>
      {warning ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {warning}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-3 text-sm font-medium">
        {mode === "create" && occasionId ? (
          <GuardedLink
            href={`/admin/occasions/${occasionId}/edit`}
            className="rounded-full bg-emerald-900 px-4 py-1.5 text-paper hover:bg-emerald-800"
          >
            Continue editing
          </GuardedLink>
        ) : null}
        <GuardedLink
          href="/admin/occasions"
          className="rounded-full border border-emerald-300 px-4 py-1.5 text-emerald-900 hover:bg-emerald-100"
        >
          Back to occasions
        </GuardedLink>
        {mode === "create" ? (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full border border-emerald-300 px-4 py-1.5 text-emerald-900 hover:bg-emerald-100"
          >
            Add another
          </button>
        ) : null}
      </div>
    </div>
  );
}

function OccasionFields({
  mode,
  occasionId,
  initialValues,
  baselineValues,
  initialImagePath,
  selectedImageFile,
  previewUrl,
  imageRemoved,
  imageRemovedWarning,
  serverState,
  formAction,
  pending,
  onImageSelected,
  onImageRemoved,
}: {
  mode: "create" | "edit";
  occasionId?: string;
  initialValues: OccasionFormValues;
  baselineValues: OccasionFormValues;
  initialImagePath: string | null;
  selectedImageFile: File | null;
  previewUrl: string | null;
  imageRemoved: boolean;
  imageRemovedWarning: string | null;
  serverState: OccasionFormState;
  formAction: (payload: FormData) => void;
  pending: boolean;
  onImageSelected: (file: File | null) => void;
  onImageRemoved: (warning?: string) => void;
}) {
  const imageInputId = useId();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<OccasionFormValues>(initialValues);
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [imageError, setImageError] = useState<string | null>(null);
  const [clientErrors, setClientErrors] = useState<OccasionFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const currentImagePath = initialImagePath;
  const selectedFileName = selectedImageFile?.name ?? null;
  const dirty = isOccasionFormDirty(
    values,
    baselineValues,
    Boolean(selectedImageFile),
  );

  useUnsavedChangesGuard(dirty);

  const errors = { ...serverState?.fieldErrors, ...clientErrors };
  const visibleError = serverState?.error ?? formError;
  const status = values.isActive ? "published" : "hidden";

  function updateName(name: string) {
    setValues((current) => ({
      ...current,
      name,
      slug:
        mode === "create" && !slugTouched ? slugify(name) : current.slug,
    }));
  }

  function clearFile() {
    if (imageInputRef.current) imageInputRef.current.value = "";
    onImageSelected(null);
    setImageError(null);
    setClientErrors((current) => ({ ...current, image: undefined }));
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setClientErrors((current) => ({ ...current, image: undefined }));

    if (!file) {
      onImageSelected(null);
      setImageError(null);
      return;
    }

    const basics = validateOccasionImageBasics(file);
    if (!basics.ok) {
      onImageSelected(null);
      setImageError(basics.error);
      return;
    }

    setImageError(null);
    onImageSelected(file);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const validation = validateOccasionInput({
      name: values.name,
      slug: values.slug,
      description: values.description,
      imageAlt: values.imageAlt,
      matchMode: values.matchMode,
      isActive: values.isActive,
    });

    const nextErrors = {
      ...validation.fieldErrors,
      ...(imageError ? { image: imageError } : {}),
    };

    if (Object.keys(nextErrors).length > 0) {
      event.preventDefault();
      setClientErrors(nextErrors);
      setFormError("Check the highlighted fields and try again.");
      return;
    }

    setClientErrors({});
    setFormError(null);

    const freshFile = imageInputRef.current?.files?.[0] ?? null;
    const hasFreshFile = Boolean(freshFile && freshFile.size > 0);

    if (!hasFreshFile && selectedImageFile) {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      startTransition(() => {
        formAction(attachPreservedOccasionImage(formData, selectedImageFile));
      });
    }
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      aria-busy={pending}
      className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]"
    >
      {serverState?.error || formError ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 lg:col-span-2"
        >
          {visibleError}
        </p>
      ) : null}

      <div className="flex flex-col gap-8">
        <section>
          <div className="border-b border-line pb-4">
            <h2 className="font-display text-xl text-ink">The occasion</h2>
            <p className="mt-1 text-sm text-ink-soft">
              A clear name and short description help this occasion feel
              intentional before anyone adds products.
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-5">
            <label className={labelClass}>
              <span className="flex items-baseline justify-between gap-3">
                <span>Name</span>
                <span className="text-xs font-normal text-ink-mute">
                  {values.name.length}/{OCCASION_NAME_MAX}
                </span>
              </span>
              <input
                type="text"
                name="name"
                required
                minLength={OCCASION_NAME_MIN}
                maxLength={OCCASION_NAME_MAX}
                value={values.name}
                onChange={(event) => updateName(event.target.value)}
                placeholder="e.g. Ramadan evenings"
                className={inputClass}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "name-error" : undefined}
              />
              {errors.name ? (
                <span id="name-error" className={errorClass}>
                  {errors.name}
                </span>
              ) : null}
            </label>

            <label className={labelClass}>
              URL slug
              <span className="flex overflow-hidden rounded-lg border border-line-strong bg-paper-soft transition-colors focus-within:border-berry focus-within:ring-2 focus-within:ring-berry/15">
                <span className="flex items-center border-r border-line px-3 text-sm text-ink-mute">
                  /occasions/
                </span>
                <input
                  type="text"
                  name="slug"
                  required
                  maxLength={OCCASION_SLUG_MAX}
                  value={values.slug}
                  onChange={(event) => {
                    setSlugTouched(true);
                    setValues((current) => ({
                      ...current,
                      slug: event.target.value,
                    }));
                  }}
                  placeholder="ramadan-evenings"
                  className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-ink placeholder:text-ink-mute focus:outline-none"
                  aria-invalid={Boolean(errors.slug)}
                  aria-describedby={errors.slug ? "slug-error" : "slug-help"}
                />
              </span>
              {errors.slug ? (
                <span id="slug-error" className={errorClass}>
                  {errors.slug}
                </span>
              ) : (
                <span id="slug-help" className={helpClass}>
                  {mode === "edit"
                    ? "Changes the planned public address; the old one will redirect."
                    : "Generated from the name until you edit it."}{" "}
                  Letters, numbers and single hyphens.
                </span>
              )}
            </label>

            <label className={labelClass}>
              <span className="flex items-baseline justify-between gap-3">
                <span>Description</span>
                <span className="text-xs font-normal text-ink-mute">
                  {values.description.length}/{OCCASION_DESCRIPTION_MAX}
                </span>
              </span>
              <textarea
                name="description"
                rows={6}
                maxLength={OCCASION_DESCRIPTION_MAX}
                value={values.description}
                onChange={(event) => {
                  setValues((current) => ({
                    ...current,
                    description: event.target.value,
                  }));
                }}
                placeholder="What makes this occasion worth browsing? Keep it warm and specific."
                className={`${inputClass} resize-y`}
                aria-invalid={Boolean(errors.description)}
                aria-describedby={
                  errors.description ? "description-error" : undefined
                }
              />
              {errors.description ? (
                <span id="description-error" className={errorClass}>
                  {errors.description}
                </span>
              ) : null}
            </label>
          </div>
        </section>

        <section>
          <div className="border-b border-line pb-4">
            <h2 className="font-display text-xl text-ink">Presentation</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Add one strong image for cards and editorial surfaces. JPEG, PNG
              or WebP, up to 5 MB.
            </p>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
            <div>
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line bg-paper-deep">
                {previewUrl ? (
                  <Image
                    src={previewUrl}
                    alt="Selected occasion image preview"
                    fill
                    unoptimized
                    sizes="(min-width: 640px) 240px, 100vw"
                    className="object-cover"
                  />
                ) : currentImagePath ? (
                  <ProductImage
                    path={currentImagePath}
                    alt={values.imageAlt || values.name || "Occasion image"}
                    name={values.name || "Occasion"}
                    bucket={OCCASION_IMAGES_BUCKET}
                    className="h-full w-full"
                    rounded="rounded-none"
                    sizes="(min-width: 640px) 240px, 100vw"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 px-5 text-center">
                    <span
                      aria-hidden
                      className="font-display text-4xl text-berry/40"
                    >
                      ✦
                    </span>
                    <span className="text-sm text-ink-mute">
                      No image yet
                    </span>
                  </div>
                )}
                {previewUrl || currentImagePath ? (
                  <span className="absolute left-2 top-2 rounded-full bg-ink/80 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-paper">
                    {previewUrl ? "New image" : "Current image"}
                  </span>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label
                  htmlFor={imageInputId}
                  className="cursor-pointer rounded-full border border-line-strong bg-paper-soft px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft"
                >
                  {previewUrl || currentImagePath
                    ? "Replace image"
                    : "Choose image"}
                </label>
                {previewUrl || imageError ? (
                  <button
                    type="button"
                    onClick={clearFile}
                    className="rounded-full px-2 py-1.5 text-sm text-ink-mute hover:text-berry-deep"
                  >
                    Clear selection
                  </button>
                ) : null}
                {mode === "edit" && occasionId && currentImagePath && !previewUrl ? (
                  <RemoveOccasionImageButton
                    occasionId={occasionId}
                    onRemoved={onImageRemoved}
                  />
                ) : null}
                <input
                  ref={imageInputRef}
                  id={imageInputId}
                  name="image"
                  type="file"
                  accept={FILE_ACCEPT}
                  onChange={handleFileChange}
                  className="sr-only"
                  aria-describedby={
                    errors.image ? "image-error" : "image-help"
                  }
                />
              </div>
              {selectedFileName ? (
                <p className="mt-1 break-all text-xs text-ink-mute">
                  {selectedFileName}
                </p>
              ) : null}
              {imageRemoved ? (
                <p
                  role="status"
                  className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
                >
                  The image was removed.
                </p>
              ) : null}
              {imageRemovedWarning ? (
                <p
                  role="alert"
                  className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                >
                  {imageRemovedWarning}
                </p>
              ) : null}
              {errors.image ? (
                <p id="image-error" role="alert" className={`mt-1 ${errorClass}`}>
                  {errors.image}
                </p>
              ) : (
                <p id="image-help" className={`mt-1 ${helpClass}`}>
                  The file is checked again on the server. Replacing an image
                  keeps the old file until the new one is safely saved.
                </p>
              )}
            </div>

            <label className={labelClass}>
              <span className="flex items-baseline justify-between gap-3">
                <span>Image alt text</span>
                <span className="text-xs font-normal text-ink-mute">
                  {values.imageAlt.length}/{OCCASION_IMAGE_ALT_MAX}
                </span>
              </span>
              <input
                type="text"
                name="image_alt"
                maxLength={OCCASION_IMAGE_ALT_MAX}
                value={values.imageAlt}
                onChange={(event) => {
                  setValues((current) => ({
                    ...current,
                    imageAlt: event.target.value,
                  }));
                }}
                placeholder="Describe the image for screen readers"
                className={inputClass}
                aria-invalid={Boolean(errors.image_alt)}
                aria-describedby={
                  errors.image_alt ? "image-alt-error" : "image-alt-help"
                }
              />
              {errors.image_alt ? (
                <span id="image-alt-error" className={errorClass}>
                  {errors.image_alt}
                </span>
              ) : (
                <span id="image-alt-help" className={helpClass}>
                  Used when the image cannot be seen. If empty, the occasion
                  name is used.
                </span>
              )}
            </label>
          </div>
        </section>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-2xl border border-line bg-paper-soft p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl text-ink">Publishing</h2>
            <span
              className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-wide ${
                values.isActive
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-line-strong bg-paper text-ink-mute"
              }`}
            >
              {status}
            </span>
          </div>

          <label className="mt-4 flex cursor-pointer gap-3 rounded-xl border border-line bg-paper px-4 py-3">
            <input
              type="checkbox"
              name="is_active"
              checked={values.isActive}
              onChange={(event) => {
                setValues((current) => ({
                  ...current,
                  isActive: event.target.checked,
                }));
              }}
              className="mt-0.5 size-4 shrink-0 accent-berry"
            />
            <span>
              <span className="block text-sm font-medium text-ink">
                Publish this occasion
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-ink-mute">
                Hidden occasions stay here and keep their order, but public
                surfaces hide them.
              </span>
            </span>
          </label>

          <label className={`${labelClass} mt-5`}>
            Matching mode
            <select
              name="match_mode"
              value={values.matchMode}
              onChange={(event) => {
                if (!isOccasionMatchMode(event.target.value)) return;
                setValues((current) => ({
                  ...current,
                  matchMode: event.target.value as OccasionFormValues["matchMode"],
                }));
              }}
              className={inputClass}
              aria-invalid={Boolean(errors.match_mode)}
              aria-describedby={
                errors.match_mode ? "match-mode-error" : "match-mode-help"
              }
            >
              {OCCASION_MATCH_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {OCCASION_MATCH_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
            {errors.match_mode ? (
              <span id="match-mode-error" className={errorClass}>
                {errors.match_mode}
              </span>
            ) : (
              <span id="match-mode-help" className={helpClass}>
                Manual is curated only; the automated modes use rules added in
                the matching editor.
              </span>
            )}
          </label>

          <div className="mt-5 rounded-xl border border-line bg-paper px-3 py-2.5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-mute">
              Planned public address
            </p>
            <p className="mt-1 break-all font-mono text-xs text-ink-soft">
              /occasions/{slugify(values.slug || values.name) || "…"}
            </p>
          </div>

          {mode === "edit" && occasionId ? (
            <input type="hidden" name="occasion_id" value={occasionId} />
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="mt-5 w-full rounded-full bg-berry px-4 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending
              ? mode === "create"
                ? "Creating…"
                : "Saving…"
              : mode === "create"
                ? "Create occasion"
                : "Save changes"}
          </button>
          <GuardedLink
            href="/admin/occasions"
            aria-disabled={pending}
            onClick={(event) => {
              if (pending) event.preventDefault();
            }}
            className="mt-2 block rounded-full px-4 py-2 text-center text-sm font-medium text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink aria-disabled:pointer-events-none aria-disabled:opacity-60"
          >
            Cancel
          </GuardedLink>
          <p className="mt-3 text-center text-[0.7rem] leading-relaxed text-ink-mute">
            {OCCASION_IMAGE_MAX_BYTES / (1024 * 1024)} MB image limit · changes
            are validated on the server
          </p>
        </div>
      </aside>
    </form>
  );
}
