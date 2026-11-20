#!/usr/bin/env node
// Gifto Marketplace - demo data cleanup (idempotent, demo-only).
//
// Removes every row and storage object created or configured by the demo
// catalog, branding, merchandising, orders, and support seed scripts:
//   * demo vendor orders, suborders, commissions and settlements
//   * support requests and tag suggestions for demo vendors
//   * demo occasions, tags, picks and banners
//   * product images and vendor branding for demo vendors
//   * demo vendors/products (cascades memberships and status history)
//   * auth users whose email ends in @demo.gifto.example
//
// Platform categories, non-demo vendors/products, and unrelated orders are
// preserved. Anything financially attached to a demo vendor is removed because
// order_vendors, commission_entries and settlements reference vendors with
// ON DELETE RESTRICT.
//
// Usage:
//   DEMO_SEED_ENV=preview \
//   DEMO_SEED_ALLOWED_PROJECT_REFS=<project-ref> \
//   DEMO_SEED_CONFIRM="CLEANUP demo@1" \
//   node scripts/cleanup-demo.mjs
//
// Add --dry-run to report what would be removed, or --verify to check that a
// previous cleanup left nothing behind. Both are read-only.
// See docs/DEMO_DATA_GUIDE.md.

import {
  DEMO_EMAIL_DOMAIN,
  assertTarget,
  loadEnv,
  parseArgs,
  selectAll,
  serviceClient,
} from "./demo-seed/shared.mjs";

const CONFIRMATION = "CLEANUP demo@1";
const VENDOR_BUCKETS = ["product-images", "vendor-media"];
const OCCASION_BUCKET = "occasion-images";
const TAG_SLUGS = [
  "gift-ready",
  "personalized",
  "handmade",
  "luxury",
  "same-day",
  "romantic",
  "gourmet",
  "corporate",
  "home-decor",
  "keepsake",
  "kids",
  "eco-friendly",
  "egyptian-made",
  "under-1000-egp",
  "under-500-egp",
];
const OCCASION_SLUGS = [
  "graduation",
  "ramdan-night",
  "birthdays",
  "weddings",
  "mothers-day",
  "housewarming",
];

loadEnv();
const args = parseArgs();
const dryRun = process.argv.includes("--dry-run");

function chunk(values, size = 100) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function countRows(db, table, apply) {
  const query = db.from(table).select("*", { count: "exact", head: true });
  const { count, error } = await apply(query);
  if (error) throw new Error(`${table} count: ${error.message}`);
  return count ?? 0;
}

async function deleteIn(db, table, column, values) {
  let deleted = 0;
  for (const part of chunk(values)) {
    const { count, error } = await db
      .from(table)
      .delete({ count: "exact" })
      .in(column, part);
    if (error) throw new Error(`${table} delete: ${error.message}`);
    deleted += count ?? 0;
  }
  return deleted;
}

async function listObjects(storage, prefix) {
  const paths = [];
  const { data, error } = await storage.list(prefix, { limit: 1000 });
  if (error) throw new Error(`storage list(${prefix}): ${error.message}`);
  for (const entry of data ?? []) {
    const objectPath = `${prefix}/${entry.name}`;
    if (entry.id === null) {
      paths.push(...(await listObjects(storage, objectPath)));
    } else {
      paths.push(objectPath);
    }
  }
  return paths;
}

async function countPrefix(db, bucket, prefix) {
  const { error: bucketError } = await db.storage.getBucket(bucket);
  if (bucketError) return 0;
  return (await listObjects(db.storage.from(bucket), prefix)).length;
}

async function removePrefix(db, bucket, prefix) {
  const storage = db.storage.from(bucket);
  const { error: bucketError } = await db.storage.getBucket(bucket);
  if (bucketError) return 0;
  const paths = await listObjects(storage, prefix);
  let removed = 0;
  for (const part of chunk(paths)) {
    const { error } = await storage.remove(part);
    if (error) throw new Error(`storage remove(${bucket}/${prefix}): ${error.message}`);
    removed += part.length;
  }
  return removed;
}

async function countStorage(db, state) {
  let objects = 0;
  for (const vendor of state.vendors) {
    for (const bucket of VENDOR_BUCKETS) {
      objects += await countPrefix(db, bucket, vendor.id);
    }
  }
  for (const occasion of state.occasions) {
    objects += await countPrefix(db, OCCASION_BUCKET, occasion.id);
  }
  return objects;
}

