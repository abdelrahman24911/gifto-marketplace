"use server";

import { revalidatePath } from "next/cache";

import { CATALOG_TAGS, revalidatePublicCatalog } from "@/lib/catalog-cache";
import { VENDOR_MEDIA_BUCKET } from "@/lib/supabase/database.types";
import {
  CONTACT_EMAIL_PATTERN,
  VENDOR_ADDRESS_MAX,
  VENDOR_ADDRESS_MIN,
  VENDOR_CONTACT_EMAIL_MAX,
  VENDOR_CONTACT_PHONE_MAX,
  VENDOR_COVERAGE_ITEM_MAX,
  VENDOR_COVERAGE_MAX_ITEMS,
  VENDOR_DESCRIPTION_MAX,
  VENDOR_LOCATION_MAX,
  VENDOR_NAME_MAX,
  VENDOR_NAME_MIN,
  WORKING_DAYS,
  coverageToJson,
  parseCoverageList,
  parsePrepTimeDays,
  validateWorkingHours,
  workingHoursToJson,
  type WorkingHours,
} from "@/lib/vendor-settings";
import {
  isGovernorate,
  partitionGovernorates,
} from "@/lib/governorates";
import { requireVendorRole } from "@/lib/vendor";
import { checkMutationQuota } from "@/lib/rate-limit";
import { isVendorBlockedFromOrders } from "@/lib/demo-containment";
import { validateImageFile } from "@/lib/image-upload";
import { safeDbError } from "@/lib/safe-db-error";

const LOGO_MAX_BYTES = 5 * 1024 * 1024;
const LOGO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/** Values echoed back so a failed submit does not wipe the form. */
export type VendorSettingsValues = {
  name: string;
  description: string;
  contactPhone: string;
  contactEmail: string;
  city: string;
  governorate: string;
  addressLine: string;
  governorates: string;
  areas: string;
  workingHours: WorkingHours;
  prepTimeMinDays: string;
  prepTimeMaxDays: string;
};

export type VendorSettingsState =
  | { error: string; values: VendorSettingsValues; attempt: number }
  | { success: string; values: VendorSettingsValues; attempt: number }
  | null;

export type LogoActionState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

export type PauseActionState =
  | { error: string; attempt: number }
  | { success: string; accepting: boolean; attempt: number }
  | null;

function readWorkingHours(formData: FormData): WorkingHours {
  const hours: WorkingHours = {};

  for (const day of WORKING_DAYS) {
    const open = String(formData.get(`hours_${day}_open`) ?? "").trim();
    const close = String(formData.get(`hours_${day}_close`) ?? "").trim();
    if (open || close) hours[day] = { open, close };
  }

  return hours;
}

