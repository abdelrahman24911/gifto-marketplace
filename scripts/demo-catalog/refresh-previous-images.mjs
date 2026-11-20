#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import {
  PRODUCT_IMAGES_BUCKET,
  ROOT,
  assertConfirmation,
  assertTarget,
  credentialsPath,
  jpegDimensions,
  loadEnv,
  parseArgs,
  readCredentials,
} from "./shared.mjs";

const DATA_DIR = path.join(ROOT, "data/demo-catalog-previous");
const IMAGE_DIR = path.join(DATA_DIR, "images");
const REFRESH_CONFIRM = "REFRESH gifto-demo-catalog-previous@1";
const VENDOR_SLUGS = ["nile-blossoms", "cairo-cocoa", "legacy-engraving"];

function usage() {
  console.log(`Usage:
  node scripts/demo-catalog/refresh-previous-images.mjs            Local validation only; no network requests.
  node scripts/demo-catalog/refresh-previous-images.mjs --verify  Verify refreshed images on the target; no writes.
  node scripts/demo-catalog/refresh-previous-images.mjs --apply   Upload artwork and update image rows.

Required for --verify/--apply:
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  DEMO_CATALOG_ENV=local|preview
  DEMO_CATALOG_CONFIRM="${REFRESH_CONFIRM}" (only for --apply)

For hosted previews, also set DEMO_CATALOG_ALLOWED_PROJECT_REFS.
Credentials are read from ${credentialsPath()} or DEMO_CATALOG_CREDENTIALS_FILE.
The service-role key is never read by this script.`);
}

