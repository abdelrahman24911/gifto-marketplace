import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../src/lib/supabase/database.types";
import { readLocalSupabaseEnv, runSupabase } from "./local-supabase.mjs";

const BUCKET = "occasion-images";
const FIXTURE_IMAGE_PATH = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/fixture.png";
const FIXTURE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

export const E2E_ADMIN_EMAIL = "e2e-admin@gifto.test";
export const E2E_ADMIN_PASSWORD = "GiftoLocalE2E!2026";
export const E2E_VENDOR_EMAIL = "e2e-vendor@gifto.test";
export const E2E_VENDOR_PASSWORD = "GiftoLocalE2E!2026";
export const E2E_VENDOR_ID = "d1111111-1111-4111-8111-111111111111";
export const E2E_VENDOR_SLUG = "e2e-mobile-shop";
export const E2E_VENDOR_NAME = "E2E Mobile Shop";
export const E2E_CUSTOMER_EMAIL = "e2e-customer@gifto.test";
export const E2E_CUSTOMER_PASSWORD = "GiftoLocalE2E!2026";
export const FIXTURE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
export const FIXTURE_SLUG = "e2e-navigation-guard";
export const FIXTURE_NAME = "E2E Navigation Guard";
export const FIXTURE_IMAGE = FIXTURE_IMAGE_PATH;

const PICKER_VENDOR_ACTIVE = "a1111111-1111-4111-8111-111111111111";
const PICKER_VENDOR_PAUSED = "a2222222-2222-4222-8222-222222222222";
export const PICKER_CATEGORY_FLOWERS =
  "b1111111-1111-4111-8111-111111111111";
const PICKER_CATEGORY_HAMPERS = "b2222222-2222-4222-8222-222222222222";

export const E2E_TAG_THOUGHTFUL_ID = "f3000000-0000-4000-8000-000000000001";
export const E2E_TAG_RETIRED_ID = "f3000000-0000-4000-8000-000000000002";
export const E2E_TAG_NAMES = {
  thoughtful: "E2E Tag Thoughtful",
  retired: "E2E Tag Retired",
  suggestion: "E2E Tag Suggestion",
  created: "E2E Tag Created",
} as const;

const E2E_TAG_IDS = [E2E_TAG_THOUGHTFUL_ID, E2E_TAG_RETIRED_ID];

type PickerProduct = {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  vendorId: string;
  status: "draft" | "active" | "archived";
  stock: number;
  priceMinor: number;
  createdAt: string;
};