function readValues(formData: FormData): VendorSettingsValues {
  return {
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    contactPhone: String(formData.get("contact_phone") ?? "").trim(),
    contactEmail: String(formData.get("contact_email") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    governorate: String(formData.get("governorate") ?? "").trim(),
    addressLine: String(formData.get("address_line") ?? "").trim(),
    // P1-06: governorates arrive as picker checkboxes, not free text.
    // The preserved list holds stored values that do not map to the
    // canonical list; both are echoed back joined, as before.
    governorates: [
      ...formData.getAll("governorates"),
      ...formData.getAll("unmappable_governorates"),
    ]
      .map((value) => String(value).trim())
      .filter(Boolean)
      .join(", "),
    areas: String(formData.get("areas") ?? "").trim(),
    workingHours: readWorkingHours(formData),
    prepTimeMinDays: String(formData.get("prep_time_min_days") ?? "").trim(),
    prepTimeMaxDays: String(formData.get("prep_time_max_days") ?? "").trim(),
  };
}

function invalid(
  values: VendorSettingsValues,
  error: string,
  attempt: number,
) {
  return { error, values, attempt };
}

function canEditShop(access: { role: string }, isPlatformAdmin: boolean) {
  return access.role === "owner" || isPlatformAdmin;
}

function revalidateShopSurfaces(slug: string) {
  revalidatePath("/vendor/settings");
  revalidatePath("/vendor/overview");
  revalidatePath("/shops");
  revalidatePath(`/shops/${slug}`);
  revalidatePath("/");
  revalidatePublicCatalog([CATALOG_TAGS.shops, CATALOG_TAGS.catalog]);
}

/**
 * Saves the existing, vendor-editable columns of the caller's shop.
 *
 * The shop comes from `requireVendorRole` (membership-derived), never from the
 * form. RLS additionally restricts `vendors` updates to active owners, and the
 * finance-field trigger blocks status/commission changes. Managers can read the
 * page but cannot save the profile, matching the RLS policy.
 */
export async function saveVendorSettings(
  prev: VendorSettingsState,
  formData: FormData,
): Promise<VendorSettingsState> {
  const attempt =
    (prev && "attempt" in prev && typeof prev.attempt === "number"
      ? prev.attempt
      : 0) + 1;

  const values = readValues(formData);

  if (
    values.name.length < VENDOR_NAME_MIN ||
    values.name.length > VENDOR_NAME_MAX
  ) {
    return invalid(
      values,
      `Shop name must be between ${VENDOR_NAME_MIN} and ${VENDOR_NAME_MAX} characters.`,
      attempt,
    );
  }

  if (values.description.length > VENDOR_DESCRIPTION_MAX) {
    return invalid(
      values,
      `Description must be at most ${VENDOR_DESCRIPTION_MAX} characters.`,
      attempt,
    );
  }

  if (values.contactPhone.length > VENDOR_CONTACT_PHONE_MAX) {
    return invalid(
      values,
      `Phone must be at most ${VENDOR_CONTACT_PHONE_MAX} characters.`,
      attempt,
    );
  }

  if (
    values.contactEmail.length > VENDOR_CONTACT_EMAIL_MAX ||
    (values.contactEmail.length > 0 &&
      !CONTACT_EMAIL_PATTERN.test(values.contactEmail))
  ) {
    return invalid(values, "Enter a valid contact email address.", attempt);
  }

  if (
    values.city.length > VENDOR_LOCATION_MAX ||
    values.governorate.length > VENDOR_LOCATION_MAX
  ) {
    return invalid(
      values,
      `City and governorate must be at most ${VENDOR_LOCATION_MAX} characters each.`,
      attempt,
    );
  }

  // P1-06: governorates come from the picker, never free text. A
  // tampered submit with a non-canonical picked value is rejected;
  // preserved values are stored entries that do not map to the
  // canonical list, and are kept verbatim unless they now map (a stale
  // form can still submit "Cairo Governorate" as preserved — saving
  // canonicalises it). Nothing is silently dropped or guessed.
  const selectedGovernorates = formData
    .getAll("governorates")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const preservedGovernorates = formData
    .getAll("unmappable_governorates")
    .map((value) => String(value).trim())
    .filter(Boolean);

  for (const value of selectedGovernorates) {
    if (!isGovernorate(value)) {
      return invalid(
        values,
        "Choose governorates from the list.",
        attempt,
      );
    }
  }

  for (const value of preservedGovernorates) {
    if (value.length > VENDOR_COVERAGE_ITEM_MAX) {
      return invalid(
        values,
        `Keep each delivery entry to ${VENDOR_COVERAGE_ITEM_MAX} characters or fewer.`,
        attempt,
      );
    }
  }

  const {
    canonical: canonicalGovernorates,
    unmappable: keptGovernorates,
  } = partitionGovernorates([
    ...selectedGovernorates,
    ...preservedGovernorates,
  ]);
  const governorateValues = [...canonicalGovernorates, ...keptGovernorates];
  if (governorateValues.length > VENDOR_COVERAGE_MAX_ITEMS) {
    return invalid(
      values,
      `List at most ${VENDOR_COVERAGE_MAX_ITEMS} delivery governorates.`,
      attempt,
    );
  }

  const areas = parseCoverageList(values.areas);
  if (areas.error) {
    return invalid(values, areas.error, attempt);
  }

  if (
    values.addressLine.length > 0 &&
    (values.addressLine.length < VENDOR_ADDRESS_MIN ||
      values.addressLine.length > VENDOR_ADDRESS_MAX)
  ) {
    return invalid(
      values,
      `Street address must be between ${VENDOR_ADDRESS_MIN} and ${VENDOR_ADDRESS_MAX} characters, or left blank.`,
      attempt,
    );
  }

  const workingHoursError = validateWorkingHours(values.workingHours);
  if (workingHoursError) {
    return invalid(values, workingHoursError, attempt);
  }

  const prepMin = parsePrepTimeDays(values.prepTimeMinDays);
  if (prepMin.error) {
    return invalid(values, prepMin.error, attempt);
  }

  const prepMax = parsePrepTimeDays(values.prepTimeMaxDays);
  if (prepMax.error) {
    return invalid(values, prepMax.error, attempt);
  }

  if (
    prepMin.value !== null &&
    prepMax.value !== null &&
    prepMax.value < prepMin.value
  ) {
    return invalid(
      values,
      "Maximum preparation time must be greater than or equal to the minimum.",
      attempt,
    );
  }

  const { supabase, access, isPlatformAdmin, user } = await requireVendorRole(
    formData.get("vendor") as string | null,
    { verifyWithAuthServer: true },
  );

  const quotaError = await checkMutationQuota("vendor", user.id);
  if (quotaError) return invalid(values, quotaError, attempt);

  if (!canEditShop(access, isPlatformAdmin)) {
    return invalid(
      values,
      "Only the shop owner can edit the store profile.",
      attempt,
    );
  }

  const { error } = await supabase
    .from("vendors")
    .update({
      name: values.name,
      description: values.description || null,
      contact_phone: values.contactPhone || null,
      contact_email: values.contactEmail || null,
      city: values.city || null,
      governorate: values.governorate || null,
      address_line: values.addressLine || null,
      working_hours: workingHoursToJson(values.workingHours),
      prep_time_min_days: prepMin.value,
      prep_time_max_days: prepMax.value,
      delivery_coverage: coverageToJson({
        governorates: governorateValues,
        areas: areas.values,
      }),
    })
    .eq("id", access.vendorId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return invalid(
        values,
        "That contact email is already used by another shop.",
        attempt,
      );
    }
    if (error.code === "42501") {
      return invalid(
        values,
        "Your account doesn't have permission to edit this shop.",
        attempt,
      );
    }
    return invalid(
      values,
      safeDbError(error, "Store settings could not be saved. Please try again."),
      attempt,
    );
  }

  revalidateShopSurfaces(access.vendorSlug);

  return {
    success: "Store settings saved.",
    values: {
      ...values,
      governorates: governorateValues.join(", "),
      areas: areas.values.join(", "),
    },
    attempt,
  };
}