function makeClient(target) {
  return createClient(target.url, target.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function readManifest() {
  const manifest = JSON.parse(await readFile(path.join(DATA_DIR, "manifest.json"), "utf8"));
  if (manifest.datasetId !== "gifto-demo-catalog-previous-refresh") {
    throw new Error(`Unexpected datasetId: ${manifest.datasetId}`);
  }
  if (!Array.isArray(manifest.products) || manifest.products.length !== 18) {
    throw new Error(`Expected 18 products, found ${manifest.products?.length ?? 0}.`);
  }
  return manifest;
}

async function validateLocal(manifest) {
  const errors = [];
  const slugs = new Set();
  const vendors = new Set();
  const files = new Set();
  const items = [];

  for (const product of manifest.products) {
    if (!product.slug || !product.name || !product.vendorSlug || !product.file) {
      errors.push(`Invalid product entry: ${JSON.stringify(product)}`);
      continue;
    }
    if (!VENDOR_SLUGS.includes(product.vendorSlug)) {
      errors.push(`${product.slug}: unexpected vendor ${product.vendorSlug}.`);
    }
    if (slugs.has(product.slug)) errors.push(`${product.slug}: duplicate slug.`);
    if (files.has(product.file)) errors.push(`${product.slug}: duplicate image ${product.file}.`);
    slugs.add(product.slug);
    vendors.add(product.vendorSlug);
    files.add(product.file);

    const filePath = path.resolve(IMAGE_DIR, product.file);
    if (!filePath.startsWith(`${IMAGE_DIR}${path.sep}`)) {
      errors.push(`${product.slug}: image path escapes the image directory.`);
      continue;
    }
    let buffer;
    try {
      buffer = await readFile(filePath);
    } catch (error) {
      errors.push(`${product.slug}: cannot read ${product.file}: ${error.message}`);
      continue;
    }
    if (buffer.length < 12_000) {
      errors.push(`${product.slug}: image is unexpectedly small (${buffer.length} bytes).`);
    }
    const dimensions = jpegDimensions(buffer);
    if (!dimensions || dimensions.width !== 1024 || dimensions.height !== 1024) {
      errors.push(`${product.slug}: expected a 1024x1024 JPEG, got ${JSON.stringify(dimensions)}.`);
    }
    const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 12);
    items.push({ ...product, buffer, objectName: `refresh-${hash}.jpg` });
  }

  for (const vendorSlug of VENDOR_SLUGS) {
    if (!vendors.has(vendorSlug)) errors.push(`Missing products for vendor ${vendorSlug}.`);
  }

  if (errors.length > 0) {
    throw new Error(`Local refresh dataset has ${errors.length} issue(s):\n- ${errors.join("\n- ")}`);
  }
  return items;
}

async function loadVendorSession(client, credential, vendorSlug, items) {
  if (!credential?.email || !credential?.password) {
    throw new Error(`Missing credentials for vendor ${vendorSlug}.`);
  }
  const { data: auth, error: authError } = await client.auth.signInWithPassword({
    email: credential.email,
    password: credential.password,
  });
  if (authError) throw new Error(`${vendorSlug}: sign-in failed: ${authError.message}`);
  if (!auth.user) throw new Error(`${vendorSlug}: sign-in returned no user.`);

  const { data: vendor, error: vendorError } = await client
    .from("vendors")
    .select("id, slug, name, status, is_demo")
    .eq("slug", vendorSlug)
    .maybeSingle();
  if (vendorError) throw new Error(`${vendorSlug}: vendor lookup failed: ${vendorError.message}`);
  if (!vendor) throw new Error(`${vendorSlug}: vendor not found for this signed-in owner.`);
  if (!vendor.is_demo) throw new Error(`${vendorSlug}: refusing to alter a non-demo vendor.`);
  if (vendor.status !== "active") throw new Error(`${vendorSlug}: vendor is not active (${vendor.status}).`);

  const { data: membership, error: membershipError } = await client
    .from("vendor_members")
    .select("role")
    .eq("vendor_id", vendor.id)
    .eq("profile_id", auth.user.id)
    .maybeSingle();
  if (membershipError) throw new Error(`${vendorSlug}: membership lookup failed: ${membershipError.message}`);
  if (!membership || !["owner", "manager"].includes(membership.role)) {
    throw new Error(`${vendorSlug}: signed-in user is not an owner or manager of the demo vendor.`);
  }

  const vendorItems = items.filter((item) => item.vendorSlug === vendorSlug);
  const slugs = vendorItems.map((item) => item.slug);
  const { data: products, error: productError } = await client
    .from("products")
    .select("id, slug, name, status, is_demo")
    .eq("vendor_id", vendor.id)
    .in("slug", slugs);
  if (productError) throw new Error(`${vendorSlug}: product lookup failed: ${productError.message}`);

  const bySlug = new Map((products ?? []).map((product) => [product.slug, product]));
  for (const item of vendorItems) {
    const product = bySlug.get(item.slug);
    if (!product) throw new Error(`${vendorSlug}/${item.slug}: product not found.`);
    if (!product.is_demo) throw new Error(`${vendorSlug}/${item.slug}: product is not a demo product.`);
    if (product.status !== "active") throw new Error(`${vendorSlug}/${item.slug}: product is not active.`);
    if (product.name !== item.name) {
      throw new Error(`${vendorSlug}/${item.slug}: expected name "${item.name}", found "${product.name}".`);
    }
  }

  const productIds = [...bySlug.values()].map((product) => product.id);
  const { data: images, error: imageError } = await client
    .from("product_images")
    .select("id, product_id, path, alt, position")
    .in("product_id", productIds)
    .order("position", { ascending: true });
  if (imageError) throw new Error(`${vendorSlug}: image lookup failed: ${imageError.message}`);

  const imagesByProduct = new Map();
  for (const image of images ?? []) {
    const list = imagesByProduct.get(image.product_id) ?? [];
    list.push(image);
    imagesByProduct.set(image.product_id, list);
  }

  return { vendorSlug, vendor, client, items: vendorItems, bySlug, imagesByProduct };
}

async function loadSessions(target, credentials, items) {
  const sessions = [];
  for (const vendorSlug of VENDOR_SLUGS) {
    const client = makeClient(target);
    sessions.push(await loadVendorSession(client, credentials[vendorSlug], vendorSlug, items));
  }
  return sessions;
}

function imageObjectPath(vendorId, productId, objectName) {
  return `${vendorId}/${productId}/${objectName}`;
}

async function uploadIfNeeded(session, product, objectName, buffer) {
  const folder = `${session.vendor.id}/${product.id}`;
  const objectPath = imageObjectPath(session.vendor.id, product.id, objectName);
  const { data: objects, error: listError } = await session.client.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .list(folder, { limit: 100 });
  if (listError) throw new Error(`${session.vendorSlug}/${product.slug}: storage list failed: ${listError.message}`);
  if ((objects ?? []).some((object) => object.name === objectName)) return { objectPath, uploaded: false };
  const { error: uploadError } = await session.client.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(objectPath, buffer, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    });
  if (uploadError) throw new Error(`${session.vendorSlug}/${product.slug}: image upload failed: ${uploadError.message}`);
  return { objectPath, uploaded: true };
}

