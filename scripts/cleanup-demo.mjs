#!/usr/bin/env node
// Gifto Marketplace — demo data cleanup (idempotent, demo-only).
//
// Removes exactly what scripts/seed-demo.mjs created and nothing else:
//   * storage objects under product-images/{vendor_id}/… for demo vendors
//   * vendors where is_demo = true (cascades: products, product_images rows,
//     vendor_members, vendor_status_history — the last-owner guard permits
//     cascading deletes by design)
//   * auth users whose email ends in @demo.gifto.example (cascades: profiles)
//
// Never touches: platform categories, non-demo vendors/products, orders,
// commission entries or settlements (none are ever seeded as demo data).
// See docs/DEMO_DATA_GUIDE.md.

import { createClient } from "@supabase/supabase-js";
import { assertDemoTarget, demoTargetFromEnv } from "./demo-target-guard.mjs";

try {
  process.loadEnvFile(".env.local");
} catch {
  // fall back to whatever is already in the environment
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

// P5 demo separation: refuse unless the target is a demo environment
// (and never the production project without an explicit opt-in). This
// is the fail-closed gate — see scripts/demo-target-guard.mjs.
try {
  assertDemoTarget(demoTargetFromEnv());
} catch (error) {
  console.error(`Refusing to run against this target: ${error.message}`);
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const storage = db.storage.from("product-images");
const DEMO_EMAIL_DOMAIN = "@demo.gifto.example";

async function removeDemoStorage(vendorIds) {
  if (vendorIds.length === 0) return 0;
  const { error: bucketErr } = await db.storage.getBucket("product-images");
  if (bucketErr) return 0; // bucket absent — nothing to wipe
  let removed = 0;
  for (const vendorId of vendorIds) {
    const { data: folders, error: listErr } = await storage.list(vendorId, { limit: 1000 });
    if (listErr) throw new Error(`storage list(${vendorId}): ${listErr.message}`);
    const paths = [];
    for (const entry of folders ?? []) {
      if (entry.id === null) {
        // nested folder (product id): list its files
        const { data: files, error: innerErr } = await storage.list(`${vendorId}/${entry.name}`, {
          limit: 1000,
        });
        if (innerErr) throw new Error(`storage list(${vendorId}/${entry.name}): ${innerErr.message}`);
        for (const f of files ?? []) {
          if (f.id !== null) paths.push(`${vendorId}/${entry.name}/${f.name}`);
        }
      } else {
        paths.push(`${vendorId}/${entry.name}`);
      }
    }
    if (paths.length > 0) {
      const { error: rmErr } = await storage.remove(paths);
      if (rmErr) throw new Error(`storage remove(${vendorId}): ${rmErr.message}`);
      removed += paths.length;
    }
  }
  return removed;
}

async function main() {
  // 1. Identify demo vendors (before cascades wipe them).
  const { data: demoVendors, error: vErr } = await db
    .from("vendors")
    .select("id, slug")
    .eq("is_demo", true);
  if (vErr) throw new Error(`vendors select: ${vErr.message}`);
  const vendorIds = (demoVendors ?? []).map((v) => v.id);

  // 2. Wipe their storage objects.
  const objects = await removeDemoStorage(vendorIds);

  // 3. Delete demo vendors — cascades products, product_images rows,
  //    vendor_members, vendor_status_history.
  let vendorsDeleted = 0;
  if (vendorIds.length > 0) {
    const { data: deleted, error: delErr } = await db
      .from("vendors")
      .delete()
      .eq("is_demo", true)
      .select("id");
    if (delErr) throw new Error(`vendors delete: ${delErr.message}`);
    vendorsDeleted = deleted?.length ?? 0;
  }

  // 4. Delete demo auth users (email domain marker). Collect first, then
  //    delete, so pagination is not disturbed by deletions. Profiles cascade;
  //    any leftover vendor_members rows cascade at trigger depth 2+, which
  //    the last-owner guard explicitly permits.
  let usersDeleted = 0;
  const demoUserIds = [];
  let page = 1;
  for (;;) {
    const { data, error: listErr } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (listErr) throw new Error(`listUsers: ${listErr.message}`);
    for (const u of data?.users ?? []) {
      if (u.email?.endsWith(DEMO_EMAIL_DOMAIN)) demoUserIds.push(u.id);
    }
    if (!data?.users || data.users.length < 200) break;
    page++;
  }
  for (const id of demoUserIds) {
    const { error: delUserErr } = await db.auth.admin.deleteUser(id);
    if (delUserErr) throw new Error(`deleteUser(${id}): ${delUserErr.message}`);
    usersDeleted++;
  }

  // 5. Verify nothing demo remains.
  const { count: vendorsLeft } = await db
    .from("vendors")
    .select("id", { count: "exact", head: true })
    .eq("is_demo", true);
  const { count: productsLeft } = await db
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("is_demo", true);

  console.log(`Removed: ${vendorsDeleted} demo vendors, ${objects} storage objects, ${usersDeleted} demo accounts.`);
  console.log(`Remaining is_demo rows — vendors: ${vendorsLeft}, products: ${productsLeft}.`);
}

main().catch((err) => {
  console.error(`\nCleanup failed: ${err.message}`);
  process.exit(1);
});