/**
 * Pauses or resumes new orders without changing shop visibility. Owners and
 * platform admins only; RLS enforces the same ownership rule server-side.
 */
export async function setVendorAcceptingOrders(
  prev: PauseActionState,
  formData: FormData,
): Promise<PauseActionState> {
  const attempt =
    (prev && "attempt" in prev && typeof prev.attempt === "number"
      ? prev.attempt
      : 0) + 1;

  const raw = formData.get("is_accepting_orders");
  if (raw !== "true" && raw !== "false") {
    return { error: "Choose whether the shop is accepting orders.", attempt };
  }
  const accepting = raw === "true";

  const { supabase, access, isPlatformAdmin, user } = await requireVendorRole(
    formData.get("vendor") as string | null,
    { verifyWithAuthServer: true },
  );

  const quotaError = await checkMutationQuota("vendor", user.id);
  if (quotaError) return { error: quotaError, attempt };

  if (!canEditShop(access, isPlatformAdmin)) {
    return {
      error: "Only the shop owner can pause or resume orders.",
      attempt,
    };
  }

  // P0 demo containment (migration 67): a demo shop stays paused in
  // production even if its owner tries to resume it — the pause flag
  // alone is not a durable boundary, and _create_order would refuse the
  // orders anyway. Pausing a demo shop further is always allowed.
  if (accepting && (await isVendorBlockedFromOrders(access.vendorId))) {
    return {
      error:
        "Demo shops stay paused in production and cannot accept new orders.",
      attempt,
    };
  }

  const { error } = await supabase
    .from("vendors")
    .update({ is_accepting_orders: accepting })
    .eq("id", access.vendorId)
    .select("id")
    .maybeSingle();

  if (error) {
    return {
      error:
        error.code === "42501"
          ? "Your account doesn't have permission to change this shop."
          : safeDbError(
              error,
              "New orders could not be changed. Please try again.",
            ),
      attempt,
    };
  }

  revalidateShopSurfaces(access.vendorSlug);
  return {
    success: accepting
      ? "New orders are open again."
      : "New orders are paused. Your shop and products stay visible.",
    accepting,
    attempt,
  };
}