async function applySessions(sessions) {
  let uploaded = 0;
  let updated = 0;
  let inserted = 0;
  let unchanged = 0;

  for (const session of sessions) {
    console.log(`Refreshing ${session.items.length} images for ${session.vendorSlug}...`);
    for (const item of session.items) {
      const product = session.bySlug.get(item.slug);
      const result = await uploadIfNeeded(session, product, item.objectName, item.buffer);
      if (result.uploaded) uploaded += 1;
      const existing = (session.imagesByProduct.get(product.id) ?? [])[0];
      if (existing?.path === result.objectPath) {
        unchanged += 1;
        continue;
      }
      if (existing) {
        const { data, error } = await session.client
          .from("product_images")
          .update({ path: result.objectPath, alt: item.alt })
          .eq("id", existing.id)
          .eq("product_id", product.id)
          .select("id")
          .maybeSingle();
        if (error) throw new Error(`${session.vendorSlug}/${item.slug}: image row update failed: ${error.message}`);
        if (!data) throw new Error(`${session.vendorSlug}/${item.slug}: image row update was blocked by RLS.`);
        updated += 1;
      } else {
        const { data, error } = await session.client
          .from("product_images")
          .insert({ product_id: product.id, path: result.objectPath, alt: item.alt, position: 0 })
          .select("id")
          .maybeSingle();
        if (error) throw new Error(`${session.vendorSlug}/${item.slug}: image row insert failed: ${error.message}`);
        if (!data) throw new Error(`${session.vendorSlug}/${item.slug}: image row insert was blocked by RLS.`);
        inserted += 1;
      }
    }
  }

  return { uploaded, updated, inserted, unchanged };
}

async function verifySessions(sessions) {
  let checked = 0;
  let failures = 0;
  for (const session of sessions) {
    let vendorOk = 0;
    const productIds = session.items.map((item) => session.bySlug.get(item.slug).id);
    const { data: images, error: imageError } = await session.client
      .from("product_images")
      .select("id, product_id, path, alt, position")
      .in("product_id", productIds)
      .order("position", { ascending: true });
    if (imageError) throw new Error(`${session.vendorSlug}: verification lookup failed: ${imageError.message}`);
    const imagesByProduct = new Map();
    for (const image of images ?? []) {
      const list = imagesByProduct.get(image.product_id) ?? [];
      list.push(image);
      imagesByProduct.set(image.product_id, list);
    }
    for (const item of session.items) {
      const product = session.bySlug.get(item.slug);
      const expectedPath = imageObjectPath(session.vendor.id, product.id, item.objectName);
      const rows = imagesByProduct.get(product.id) ?? [];
      const primary = rows.find((row) => row.path === expectedPath);
      if (!primary) {
        console.error(`${session.vendorSlug}/${item.slug}: image row does not point to ${expectedPath}.`);
        failures += 1;
        continue;
      }
      const { data } = session.client.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(expectedPath);
      const response = await fetch(data.publicUrl, { method: "GET" });
      if (!response.ok) {
        console.error(`${session.vendorSlug}/${item.slug}: public image returned ${response.status}.`);
        failures += 1;
        continue;
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/jpeg")) {
        console.error(`${session.vendorSlug}/${item.slug}: unexpected content type ${contentType}.`);
        failures += 1;
        continue;
      }
      const length = Number(response.headers.get("content-length") ?? "0");
      if (length > 0 && length !== item.buffer.length) {
        console.error(`${session.vendorSlug}/${item.slug}: public image size ${length} differs from local ${item.buffer.length}.`);
        failures += 1;
        continue;
      }
      vendorOk += 1;
      checked += 1;
    }
    console.log(`${session.vendorSlug}: verified ${vendorOk}/${session.items.length} refreshed images.`);
  }
  return { checked, failures };
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    usage();
    return;
  }

  const manifest = await readManifest();
  const items = await validateLocal(manifest);

  if (!args.verify && !args.apply) {
    console.log(`Local image refresh plan for ${items.length} pre-existing demo products:`);
    for (const vendorSlug of VENDOR_SLUGS) {
      const vendorItems = items.filter((item) => item.vendorSlug === vendorSlug);
      console.log(`${vendorSlug}: ${vendorItems.length} images (${vendorItems.map((item) => item.slug).join(", ")})`);
    }
    console.log("No network request was made. Use --verify to inspect a target, or --apply to write.");
    return;
  }

  loadEnv();
  const target = assertTarget();
  if (args.apply) assertConfirmation(REFRESH_CONFIRM);

  const credentials = await readCredentials();
  const sessions = await loadSessions(target, credentials, items);

  try {
    if (args.verify) {
      console.log(`Verified target ${target.hostname} (${target.environment}); no writes performed.`);
      const result = await verifySessions(sessions);
      if (result.failures > 0) throw new Error(`${result.failures} refreshed image(s) failed verification.`);
      console.log(`Verified ${result.checked}/${items.length} refreshed images.`);
      return;
    }

    const counts = await applySessions(sessions);
    const result = await verifySessions(sessions);
    if (result.failures > 0) throw new Error(`${result.failures} refreshed image(s) failed verification.`);
    console.log(
      `Refresh complete: ${counts.uploaded} uploaded, ${counts.updated} rows updated, ${counts.inserted} rows inserted, ${counts.unchanged} unchanged.`,
    );
    console.log(`Verified ${result.checked}/${items.length} refreshed images.`);
  } finally {
    await Promise.allSettled(sessions.map((session) => session.client.auth.signOut()));
  }
}

main().catch((error) => {
  console.error(`Pre-existing image refresh failed: ${error.message}`);
  process.exit(1);
});
