#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

import {
  PRODUCT_IMAGES_BUCKET,
  ROLLBACK_CONFIRM,
  VENDOR_SLUGS,
  assertConfirmation,
  assertTarget,
  credentialsPath,
  imageObjectPath,
  loadEnv,
  parseArgs,
  readCredentials,
  validateLocalDataset,
} from "./shared.mjs";

function usage() {
  console.log(`Usage:
  node scripts/demo-catalog-dummyjson/rollback.mjs            Local plan only; no network requests.
  node scripts/demo-catalog-dummyjson/rollback.mjs --verify  Sign in and show what would be removed; no writes.
  node scripts/demo-catalog-dummyjson/rollback.mjs --apply   Remove this catalogue; requires confirmation.

Required for --verify/--apply:
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  DEMO_CATALOG_ENV=local|preview
  DEMO_CATALOG_CONFIRM="${ROLLBACK_CONFIRM}" (only for --apply)

For hosted previews, also set DEMO_CATALOG_ALLOWED_PROJECT_REFS.
Credentials are read from ${credentialsPath()} or DEMO_CATALOG_CREDENTIALS_FILE.
The service-role key is never read by this script.`);
}

function makeClient(target) {
  return createClient(target.url, target.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signIn(client, vendorSlug, credential) {
  if (!credential?.email || !credential?.password) {
    throw new Error(`Missing credentials for vendor ${vendorSlug}.`);
  }
  const { data, error } = await client.auth.signInWithPassword({
    email: credential.email,
    password: credential.password,
  });
  if (error) throw new Error(`${vendorSlug}: sign-in failed: ${error.message}`);
  if (!data.user) throw new Error(`${vendorSlug}: sign-in returned no user.`);
  return data.user;
}

async function loadVendorState(target, credentials, vendorSlug, slugs) {
  const client = makeClient(target);
  const user = await signIn(client, vendorSlug, credentials[vendorSlug]);

  const { data: vendor, error: vendorError } = await client
    .from("vendors")
    .select("id, slug, status, is_demo")
    .eq("slug", vendorSlug)
    .maybeSingle();
  if (vendorError) throw new Error(`${vendorSlug}: vendor lookup failed: ${vendorError.message}`);
  if (!vendor) throw new Error(`${vendorSlug}: vendor not found for this signed-in owner.`);
  if (!vendor.is_demo) throw new Error(`${vendorSlug}: refusing to roll back a non-demo vendor.`);
  if (vendor.status !== "active") throw new Error(`${vendorSlug}: vendor is not active (${vendor.status}).`);

  const { data: membership, error: membershipError } = await client
    .from("vendor_members")
    .select("role")
    .eq("vendor_id", vendor.id)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (membershipError) throw new Error(`${vendorSlug}: membership lookup failed: ${membershipError.message}`);
  if (membership?.role !== "owner") {
    throw new Error(`${vendorSlug}: rollback requires the demo vendor owner account.`);
  }

  const { data: rows, error: productError } = await client
    .from("products")
    .select("id, slug, is_demo")
    .eq("vendor_id", vendor.id)
    .in("slug", slugs);
  if (productError) throw new Error(`${vendorSlug}: product lookup failed: ${productError.message}`);

  const nonDemo = (rows ?? []).filter((row) => !row.is_demo);
  if (nonDemo.length > 0) {
    throw new Error(
      `${vendorSlug}: dataset slug(s) resolve to non-demo rows: ${nonDemo.map((row) => row.slug).join(", ")}`,
    );
  }

  const ids = (rows ?? []).map((row) => row.id);
  const imagePaths = new Set();
  if (ids.length > 0) {
    const { data: images, error: imageError } = await client
      .from("product_images")
      .select("path")
      .in("product_id", ids);
    if (imageError) throw new Error(`${vendorSlug}: image lookup failed: ${imageError.message}`);
    for (const image of images ?? []) {
      if (image.path.startsWith(`${vendor.id}/`)) imagePaths.add(image.path);
    }
    for (const id of ids) imagePaths.add(imageObjectPath(vendor.id, id));
  }

  const { count: demoCount, error: countError } = await client
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", vendor.id)
    .eq("is_demo", true);
  if (countError) throw new Error(`${vendorSlug}: demo product count failed: ${countError.message}`);

  return {
    vendorSlug,
    client,
    vendor,
    rows: rows ?? [],
    ids,
    imagePaths: [...imagePaths],
    demoCount: demoCount ?? 0,
  };
}

async function loadStates(target, credentials, local) {
  const states = [];
  for (const vendorSlug of VENDOR_SLUGS) {
    const slugs = local.products
      .filter((product) => product.vendorSlug === vendorSlug)
      .map((product) => product.slug);
    states.push(await loadVendorState(target, credentials, vendorSlug, slugs));
  }
  return states;
}

function printState(state) {
  const preserved = Math.max(0, state.demoCount - state.rows.length);
  console.log(
    `${state.vendorSlug}: catalogue=${state.rows.length} images=${state.imagePaths.length} other-demo-products-preserved=${preserved}`,
  );
}

async function verifyStates(states) {
  for (const state of states) printState(state);
}

async function applyStates(states) {
  let productsRemoved = 0;
  let objectsRemoved = 0;

  for (const state of states) {
    printState(state);
    if (state.ids.length === 0) continue;

    if (state.imagePaths.length > 0) {
      const { error: removeError } = await state.client.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .remove(state.imagePaths);
      if (removeError) throw new Error(`${state.vendorSlug}: storage removal failed: ${removeError.message}`);
      objectsRemoved += state.imagePaths.length;
    }

    const { data: deleted, error: deleteError } = await state.client
      .from("products")
      .delete()
      .eq("vendor_id", state.vendor.id)
      .eq("is_demo", true)
      .in("id", state.ids)
      .select("id, slug");
    if (deleteError) throw new Error(`${state.vendorSlug}: product deletion failed: ${deleteError.message}`);
    productsRemoved += deleted?.length ?? 0;
  }

  return { productsRemoved, objectsRemoved };
}

async function verifyRemoved(states, local) {
  let failures = 0;
  for (const state of states) {
    const slugs = local.products
      .filter((product) => product.vendorSlug === state.vendorSlug)
      .map((product) => product.slug);
    const { data: rows, error } = await state.client
      .from("products")
      .select("slug")
      .eq("vendor_id", state.vendor.id)
      .in("slug", slugs)
      .eq("is_demo", true);
    if (error) throw new Error(`${state.vendorSlug}: final verification failed: ${error.message}`);
    if ((rows ?? []).length > 0) {
      failures += rows.length;
      console.error(`${state.vendorSlug}: still present: ${rows.map((row) => row.slug).join(", ")}`);
    } else {
      console.log(`${state.vendorSlug}: verified 0/${slugs.length} catalogue products remain.`);
    }
  }
  if (failures > 0) throw new Error(`${failures} catalogue product(s) were not removed.`);
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    usage();
    return;
  }

  const local = await validateLocalDataset();
  if (local.errors.length > 0) {
    for (const error of local.errors) console.error(`- ${error}`);
    throw new Error(`Local dataset has ${local.errors.length} issue(s).`);
  }

  if (!args.verify && !args.apply) {
    console.log(`Rollback plan for ${local.products.length} products across ${VENDOR_SLUGS.length} vendors.`);
    console.log("Only the exact slugs in products.json will be removed; the v1 catalogue and other demo products are preserved.");
    console.log(`Set DEMO_CATALOG_CONFIRM="${ROLLBACK_CONFIRM}" and run with --apply to remove it.`);
    console.log("No network request was made.");
    return;
  }

  loadEnv();
  const target = assertTarget();
  if (args.apply) assertConfirmation(ROLLBACK_CONFIRM);

  const credentials = await readCredentials();
  const states = await loadStates(target, credentials, local);
  try {
    if (args.verify) {
      console.log(`Verified target ${target.hostname} (${target.environment}); no writes performed.`);
      await verifyStates(states);
      return;
    }

    const counts = await applyStates(states);
    await verifyRemoved(states, local);
    console.log(`Rollback complete: ${counts.productsRemoved} products and ${counts.objectsRemoved} image objects removed.`);
    console.log("The v1 catalogue, other demo products and all non-demo catalogue rows were left in place.");
  } finally {
    await Promise.allSettled(states.map((state) => state.client.auth.signOut()));
  }
}

main().catch((error) => {
  console.error(`DummyJSON demo catalogue rollback failed: ${error.message}`);
  process.exit(1);
});
