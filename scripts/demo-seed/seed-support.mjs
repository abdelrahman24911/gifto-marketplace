#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

import {
  assertApplyConfirmation,
  assertTarget,
  isoDaysAgo,
  loadEnv,
  parseArgs,
  readCredentials,
  requireCredential,
  serviceClient,
} from "./shared.mjs";

const SCRIPT = "support";

const REQUESTS = [
  {
    slug: "nile-blossoms",
    category: "orders",
    status: "open",
    daysAgo: 26,
    subject: "Customer asked to move a delivery to Friday",
    body: "A customer with an Alexandria order asked whether we can move delivery from Thursday afternoon to Friday morning. The order is still in our confirmed queue and the flowers have not been prepared yet. Can you confirm the cut-off time for changing the delivery slot?",
  },
  {
    slug: "cairo-cocoa",
    category: "finance",
    status: "open",
    daysAgo: 19,
    subject: "Question about the latest payout statement",
    body: "Our latest payout statement includes an order that we thought was still marked as delivered yesterday. We want to make sure the commission amount and the bank transfer reference match before we reconcile our accounts. Could someone from the finance team check it?",
  },
  {
    slug: "legacy-engraving",
    category: "account",
    status: "resolved",
    daysAgo: 13,
    subject: "Please update the workshop contact number",
    body: "We changed our workshop phone line this month. The old number still appears on the shop profile and on order notifications. Please replace it with the number we added to the account settings and confirm when the public profile is updated.",
  },
  {
    slug: "alex-toy-corner",
    category: "products",
    status: "in_progress",
    daysAgo: 8,
    subject: "Need help adding a new gift-wrap option",
    body: "We are adding a reusable fabric gift-wrap option for toy orders. We can provide the photos and the small price difference. Could you check whether this should be a new product variant or a note on the existing toy listings?",
  },
  {
    slug: "nile-blossoms",
    category: "other",
    status: "resolved",
    daysAgo: 3,
    subject: "Thank you for the weekend delivery support",
    body: "The extra delivery guidance last weekend helped us get every Mother's Day order out on time. Please pass our thanks to the operations team. We would also like to know whether the same schedule will apply next month.",
  },
];

async function loadVendors(db) {
  const slugs = [...new Set(REQUESTS.map((request) => request.slug))];
  const { data, error } = await db
    .from("vendors")
    .select("id, slug, status, is_demo")
    .in("slug", slugs);
  if (error) throw new Error(`vendors: ${error.message}`);

  const bySlug = new Map((data ?? []).map((vendor) => [vendor.slug, vendor]));
  for (const slug of slugs) {
    const vendor = bySlug.get(slug);
    if (!vendor) throw new Error(`Missing vendor ${slug}.`);
    if (!vendor.is_demo || vendor.status !== "active") {
      throw new Error(`${slug} must be an active demo vendor.`);
    }
  }
  return bySlug;
}

async function signInVendor(target, credentials, slug) {
  const credential = requireCredential(credentials, slug);
  const client = createClient(target.url, target.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: credential.email,
    password: credential.password,
  });
  if (error) throw new Error(`${slug} sign-in failed: ${error.message}`);
  if (!data.user) throw new Error(`${slug} sign-in returned no user.`);
  return { client, user: data.user };
}

async function loadExisting(db) {
  const { data, error } = await db
    .from("support_requests")
    .select("id, vendor_id, created_by, category, subject, body, status, created_at, updated_at")
    .in("subject", REQUESTS.map((request) => request.subject));
  if (error) throw new Error(`support requests: ${error.message}`);
  return new Map((data ?? []).map((request) => [request.subject, request]));
}

async function apply(target, db, bySlug) {
  const credentials = await readCredentials();
  const existing = await loadExisting(db);

  for (const [index, request] of REQUESTS.entries()) {
    if (existing.has(request.subject)) {
      console.log(`Support request ${index + 1}: already exists.`);
      continue;
    }

    const vendor = bySlug.get(request.slug);
    const session = await signInVendor(target, credentials, request.slug);
    const { data, error } = await session.client
      .from("support_requests")
      .insert({
        vendor_id: vendor.id,
        category: request.category,
        subject: request.subject,
        body: request.body,
      })
      .select("id")
      .single();
    if (error) throw new Error(`support request ${index + 1}: ${error.message}`);

    const createdAt = isoDaysAgo(request.daysAgo, 10 + index, 15 + index * 3);
    const { error: updateError } = await db
      .from("support_requests")
      .update({
        status: request.status,
        created_at: createdAt,
      })
      .eq("id", data.id);
    if (updateError) throw new Error(`support request ${index + 1} update: ${updateError.message}`);

    console.log(
      `Support request ${index + 1}: ${request.slug} / ${request.category} / ${request.status}`,
    );
  }
}

async function verify(db, bySlug) {
  const requests = await loadExisting(db);
  if (requests.size !== REQUESTS.length) {
    throw new Error(`Expected ${REQUESTS.length} demo support requests, found ${requests.size}.`);
  }

  const vendorIds = new Set([...bySlug.values()].map((vendor) => vendor.id));
  for (const request of REQUESTS) {
    const row = requests.get(request.subject);
    if (!row) throw new Error(`Missing support request: ${request.subject}`);
    if (!vendorIds.has(row.vendor_id)) {
      throw new Error(`Support request ${row.id} belongs to a non-demo vendor.`);
    }
    if (!row.created_by) {
      throw new Error(`Support request ${row.id} has no creator.`);
    }
    if (
      row.category !== request.category ||
      row.status !== request.status ||
      row.body !== request.body
    ) {
      throw new Error(`Support request ${row.id} does not match its expected state.`);
    }
    if (request.body.length < 20 || request.body.length > 4000) {
      throw new Error(`Support request ${row.id} body is outside the allowed length.`);
    }
    if (request.subject.length < 5 || request.subject.length > 120) {
      throw new Error(`Support request ${row.id} subject is outside the allowed length.`);
    }
  }

  const statuses = new Set([...requests.values()].map((request) => request.status));
  for (const status of ["open", "in_progress", "resolved"]) {
    if (!statuses.has(status)) throw new Error(`Missing a ${status} support request.`);
  }

  console.log("Verified 5 demo support requests across 4 vendors.");
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log("Usage: node scripts/demo-seed/seed-support.mjs [--verify|--apply]");
    return;
  }
  if (!args.verify && !args.apply) {
    throw new Error("Choose --verify or --apply.");
  }

  loadEnv();
  const target = assertTarget();
  if (args.apply) assertApplyConfirmation(SCRIPT);

  const db = serviceClient(target);
  const bySlug = await loadVendors(db);

  if (args.apply) {
    await apply(target, db, bySlug);
  }
  await verify(db, bySlug);
}

main().catch((error) => {
  console.error(`Support seed failed: ${error.message}`);
  process.exit(1);
});
