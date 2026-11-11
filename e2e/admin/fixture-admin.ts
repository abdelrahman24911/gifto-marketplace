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
export const FIXTURE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
export const FIXTURE_SLUG = "e2e-navigation-guard";
export const FIXTURE_NAME = "E2E Navigation Guard";
export const FIXTURE_IMAGE = FIXTURE_IMAGE_PATH;

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

  const { data: users, error: usersError } =
    await supabase.auth.admin.listUsers({ page: 1, perPage: 1_000 });

  if (usersError) {
    throw new Error(`Could not list E2E users: ${usersError.message}`);
  }

  for (const user of users.users) {
    if (user.email?.toLowerCase() !== E2E_ADMIN_EMAIL) continue;
    const { error: userError } = await supabase.auth.admin.deleteUser(user.id);
    if (userError) {
      throw new Error(`Could not delete the E2E admin: ${userError.message}`);
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

export async function resetFixture(): Promise<{
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
    is_active: false,
    sort_order: 999_999,
    match_mode: "manual",
  });

  if (insertError) {
    throw new Error(`Could not create the E2E fixture: ${insertError.message}`);
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