const BRANDING = {
  logo: {
    field: "logo",
    column: "logo_path",
    folder: "branding",
    label: "logo",
  },
  cover: {
    field: "cover",
    column: "cover_path",
    folder: "cover",
    label: "cover image",
  },
} as const;

type BrandingKind = keyof typeof BRANDING;
type VendorClient = Awaited<ReturnType<typeof requireVendorRole>>["supabase"];

async function removeMediaObject(supabase: VendorClient, path: string) {
  await supabase.storage.from(VENDOR_MEDIA_BUCKET).remove([path]);
}

async function uploadVendorBranding(
  prev: LogoActionState,
  formData: FormData,
  kind: BrandingKind,
): Promise<LogoActionState> {
  const attempt =
    (prev && "attempt" in prev && typeof prev.attempt === "number"
      ? prev.attempt
      : 0) + 1;

  const spec = BRANDING[kind];
  const file = formData.get(spec.field);
  if (!(file instanceof File) || file.size === 0) {
    return { error: `Choose an image file to upload.`, attempt };
  }

  // Verify contents, not just the declared MIME type (see the product
  // image upload): the bucket's allowed_mime_types check trusts the label.
  const validated = await validateImageFile(file, {
    maxBytes: LOGO_MAX_BYTES,
    allowed: LOGO_TYPES,
  });
  if (!validated.ok) {
    const message =
      validated.reason === "too-large"
        ? `The ${spec.label} must be 5 MB or smaller.`
        : validated.reason === "invalid-content"
          ? `The ${spec.label} does not look like a valid image.`
          : validated.reason === "type-mismatch"
            ? `The ${spec.label} contents do not match its image type.`
            : "Use a JPEG, PNG, WebP or AVIF image.";
    return { error: message, attempt };
  }
  const extension = validated.value.extension;
  const contentType = validated.value.contentType;

  const { supabase, access, isPlatformAdmin, user } = await requireVendorRole(
    formData.get("vendor") as string | null,
    { verifyWithAuthServer: true },
  );

  const quotaError = await checkMutationQuota("vendor", user.id);
  if (quotaError) return { error: quotaError, attempt };

  if (!canEditShop(access, isPlatformAdmin)) {
    return {
      error: `Only the shop owner can change the ${spec.label}.`,
      attempt,
    };
  }

  const { data: current, error: readError } = await supabase
    .from("vendors")
    .select("logo_path, cover_path")
    .eq("id", access.vendorId)
    .maybeSingle();

  if (readError) {
    return { error: `Could not read the current ${spec.label}.`, attempt };
  }

  const path = `${access.vendorId}/${spec.folder}/${kind}-${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(VENDOR_MEDIA_BUCKET)
    .upload(path, file, {
      contentType,
      cacheControl: "31536000",
      upsert: false,
    });

  if (uploadError) {
    return {
      error: `The ${spec.label} couldn't be uploaded. Try a smaller image.`,
      attempt,
    };
  }

  const update =
    kind === "logo" ? { logo_path: path } : { cover_path: path };
  const { error: updateError } = await supabase
    .from("vendors")
    .update(update)
    .eq("id", access.vendorId)
    .select("id")
    .maybeSingle();

  if (updateError) {
    await removeMediaObject(supabase, path);
    return {
      error:
        updateError.code === "42501"
          ? "Your account doesn't have permission to change this shop."
          : safeDbError(
              updateError,
              `The ${spec.label} could not be saved. Please try again.`,
            ),
      attempt,
    };
  }

  const previous = kind === "logo" ? current?.logo_path : current?.cover_path;
  if (previous && previous !== path) {
    await removeMediaObject(supabase, previous);
  }

  revalidateShopSurfaces(access.vendorSlug);
  return {
    success: kind === "logo" ? "Logo updated." : "Cover image updated.",
    attempt,
  };
}