async function deleteUnusedSeedTags(db) {
  const tags = await selectAll(() =>
    db.from("tags").select("id, slug").in("slug", TAG_SLUGS),
  );
  if (tags.length === 0) return 0;
  const tagIds = tags.map((tag) => tag.id);
  const [productTags, occasionTags] = await Promise.all([
    selectAll(() => db.from("product_tags").select("tag_id").in("tag_id", tagIds)),
    selectAll(() => db.from("occasion_tags").select("tag_id").in("tag_id", tagIds)),
  ]);
  const used = new Set([
    ...productTags.map((row) => row.tag_id),
    ...occasionTags.map((row) => row.tag_id),
  ]);
  const unused = tags.filter((tag) => !used.has(tag.id)).map((tag) => tag.id);
  return deleteIn(db, "tags", "id", unused);
}

async function loadDemoState(db) {
  const vendors = await selectAll(() =>
    db.from("vendors").select("id, slug").eq("is_demo", true),
  );
  const vendorIds = vendors.map((vendor) => vendor.id);

  const orderRows = vendorIds.length
    ? await selectAll(() =>
        db.from("order_vendors").select("order_id").in("vendor_id", vendorIds),
      )
    : [];
  const orderIds = [...new Set(orderRows.map((row) => row.order_id))];

  const commissionRows = vendorIds.length
    ? await selectAll(() =>
        db.from("commission_entries").select("id").in("vendor_id", vendorIds),
      )
    : [];
  const commissionIds = commissionRows.map((row) => row.id);

  const settlementRows = vendorIds.length
    ? await selectAll(() =>
        db.from("settlements").select("id").in("vendor_id", vendorIds),
      )
    : [];
  const settlementIds = settlementRows.map((row) => row.id);

  const occasions = await selectAll(() =>
    db.from("occasions").select("id, slug").in("slug", OCCASION_SLUGS),
  );

  return {
    vendors,
    vendorIds,
    orderIds,
    commissionIds,
    settlementIds,
    occasions,
  };
}

async function countSeedTags(db) {
  return countRows(db, "tags", (query) => query.in("slug", TAG_SLUGS));
}

async function countUnusedSeedTags(db) {
  const tags = await selectAll(() =>
    db.from("tags").select("id, slug").in("slug", TAG_SLUGS),
  );
  if (tags.length === 0) return 0;
  const tagIds = tags.map((tag) => tag.id);
  const [productTags, occasionTags] = await Promise.all([
    selectAll(() => db.from("product_tags").select("tag_id").in("tag_id", tagIds)),
    selectAll(() => db.from("occasion_tags").select("tag_id").in("tag_id", tagIds)),
  ]);
  const used = new Set([
    ...productTags.map((row) => row.tag_id),
    ...occasionTags.map((row) => row.tag_id),
  ]);
  return tags.filter((tag) => !used.has(tag.id)).length;
}

async function verify(db, state) {
  const vendorsLeft = await countRows(db, "vendors", (query) => query.eq("is_demo", true));
  const productsLeft = await countRows(db, "products", (query) => query.eq("is_demo", true));
  const tagsLeft = await countUnusedSeedTags(db);
  const occasionsLeft = await countRows(db, "occasions", (query) =>
    query.in("slug", OCCASION_SLUGS),
  );
  const supportLeft = state.vendorIds.length
    ? await countRows(db, "support_requests", (query) =>
        query.in("vendor_id", state.vendorIds),
      )
    : 0;
  const suggestionsLeft = state.vendorIds.length
    ? await countRows(db, "tag_suggestions", (query) =>
        query.in("vendor_id", state.vendorIds),
      )
    : 0;
  const ordersLeft = state.orderIds.length
    ? await countRows(db, "orders", (query) => query.in("id", state.orderIds))
    : 0;
  const settlementsLeft = state.settlementIds.length
    ? await countRows(db, "settlements", (query) =>
        query.in("id", state.settlementIds),
      )
    : 0;
  const commissionsLeft = state.commissionIds.length
    ? await countRows(db, "commission_entries", (query) =>
        query.in("id", state.commissionIds),
      )
    : 0;

  const usersLeft = await countDemoUsers(db);

  const failures = [
    ["demo vendors", vendorsLeft],
    ["demo products", productsLeft],
    ["seed tags", tagsLeft],
    ["seed occasions", occasionsLeft],
    ["demo support requests", supportLeft],
    ["demo tag suggestions", suggestionsLeft],
    ["demo orders", ordersLeft],
    ["demo settlements", settlementsLeft],
    ["demo commissions", commissionsLeft],
    ["demo accounts", usersLeft],
  ].filter(([, count]) => count !== 0);

  if (failures.length > 0) {
    throw new Error(
      `Cleanup verification failed: ${failures
        .map(([label, count]) => `${label}=${count}`)
        .join(", ")}.`,
    );
  }

  console.log(
    "Verified cleanup: 0 demo vendors/products/orders/settlements, 0 demo accounts, 0 seeded tags/occasions.",
  );
}