function pickerProduct(
  index: number,
  name: string,
  slug: string,
  categoryId: string,
  overrides: Partial<PickerProduct> = {},
): PickerProduct {
  return {
    id: `c0000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name,
    slug: `e2e-picker-${slug}`,
    categoryId,
    vendorId: PICKER_VENDOR_ACTIVE,
    status: "active",
    stock: 5,
    priceMinor: 10_000 + index * 500,
    createdAt: `2026-01-01T00:${String(index).padStart(2, "0")}:00.000Z`,
    ...overrides,
  };
}

const PICKER_PRODUCTS: PickerProduct[] = [
  pickerProduct(1, "E2E Picker Rose", "rose", PICKER_CATEGORY_FLOWERS),
  pickerProduct(2, "E2E Picker Tulip", "tulip", PICKER_CATEGORY_FLOWERS, {
    stock: 0,
  }),
  pickerProduct(3, "E2E Picker Hamper", "hamper", PICKER_CATEGORY_HAMPERS),
  pickerProduct(4, "E2E Picker Basket", "basket", PICKER_CATEGORY_HAMPERS),
  pickerProduct(5, "E2E Picker Draft", "draft", PICKER_CATEGORY_FLOWERS, {
    status: "draft",
    stock: 1,
  }),
  pickerProduct(6, "E2E Picker Archived", "archived", PICKER_CATEGORY_HAMPERS, {
    status: "archived",
    stock: 2,
  }),
  pickerProduct(7, "E2E Picker Paused", "paused", PICKER_CATEGORY_FLOWERS, {
    vendorId: PICKER_VENDOR_PAUSED,
    stock: 4,
  }),
  ...Array.from({ length: 6 }, (_, offset) => {
    const index = offset + 8;
    return pickerProduct(
      index,
      `E2E Picker Bulk ${String(offset + 1).padStart(2, "0")}`,
      `bulk-${String(offset + 1).padStart(2, "0")}`,
      offset % 2 === 0 ? PICKER_CATEGORY_FLOWERS : PICKER_CATEGORY_HAMPERS,
    );
  }),
];

export const E2E_PICKER_PRODUCT_NAMES = {
  rose: "E2E Picker Rose",
  tulip: "E2E Picker Tulip",
  hamper: "E2E Picker Hamper",
  basket: "E2E Picker Basket",
  draft: "E2E Picker Draft",
  archived: "E2E Picker Archived",
  paused: "E2E Picker Paused",
} as const;

let client: SupabaseClient<Database> | null = null;

export function getAdminClient(): SupabaseClient<Database> {
  if (client) return client;

  const local = readLocalSupabaseEnv();
  client = createClient<Database>(local.apiUrl, local.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  return client;
}

function promoteAdmin(userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new Error("Refusing to promote an unexpected user id.");
  }

  const sql = `
do $$
begin
  execute 'alter table public.profiles disable trigger profiles_protect_platform_admin';
  update public.profiles
    set is_platform_admin = true
    where public.profiles.id = '${userId}'::uuid;
  execute 'alter table public.profiles enable trigger profiles_protect_platform_admin';
end
$$;
`;

  runSupabase(["db", "query", "--local", sql], {
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function removePickerFixture(
  supabase: SupabaseClient<Database>,
): Promise<void> {
  const { error: productError } = await supabase
    .from("products")
    .delete()
    .like("slug", "e2e-picker-%");

  if (productError) {
    throw new Error(
      `Could not delete E2E picker products: ${productError.message}`,
    );
  }

  const { error: categoryError } = await supabase
    .from("categories")
    .delete()
    .like("slug", "e2e-picker-%");

  if (categoryError) {
    throw new Error(
      `Could not delete E2E picker categories: ${categoryError.message}`,
    );
  }

  const { error: vendorError } = await supabase
    .from("vendors")
    .delete()
    .like("slug", "e2e-picker-%");

  if (vendorError) {
    throw new Error(
      `Could not delete E2E picker vendors: ${vendorError.message}`,
    );
  }
}

async function removeTaggingFixture(
  supabase: SupabaseClient<Database>,
): Promise<void> {
  const { error: productLinkError } = await supabase
    .from("product_tags")
    .delete()
    .in("tag_id", E2E_TAG_IDS);

  if (productLinkError) {
    throw new Error(
      `Could not delete E2E product tags: ${productLinkError.message}`,
    );
  }

  const { error: occasionLinkError } = await supabase
    .from("occasion_tags")
    .delete()
    .in("tag_id", E2E_TAG_IDS);

  if (occasionLinkError) {
    throw new Error(
      `Could not delete E2E occasion tags: ${occasionLinkError.message}`,
    );
  }

  const { error: suggestionError } = await supabase
    .from("tag_suggestions")
    .delete()
    .like("normalized_slug", "e2e-tag-%");

  if (suggestionError) {
    throw new Error(
      `Could not delete E2E tag suggestions: ${suggestionError.message}`,
    );
  }

  const { error: tagError } = await supabase
    .from("tags")
    .delete()
    .like("slug", "e2e-tag-%");

  if (tagError) {
    throw new Error(`Could not delete E2E tags: ${tagError.message}`);
  }
}

export async function cleanupE2EData(): Promise<void> {
  const supabase = getAdminClient();

  const { data: occasions, error } = await supabase
    .from("occasions")
    .select("id, image_path")
    .like("slug", "e2e-%");

  if (error) throw new Error(`Could not list E2E occasions: ${error.message}`);

  const imagePaths = (occasions ?? [])
    .map((occasion) => occasion.image_path)
    .filter((path): path is string => Boolean(path));

  if (imagePaths.length > 0) {
    await supabase.storage.from(BUCKET).remove(imagePaths);
  }

  const { error: deleteError } = await supabase
    .from("occasions")
    .delete()
    .like("slug", "e2e-%");

  if (deleteError) {
    throw new Error(`Could not delete E2E occasions: ${deleteError.message}`);
  }

  await removePickerFixture(supabase);
  await removeTaggingFixture(supabase);

  const { error: vendorError } = await supabase
    .from("vendors")
    .delete()
    .eq("slug", E2E_VENDOR_SLUG);

  if (vendorError) {
    throw new Error(`Could not delete the E2E vendor: ${vendorError.message}`);
  }

  const { data: users, error: usersError } =
    await supabase.auth.admin.listUsers({ page: 1, perPage: 1_000 });

  if (usersError) {
    throw new Error(`Could not list E2E users: ${usersError.message}`);
  }

  for (const user of users.users) {
    const email = user.email?.toLowerCase();
    if (
      email !== E2E_ADMIN_EMAIL &&
      email !== E2E_VENDOR_EMAIL &&
      email !== E2E_CUSTOMER_EMAIL
    ) {
      continue;
    }
    const { error: userError } = await supabase.auth.admin.deleteUser(user.id);
    if (userError) {
      throw new Error(`Could not delete the E2E user: ${userError.message}`);
    }
  }
}

export async function seedAdmin(): Promise<string> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: E2E_ADMIN_EMAIL,
    password: E2E_ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "E2E Admin" },
  });

  if (error || !data.user) {
    throw new Error(`Could not create the E2E admin: ${error?.message}`);
  }

  promoteAdmin(data.user.id);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile?.is_platform_admin) {
    throw new Error(
      `The E2E admin was not promoted: ${profileError?.message ?? "flag is false"}`,
    );
  }

  return data.user.id;
}

export async function seedVendor(): Promise<string> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: E2E_VENDOR_EMAIL,
    password: E2E_VENDOR_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "E2E Vendor" },
  });

  if (error || !data.user) {
    throw new Error(`Could not create the E2E vendor: ${error?.message}`);
  }

  const { error: vendorError } = await supabase.from("vendors").insert({
    id: E2E_VENDOR_ID,
    name: E2E_VENDOR_NAME,
    slug: E2E_VENDOR_SLUG,
    status: "active",
    is_accepting_orders: true,
  });

  if (vendorError) {
    throw new Error(`Could not create the E2E vendor shop: ${vendorError.message}`);
  }

  const { error: memberError } = await supabase
    .from("vendor_members")
    .insert({
      vendor_id: E2E_VENDOR_ID,
      profile_id: data.user.id,
      role: "owner",
    });

  if (memberError) {
    throw new Error(
      `Could not make the E2E vendor a shop owner: ${memberError.message}`,
    );
  }

  return data.user.id;
}

export async function seedCustomer(): Promise<string> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: E2E_CUSTOMER_EMAIL,
    password: E2E_CUSTOMER_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "E2E Customer" },
  });

  if (error || !data.user) {
    throw new Error(`Could not create the E2E customer: ${error?.message}`);
  }

  return data.user.id;
}

export async function resetPickerFixture(): Promise<void> {
  const supabase = getAdminClient();
  await removePickerFixture(supabase);

  const { error: categoryError } = await supabase.from("categories").insert([
    {
      id: PICKER_CATEGORY_FLOWERS,
      name: "E2E Picker Flowers",
      slug: "e2e-picker-flowers",
      position: 9_001,
      is_active: true,
    },
    {
      id: PICKER_CATEGORY_HAMPERS,
      name: "E2E Picker Hampers",
      slug: "e2e-picker-hampers",
      position: 9_002,
      is_active: true,
    },
  ]);

  if (categoryError) {
    throw new Error(
      `Could not create E2E picker categories: ${categoryError.message}`,
    );
  }

  const { error: vendorError } = await supabase.from("vendors").insert([
    {
      id: PICKER_VENDOR_ACTIVE,
      name: "E2E Picker Bloom Shop",
      slug: "e2e-picker-bloom-shop",
      status: "active",
      is_accepting_orders: true,
    },
    {
      id: PICKER_VENDOR_PAUSED,
      name: "E2E Picker Paused Shop",
      slug: "e2e-picker-paused-shop",
      status: "active",
      is_accepting_orders: false,
    },
  ]);

  if (vendorError) {
    throw new Error(
      `Could not create E2E picker vendors: ${vendorError.message}`,
    );
  }

  const { error: productError } = await supabase.from("products").insert(
    PICKER_PRODUCTS.map((product) => ({
      id: product.id,
      vendor_id: product.vendorId,
      category_id: product.categoryId,
      name: product.name,
      slug: product.slug,
      description: "Temporary product used by the local admin E2E lane.",
      price_minor: product.priceMinor,
      currency: "EGP",
      stock: product.stock,
      status: product.status,
      created_at: product.createdAt,
    })),
  );

  if (productError) {
    throw new Error(
      `Could not create E2E picker products: ${productError.message}`,
    );
  }
}

export async function resetTaggingFixture(): Promise<void> {
  const supabase = getAdminClient();
  await removeTaggingFixture(supabase);

  const { error: tagError } = await supabase.from("tags").insert([
    {
      id: E2E_TAG_THOUGHTFUL_ID,
      name: E2E_TAG_NAMES.thoughtful,
      slug: "e2e-tag-thoughtful",
      description: "Chosen with care for E2E matching.",
      is_active: true,
    },
    {
      id: E2E_TAG_RETIRED_ID,
      name: E2E_TAG_NAMES.retired,
      slug: "e2e-tag-retired",
      description: "Inactive fixture tag.",
      is_active: false,
    },
  ]);

  if (tagError) {
    throw new Error(`Could not create E2E tags: ${tagError.message}`);
  }

  const { error: linkError } = await supabase.from("product_tags").insert([
    {
      product_id: PICKER_PRODUCTS[0].id,
      tag_id: E2E_TAG_THOUGHTFUL_ID,
    },
    {
      product_id: PICKER_PRODUCTS[2].id,
      tag_id: E2E_TAG_THOUGHTFUL_ID,
    },
  ]);

  if (linkError) {
    throw new Error(
      `Could not create E2E product tag links: ${linkError.message}`,
    );
  }

  const { error: suggestionError } = await supabase
    .from("tag_suggestions")
    .insert({
      name: E2E_TAG_NAMES.suggestion,
      vendor_id: PICKER_VENDOR_ACTIVE,
      description: "Pending fixture suggestion for admin review.",
    });

  if (suggestionError) {
    throw new Error(
      `Could not create the E2E tag suggestion: ${suggestionError.message}`,
    );
  }
}

export async function resetFixture({
  matchMode = "manual",
  categoryIds = [],
  tagIds = [],
  isActive = false,
  sortOrder = 999_999,
}: {
  matchMode?: "manual" | "automatic" | "hybrid";
  categoryIds?: string[];
  tagIds?: string[];
  isActive?: boolean;
  sortOrder?: number;
} = {}): Promise<{
  id: string;
  slug: string;
  name: string;
  imagePath: string;
}> {
  const supabase = getAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("occasions")
    .select("image_path")
    .eq("slug", FIXTURE_SLUG);

  if (existingError) {
    throw new Error(`Could not read the E2E fixture: ${existingError.message}`);
  }

  const existingPaths = (existing ?? [])
    .map((occasion) => occasion.image_path)
    .filter((path): path is string => Boolean(path));

  if (existingPaths.length > 0) {
    await supabase.storage.from(BUCKET).remove(existingPaths);
  }

  const { error: deleteError } = await supabase
    .from("occasions")
    .delete()
    .eq("slug", FIXTURE_SLUG);

  if (deleteError) {
    throw new Error(`Could not reset the E2E fixture: ${deleteError.message}`);
  }

  const { error: insertError } = await supabase.from("occasions").insert({
    id: FIXTURE_ID,
    name: FIXTURE_NAME,
    slug: FIXTURE_SLUG,
    description: "Temporary occasion used by the local admin E2E lane.",
    image_alt: "A plain test image",
    is_active: isActive,
    sort_order: sortOrder,
    match_mode: matchMode,
  });

  if (insertError) {
    throw new Error(`Could not create the E2E fixture: ${insertError.message}`);
  }

  if (categoryIds.length > 0) {
    const { error: categoryError } = await supabase
      .from("occasion_categories")
      .insert(
        categoryIds.map((categoryId) => ({
          occasion_id: FIXTURE_ID,
          category_id: categoryId,
        })),
      );

    if (categoryError) {
      throw new Error(
        `Could not attach E2E fixture categories: ${categoryError.message}`,
      );
    }
  }

  if (tagIds.length > 0) {
    const { error: tagLinkError } = await supabase
      .from("occasion_tags")
      .insert(
        tagIds.map((tagId) => ({
          occasion_id: FIXTURE_ID,
          tag_id: tagId,
        })),
      );

    if (tagLinkError) {
      throw new Error(
        `Could not attach E2E fixture tags: ${tagLinkError.message}`,
      );
    }
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(FIXTURE_IMAGE_PATH, FIXTURE_PNG, {
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(
      `Could not upload the E2E fixture image: ${uploadError.message}`,
    );
  }

  const { error: imageError } = await supabase
    .from("occasions")
    .update({ image_path: FIXTURE_IMAGE_PATH })
    .eq("id", FIXTURE_ID);

  if (imageError) {
    throw new Error(
      `Could not attach the E2E fixture image: ${imageError.message}`,
    );
  }

  return {
    id: FIXTURE_ID,
    slug: FIXTURE_SLUG,
    name: FIXTURE_NAME,
    imagePath: FIXTURE_IMAGE_PATH,
  };
}

export async function readFixture() {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("occasions")
    .select("id, name, slug, description, image_path, is_active")
    .eq("id", FIXTURE_ID)
    .single();

  if (error) throw new Error(`Could not read the fixture: ${error.message}`);
  return data;
}

export async function fixtureImageExists(): Promise<boolean> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(FIXTURE_ID, { search: "fixture.png" });

  if (error) {
    throw new Error(`Could not inspect fixture Storage: ${error.message}`);
  }

  return (data ?? []).some((object) => object.name === "fixture.png");
}