async function removeVendorBranding(
  prev: LogoActionState,
  formData: FormData,
  kind: BrandingKind,
): Promise<LogoActionState> {
  const attempt =
    (prev && "attempt" in prev && typeof prev.attempt === "number"
      ? prev.attempt
      : 0) + 1;

  const spec = BRANDING[kind];
  const { supabase, access, isPlatformAdmin, user } = await requireVendorRole(
    formData.get("vendor") as string | null,
    { verifyWithAuthServer: true },
  );

  const quotaError = await checkMutationQuota("vendor", user.id);
  if (quotaError) return { error: quotaError, attempt };

  if (!canEditShop(access, isPlatformAdmin)) {
    return {
      error: `Only the shop owner can change the ${spec.label}.`,
      attempt,
    };
  }

  const { data: current, error: readError } = await supabase
    .from("vendors")
    .select("logo_path, cover_path")
    .eq("id", access.vendorId)
    .maybeSingle();

  if (readError) {
    return { error: `Could not read the current ${spec.label}.`, attempt };
  }

  const update =
    kind === "logo" ? { logo_path: null } : { cover_path: null };
  const { error } = await supabase
    .from("vendors")
    .update(update)
    .eq("id", access.vendorId)
    .select("id")
    .maybeSingle();

  if (error) {
    return {
      error:
        error.code === "42501"
          ? "Your account doesn't have permission to change this shop."
          : safeDbError(
              error,
              "The shop image could not be removed. Please try again.",
            ),
      attempt,
    };
  }

  const previous = kind === "logo" ? current?.logo_path : current?.cover_path;
  if (previous) {
    await removeMediaObject(supabase, previous);
  }

  revalidateShopSurfaces(access.vendorSlug);
  return {
    success: kind === "logo" ? "Logo removed." : "Cover image removed.",
    attempt,
  };
}

export async function uploadVendorLogo(
  prev: LogoActionState,
  formData: FormData,
): Promise<LogoActionState> {
  return uploadVendorBranding(prev, formData, "logo");
}

export async function removeVendorLogo(
  prev: LogoActionState,
  formData: FormData,
): Promise<LogoActionState> {
  return removeVendorBranding(prev, formData, "logo");
}

export async function uploadVendorCover(
  prev: LogoActionState,
  formData: FormData,
): Promise<LogoActionState> {
  return uploadVendorBranding(prev, formData, "cover");
}

export async function removeVendorCover(
  prev: LogoActionState,
  formData: FormData,
): Promise<LogoActionState> {
  return removeVendorBranding(prev, formData, "cover");
}