async function main() {
  const target = assertTarget();
  if (args.verify) {
    const db = serviceClient(target);
    await verify(db, await loadDemoState(db));
    return;
  }

  const db = serviceClient(target);
  const state = await loadDemoState(db);
  const counts = {
    vendors: state.vendors.length,
    orders: state.orderIds.length,
    settlements: state.settlementIds.length,
    commissions: state.commissionIds.length,
    support: state.vendorIds.length
      ? await countRows(db, "support_requests", (query) =>
          query.in("vendor_id", state.vendorIds),
        )
      : 0,
    suggestions: state.vendorIds.length
      ? await countRows(db, "tag_suggestions", (query) =>
          query.in("vendor_id", state.vendorIds),
        )
      : 0,
    occasions: state.occasions.length,
    tags: await countSeedTags(db),
    accounts: await countDemoUsers(db),
    storage: 0,
  };

  if (dryRun) {
    counts.storage = await countStorage(db, state);
    console.log(
      `Would remove: ${counts.vendors} demo vendors, ${counts.orders} orders, ` +
        `${counts.settlements} settlements, ${counts.commissions} commissions, ` +
        `${counts.support} support requests, ${counts.suggestions} tag suggestions, ` +
        `${counts.occasions} occasions, ${counts.tags} tags, ` +
        `${counts.accounts} demo accounts and ${counts.storage} storage objects.`,
    );
    return;
  }

  if (process.env.DEMO_SEED_CONFIRM !== CONFIRMATION) {
    throw new Error(
      `Set DEMO_SEED_CONFIRM exactly to "${CONFIRMATION}" before cleaning demo data.`,
    );
  }

  for (const vendor of state.vendors) {
    for (const bucket of VENDOR_BUCKETS) {
      counts.storage += await removePrefix(db, bucket, vendor.id);
    }
  }
  for (const occasion of state.occasions) {
    counts.storage += await removePrefix(db, OCCASION_BUCKET, occasion.id);
  }

  if (state.settlementIds.length > 0) {
    await deleteIn(db, "settlement_lines", "settlement_id", state.settlementIds);
    await deleteIn(db, "settlements", "id", state.settlementIds);
  }
  if (state.commissionIds.length > 0) {
    await deleteIn(db, "settlement_lines", "commission_entry_id", state.commissionIds);
    await deleteIn(db, "commission_entries", "id", state.commissionIds);
  }
  if (state.orderIds.length > 0) {
    counts.orders = await deleteIn(db, "orders", "id", state.orderIds);
  }
  if (state.vendorIds.length > 0) {
    counts.support = await deleteIn(db, "support_requests", "vendor_id", state.vendorIds);
    counts.suggestions = await deleteIn(db, "tag_suggestions", "vendor_id", state.vendorIds);
  }

  if (state.occasions.length > 0) {
    counts.occasions = await deleteIn(
      db,
      "occasions",
      "id",
      state.occasions.map((occasion) => occasion.id),
    );
  }

  if (state.vendorIds.length > 0) {
    const { count, error } = await db
      .from("vendors")
      .delete({ count: "exact" })
      .eq("is_demo", true);
    if (error) throw new Error(`vendors delete: ${error.message}`);
    counts.vendors = count ?? 0;
  }

  counts.tags = await deleteUnusedSeedTags(db);
  counts.accounts = await deleteDemoUsers(db);

  await verify(db, state);

  console.log(
    `Removed: ${counts.vendors} demo vendors, ${counts.orders} orders, ` +
      `${counts.settlements} settlements, ${counts.commissions} commissions, ` +
      `${counts.support} support requests, ${counts.suggestions} tag suggestions, ` +
      `${counts.occasions} occasions, ${counts.tags} tags, ` +
      `${counts.accounts} demo accounts and ${counts.storage} storage objects.`,
  );
}

async function listDemoUsers(db) {
  const demoUserIds = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    for (const user of data?.users ?? []) {
      if (user.email?.endsWith(DEMO_EMAIL_DOMAIN)) demoUserIds.push(user.id);
    }
    if (!data?.users || data.users.length < 1000) break;
  }
  return demoUserIds;
}

async function countDemoUsers(db) {
  return (await listDemoUsers(db)).length;
}

async function deleteDemoUsers(db) {
  const demoUserIds = await listDemoUsers(db);
  for (const id of demoUserIds) {
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) throw new Error(`deleteUser(${id}): ${error.message}`);
  }
  return demoUserIds.length;
}

main().catch((error) => {
  console.error(`\nCleanup failed: ${error.message}`);
  process.exit(1);
});
