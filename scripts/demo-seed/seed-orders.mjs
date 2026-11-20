#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import {
  DEMO_EMAIL_DOMAIN,
  assertApplyConfirmation,
  assertTarget,
  findUserByEmail,
  isoDaysAgo,
  loadEnv,
  parseArgs,
  readCredentials,
  serviceClient,
  signInAdmin,
  writeCredentials,
} from "./shared.mjs";

const SCRIPT = "orders";
const CUSTOMER_KEY = "demo-customer";
const CUSTOMER_EMAIL = `layla.hassan${DEMO_EMAIL_DOMAIN}`;
const CUSTOMER_NAME = "Layla Hassan";
const CUSTOMER_PHONE = "+20 100 555 1948";
const SETTLEMENT_NOTE_PREFIX = "DEMO-SEED:";
const VENDOR_SLUGS = [
  "nile-blossoms",
  "legacy-engraving",
  "cairo-cocoa",
  "alex-toy-corner",
];

const TARGETS = [
  ...Array.from({ length: 20 }, () => "delivered"),
  "returned",
  "returned",
  "cancelled",
  "cancelled",
  "cancelled",
  "cancelled",
  "partially_completed",
  ...Array.from({ length: 5 }, () => "shipped"),
  ...Array.from({ length: 5 }, () => "confirmed"),
  ...Array.from({ length: 3 }, () => "placed"),
];

const MULTI_VENDOR_ORDERS = new Map([
  [19, ["nile-blossoms", "alex-toy-corner"]],
  [26, ["cairo-cocoa", "alex-toy-corner"]],
]);

const CUSTOMER_ORDER_INDEXES = new Set([2, 7, 12, 17, 21, 25, 31, 37]);

const RECIPIENTS = [
  ["Ahmed El-Sayed", "Alexandria", "Alexandria", "El Geish Road"],
  ["Mona Khalil", "Cairo", "Cairo", "Road 9"],
  ["Youssef Adel", "Giza", "Giza", "Pyramids Road"],
  ["Nour Hassan", "Luxor", "Luxor", "Karnak Temple Road"],
  ["Salma Fathy", "Alexandria", "Alexandria", "Stanley Road"],
  ["Omar Ibrahim", "Cairo", "Cairo", "Zamalek Street"],
  ["Hana Mostafa", "Aswan", "Aswan", "Corniche El Nil"],
  ["Karim Nabil", "Alexandria", "Alexandria", "Smouha Road"],
  ["Farida Samir", "Cairo", "Cairo", "Maadi Street"],
  ["Tarek Magdy", "Giza", "Giza", "Sheikh Zayed Road"],
  ["Dina Sherif", "Luxor", "Luxor", "El Gezira Street"],
  ["Hassan Ali", "Alexandria", "Alexandria", "Sidi Gaber Road"],
  ["Mariam Fouad", "Cairo", "Cairo", "Heliopolis Street"],
  ["Adel Mahmoud", "Qena", "Qena", "Nile Corniche"],
  ["Rania Youssef", "Giza", "Giza", "Dokki Street"],
  ["Sherif Kamal", "Alexandria", "Alexandria", "San Stefano Road"],
  ["Aya Tamer", "Cairo", "Cairo", "New Cairo Road"],
  ["Mahmoud Reda", "Luxor", "Luxor", "West Bank Road"],
  ["Laila Hassan", "Alexandria", "Alexandria", "Raml Station Road"],
  ["Ziad Emad", "Cairo", "Cairo", "Nasr City Street"],
];

const NOTES = [
  null,
  "Please add a handwritten gift note: wishing you every happiness.",
  "Call on arrival; the concierge can receive the gift.",
  "Please keep the packaging discreet and include a gift receipt.",
  null,
  "Deliver after 5pm if possible. It is a surprise.",
];

const VENDOR_CITY = {
  "nile-blossoms": ["Alexandria", "Alexandria"],
  "legacy-engraving": ["Luxor", "Luxor"],
  "cairo-cocoa": ["Cairo", "Cairo"],
  "alex-toy-corner": ["Alexandria", "Alexandria"],
};

const RANK = {
  placed: 0,
  confirmed: 1,
  shipped: 2,
  delivered: 3,
  returned: 4,
};

function stableUuid(seed) {
  const hex = createHash("sha256").update(seed).digest("hex");
  const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80)
    .toString(16)
    .padStart(2, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}

function addHours(iso, hours) {
  return new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function generatedPassword() {
  return randomBytes(18).toString("base64url");
}

function guestEmail(index) {
  return `guest.${String(index + 1).padStart(2, "0")}${DEMO_EMAIL_DOMAIN}`;
}

function orderSeedKey(index) {
  return `gifto-demo-order-${String(index + 1).padStart(2, "0")}`;
}

function buildSpecs(productsByVendor) {
  return Array.from({ length: 40 }, (_, index) => {
    const vendorSlugs = MULTI_VENDOR_ORDERS.get(index) ?? [
      VENDOR_SLUGS[index % VENDOR_SLUGS.length],
    ];
    const items = [];

    for (const vendorSlug of vendorSlugs) {
      const pool = productsByVendor.get(vendorSlug) ?? [];
      if (pool.length === 0) {
        throw new Error(`${vendorSlug} has no active products to order.`);
      }
      const count = vendorSlugs.length > 1 ? 2 : 1 + (index % 3);
      let cursor = (index * 13 + vendorSlug.length) % pool.length;
      const selected = new Set();

      while (selected.size < Math.min(count, pool.length)) {
        const product = pool[cursor];
        if (!selected.has(product.id)) {
          selected.add(product.id);
          const quantity = Math.min(1 + ((index + selected.size) % 2), product.stock);
          items.push({ product_id: product.id, quantity });
        }
        cursor = (cursor + 1) % pool.length;
      }
    }

    const recipient = RECIPIENTS[index % RECIPIENTS.length];
    const [city, governorate] = VENDOR_CITY[vendorSlugs[0]];
    const streetNumber = 5 + ((index * 11) % 80);
    const addressLine = `${streetNumber} ${recipient[3]}, Apt ${1 + (index % 12)}`;

    return {
      index,
      target: TARGETS[index],
      vendors: vendorSlugs,
      items,
      customer: CUSTOMER_ORDER_INDEXES.has(index),
      recipientName: recipient[0],
      contactPhone: `+20 100 ${String(2000000 + index * 7919).padStart(7, "0")}`,
      contactEmail: CUSTOMER_ORDER_INDEXES.has(index) ? CUSTOMER_EMAIL : guestEmail(index),
      addressLine,
      city,
      governorate,
      notes: NOTES[index % NOTES.length],
      idempotencyKey: stableUuid(orderSeedKey(index)),
      guestTokenHash: createHash("sha256")
        .update(`gifto-demo-guest-${index + 1}`)
        .digest("hex"),
      createdAt: isoDaysAgo(3 + (39 - index) * 2, 9 + ((index * 3) % 12), (index * 17) % 60),
    };
  });
}

async function loadVendors(db) {
  const { data, error } = await db
    .from("vendors")
    .select("id, slug, status, is_demo")
    .in("slug", VENDOR_SLUGS);
  if (error) throw new Error(`vendors: ${error.message}`);

  const bySlug = new Map((data ?? []).map((vendor) => [vendor.slug, vendor]));
  for (const slug of VENDOR_SLUGS) {
    const vendor = bySlug.get(slug);
    if (!vendor) throw new Error(`Missing demo vendor ${slug}.`);
    if (!vendor.is_demo || vendor.status !== "active") {
      throw new Error(`${slug} must be an active demo vendor.`);
    }
  }
  return bySlug;
}

async function loadProducts(db, bySlug) {
  const vendorIds = [...bySlug.values()].map((vendor) => vendor.id);
  const { data, error } = await db
    .from("products")
    .select("id, slug, name, price_minor, stock, vendor_id")
    .in("vendor_id", vendorIds)
    .eq("status", "active")
    .gt("stock", 0)
    .order("slug");
  if (error) throw new Error(`products: ${error.message}`);

  const vendorSlugById = new Map(
    [...bySlug.values()].map((vendor) => [vendor.id, vendor.slug]),
  );
  const byVendor = new Map(VENDOR_SLUGS.map((slug) => [slug, []]));
  for (const product of data ?? []) {
    const vendorSlug = vendorSlugById.get(product.vendor_id);
    if (vendorSlug) byVendor.get(vendorSlug).push(product);
  }
  return byVendor;
}

async function ensureCustomer(target, db, credentials) {
  const existing = await findUserByEmail(db, CUSTOMER_EMAIL);
  let credential = credentials[CUSTOMER_KEY];
  let password = credential?.password ?? generatedPassword();
  let user = existing;

  if (!user) {
    const { data, error } = await db.auth.admin.createUser({
      email: CUSTOMER_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { full_name: CUSTOMER_NAME, phone: CUSTOMER_PHONE },
    });
    if (error) throw new Error(`create demo customer: ${error.message}`);
    user = data.user;
  }

  const client = createClient(target.url, target.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let signIn = await client.auth.signInWithPassword({
    email: CUSTOMER_EMAIL,
    password,
  });

  if (!signIn.data.user) {
    password = generatedPassword();
    const { error } = await db.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: CUSTOMER_NAME, phone: CUSTOMER_PHONE },
    });
    if (error) throw new Error(`update demo customer password: ${error.message}`);
    signIn = await client.auth.signInWithPassword({
      email: CUSTOMER_EMAIL,
      password,
    });
  }
  if (!signIn.data.user) {
    throw new Error(`demo customer sign-in failed: ${signIn.error?.message ?? "unknown error"}`);
  }

  const { error: profileError } = await db
    .from("profiles")
    .update({ full_name: CUSTOMER_NAME, phone: CUSTOMER_PHONE })
    .eq("id", user.id);
  if (profileError) throw new Error(`demo customer profile: ${profileError.message}`);

  credentials[CUSTOMER_KEY] = {
    email: CUSTOMER_EMAIL,
    password,
    role: "customer",
    profileId: user.id,
  };
  await writeCredentials(credentials);

  return { client, user };
}

async function placeOrder(db, customerClient, spec) {
  const args = {
    p_items: spec.items,
    p_recipient_name: spec.recipientName,
    p_contact_phone: spec.contactPhone,
    p_contact_email: spec.contactEmail,
    p_address_line: spec.addressLine,
    p_city: spec.city,
    p_governorate: spec.governorate,
    p_notes: spec.notes,
    p_idempotency_key: spec.idempotencyKey,
  };

  const { data, error } = spec.customer
    ? await customerClient.rpc("place_order_with_idempotency", args)
    : await db.rpc("place_guest_order", {
        ...args,
        p_guest_token_hash: spec.guestTokenHash,
      });
  if (error) throw new Error(`order ${spec.index + 1}: ${error.message}`);
  if (!data) throw new Error(`order ${spec.index + 1}: no order id returned.`);
  return data;
}

async function loadOrderVendors(db, orderId) {
  const { data, error } = await db
    .from("order_vendors")
    .select("id, order_id, vendor_id, status, confirmed_at, shipped_at, delivered_at, cancelled_at")
    .eq("order_id", orderId);
  if (error) throw new Error(`order_vendors ${orderId}: ${error.message}`);
  return data ?? [];
}

function flowFor(spec, vendorSlug) {
  if (spec.target === "partially_completed") {
    return vendorSlug === "cairo-cocoa"
      ? ["confirmed", "shipped", "delivered"]
      : ["cancelled"];
  }
  if (spec.target === "delivered") return ["confirmed", "shipped", "delivered"];
  if (spec.target === "returned") return ["confirmed", "shipped", "delivered", "returned"];
  if (spec.target === "shipped") return ["confirmed", "shipped"];
  if (spec.target === "confirmed") return ["confirmed"];
  if (spec.target === "cancelled") {
    return spec.index % 2 === 0
      ? ["cancelled"]
      : ["confirmed", "shipped", "cancelled"];
  }
  return [];
}

async function advanceSuborder(admin, suborder, flow) {
  for (const next of flow) {
    if (next === "cancelled") {
      if (suborder.status === "cancelled") return;
      if (suborder.status === "delivered" || suborder.status === "returned") {
        throw new Error(`Cannot cancel ${suborder.id} after delivery.`);
      }
      const { error } = await admin
        .from("order_vendors")
        .update({ status: "cancelled" })
        .eq("id", suborder.id);
      if (error) throw new Error(`cancel suborder ${suborder.id}: ${error.message}`);
      suborder.status = "cancelled";
      return;
    }

    if (suborder.status === "cancelled") return;
    if (RANK[suborder.status] >= RANK[next]) continue;

    const { error } = await admin
      .from("order_vendors")
      .update({ status: next })
      .eq("id", suborder.id);
    if (error) throw new Error(`suborder ${suborder.id} -> ${next}: ${error.message}`);
    suborder.status = next;
  }
}

async function backdateOrder(db, spec, orderId, suborders, vendorSlugById) {
  await db
    .from("orders")
    .update({
      created_at: spec.createdAt,
      ...(spec.target === "shipped" ? { status: "shipped" } : {}),
    })
    .eq("id", orderId);

  for (const suborder of suborders) {
    const slug = vendorSlugById.get(suborder.vendor_id);
    const flow = flowFor(spec, slug);
    const status = suborder.status;
    const confirmed = ["confirmed", "shipped", "delivered", "returned"].includes(status);
    const shipped = ["shipped", "delivered", "returned"].includes(status);
    const delivered = ["delivered", "returned"].includes(status);
    const cancelledAt = status === "cancelled"
      ? addHours(spec.createdAt, suborder.shipped_at ? 30 : 2)
      : null;

    const { error } = await db
      .from("order_vendors")
      .update({
        created_at: spec.createdAt,
        confirmed_at: confirmed || flow.includes("confirmed")
          ? addHours(spec.createdAt, 4)
          : null,
        shipped_at: shipped || flow.includes("shipped")
          ? addHours(spec.createdAt, 20)
          : null,
        delivered_at: delivered ? addHours(spec.createdAt, 48) : null,
        cancelled_at: cancelledAt,
      })
      .eq("id", suborder.id);
    if (error) throw new Error(`backdate suborder ${suborder.id}: ${error.message}`);

    suborder.confirmedAt = confirmed ? addHours(spec.createdAt, 4) : null;
    suborder.shippedAt = shipped ? addHours(spec.createdAt, 20) : null;
    suborder.deliveredAt = delivered ? addHours(spec.createdAt, 48) : null;
    suborder.cancelledAt = cancelledAt;
  }

  const suborderIds = suborders.map((suborder) => suborder.id);
  if (suborderIds.length > 0) {
    const { error: itemError } = await db
      .from("order_items")
      .update({ created_at: spec.createdAt })
      .in("order_vendor_id", suborderIds);
    if (itemError) throw new Error(`backdate items ${orderId}: ${itemError.message}`);

    const { data: entries, error: entryError } = await db
      .from("commission_entries")
      .select("id, order_vendor_id, status")
      .in("order_vendor_id", suborderIds);
    if (entryError) throw new Error(`commission entries ${orderId}: ${entryError.message}`);

    for (const entry of entries ?? []) {
      const suborder = suborders.find((row) => row.id === entry.order_vendor_id);
      if (!suborder?.deliveredAt) continue;
      const { error } = await db
        .from("commission_entries")
        .update({
          earned_at: suborder.deliveredAt,
          created_at: suborder.deliveredAt,
          ...(entry.status === "reversed"
            ? { reversed_at: addHours(suborder.deliveredAt, 72) }
            : {}),
        })
        .eq("id", entry.id);
      if (error) throw new Error(`backdate commission ${entry.id}: ${error.message}`);
    }
  }

  const { error: movementError } = await db
    .from("inventory_movements")
    .update({ created_at: spec.createdAt })
    .eq("order_id", orderId);
  if (movementError) throw new Error(`backdate inventory ${orderId}: ${movementError.message}`);

  const cancelledSuborders = suborders.filter((suborder) => suborder.cancelledAt);
  if (cancelledSuborders.length > 0) {
    const firstCancelled = cancelledSuborders
      .map((suborder) => suborder.cancelledAt)
      .sort()[0];
    const { error } = await db
      .from("inventory_movements")
      .update({ created_at: firstCancelled })
      .eq("order_id", orderId)
      .eq("reason", "order_cancelled");
    if (error) throw new Error(`backdate cancellation stock ${orderId}: ${error.message}`);
  }
}

async function seedSettlements(admin, db, bySlug) {
  const desired = new Map([
    ["nile-blossoms", "paid"],
    ["legacy-engraving", "paid"],
    ["cairo-cocoa", "open"],
    ["alex-toy-corner", "voided"],
  ]);

  const { data: existing, error: existingError } = await db
    .from("settlements")
    .select("id, vendor_id, status, note, paid_at, voided_at, created_at")
    .like("note", `${SETTLEMENT_NOTE_PREFIX}%`);
  if (existingError) throw new Error(`settlements: ${existingError.message}`);

  const existingByVendor = new Map(
    (existing ?? []).map((settlement) => [settlement.vendor_id, settlement]),
  );

  for (const [slug, desiredStatus] of desired) {
    const vendor = bySlug.get(slug);
    let settlement = existingByVendor.get(vendor.id);

    if (!settlement) {
      const { data: settlementId, error } = await admin.rpc("create_settlement", {
        p_vendor_id: vendor.id,
        p_note: `${SETTLEMENT_NOTE_PREFIX} ${slug} payout history`,
      });
      if (error) throw new Error(`${slug} settlement: ${error.message}`);
      if (!settlementId) throw new Error(`${slug} settlement returned no id.`);

      if (desiredStatus === "paid") {
        const { error: paidError } = await admin.rpc("mark_settlement_paid", {
          p_settlement_id: settlementId,
        });
        if (paidError) throw new Error(`${slug} settlement payout: ${paidError.message}`);
      }
      if (desiredStatus === "voided") {
        const { error: voidError } = await admin.rpc("void_settlement", {
          p_settlement_id: settlementId,
          p_reason: `${SETTLEMENT_NOTE_PREFIX} duplicate payout batch voided.`,
        });
        if (voidError) throw new Error(`${slug} settlement void: ${voidError.message}`);
      }

      const dates = desiredStatus === "paid"
        ? { created_at: isoDaysAgo(10, 10, 0), paid_at: isoDaysAgo(8, 16, 0) }
        : desiredStatus === "voided"
          ? { created_at: isoDaysAgo(6, 10, 0), voided_at: isoDaysAgo(2, 12, 0) }
          : { created_at: isoDaysAgo(4, 10, 0) };
      const { error: dateError } = await db
        .from("settlements")
        .update(dates)
        .eq("id", settlementId);
      if (dateError) throw new Error(`${slug} settlement dates: ${dateError.message}`);

      settlement = {
        id: settlementId,
        vendor_id: vendor.id,
        status: desiredStatus,
        created_at: dates.created_at,
      };
      console.log(`${slug}: ${desiredStatus} settlement created.`);
    } else if (settlement.status !== desiredStatus) {
      throw new Error(
        `${slug} has an existing demo settlement with status ${settlement.status}, expected ${desiredStatus}.`,
      );
    } else {
      console.log(`${slug}: ${desiredStatus} settlement already exists.`);
    }

    const { error: lineError } = await db
      .from("settlement_lines")
      .update({ created_at: settlement.created_at ?? isoDaysAgo(4, 10, 0) })
      .eq("settlement_id", settlement.id);
    if (lineError) throw new Error(`${slug} settlement lines: ${lineError.message}`);
  }
}

async function verify(db, specs, bySlug, customerId) {
  const { data: orders, error } = await db
    .from("orders")
    .select("id, user_id, status, contact_email, public_reference, created_at, idempotency_key")
    .like("contact_email", `%${DEMO_EMAIL_DOMAIN}`);
  if (error) throw new Error(`verify orders: ${error.message}`);

  if ((orders ?? []).length !== 40) {
    throw new Error(`Expected 40 demo orders, found ${(orders ?? []).length}.`);
  }

  const counts = new Map();
  for (const order of orders) counts.set(order.status, (counts.get(order.status) ?? 0) + 1);
  const expectedCounts = {
    delivered: 20,
    returned: 2,
    cancelled: 4,
    partially_completed: 1,
    shipped: 5,
    confirmed: 5,
    placed: 3,
  };
  for (const [status, expected] of Object.entries(expectedCounts)) {
    if ((counts.get(status) ?? 0) !== expected) {
      throw new Error(`Expected ${expected} ${status} orders, found ${counts.get(status) ?? 0}.`);
    }
  }

  const customerOrders = orders.filter((order) => order.user_id);
  if (customerOrders.length !== 8) {
    throw new Error(`Expected 8 signed-in orders, found ${customerOrders.length}.`);
  }
  if (customerOrders.some((order) => order.user_id !== customerId)) {
    throw new Error("A signed-in demo order belongs to an unexpected customer.");
  }
  if (orders.some((order) => !order.public_reference?.match(/^GFT-[0-9A-F]{12}$/))) {
    throw new Error("A demo order has an invalid public reference.");
  }
  if (new Set(orders.map((order) => order.idempotency_key)).size !== 40) {
    throw new Error("Demo order idempotency keys are not unique.");
  }

  const { data: suborders, error: suborderError } = await db
    .from("order_vendors")
    .select("id, order_id, vendor_id, status, confirmed_at, shipped_at, delivered_at, cancelled_at")
    .in("order_id", orders.map((order) => order.id));
  if (suborderError) throw new Error(`verify suborders: ${suborderError.message}`);

  const subordersByOrder = new Map();
  for (const suborder of suborders ?? []) {
    const list = subordersByOrder.get(suborder.order_id) ?? [];
    list.push(suborder);
    subordersByOrder.set(suborder.order_id, list);
  }
  const multiVendor = [...subordersByOrder.values()].filter((list) => list.length > 1);
  if (multiVendor.length !== 2) {
    throw new Error(`Expected 2 multi-vendor demo orders, found ${multiVendor.length}.`);
  }
  if (multiVendor.some((list) => list.length !== 2)) {
    throw new Error("A multi-vendor demo order has an unexpected number of shops.");
  }

  const orderByKey = new Map(orders.map((order) => [order.idempotency_key, order]));
  for (const index of [19, 26]) {
    const spec = specs[index];
    const order = orderByKey.get(spec.idempotencyKey);
    const list = order ? subordersByOrder.get(order.id) ?? [] : [];
    if (!order || list.length !== 2) {
      throw new Error(`Multi-vendor order ${index + 1} is missing or incomplete.`);
    }
  }

  for (const suborder of suborders ?? []) {
    if (["shipped", "delivered", "returned"].includes(suborder.status) && !suborder.confirmed_at) {
      throw new Error(`Suborder ${suborder.id} is missing confirmed_at.`);
    }
    if (suborder.status === "shipped" && !suborder.shipped_at) {
      throw new Error(`Suborder ${suborder.id} is missing shipped_at.`);
    }
    if (["delivered", "returned"].includes(suborder.status) && !suborder.delivered_at) {
      throw new Error(`Suborder ${suborder.id} is missing delivered_at.`);
    }
    if (suborder.status === "cancelled") {
      if (!suborder.cancelled_at) {
        throw new Error(`Suborder ${suborder.id} is missing cancelled_at.`);
      }
      if (suborder.shipped_at && !suborder.confirmed_at) {
        throw new Error(`Suborder ${suborder.id} shipped without confirmed_at.`);
      }
    }
  }

  const { data: settlements, error: settlementError } = await db
    .from("settlements")
    .select("id, vendor_id, status, note, paid_at, voided_at")
    .like("note", `${SETTLEMENT_NOTE_PREFIX}%`);
  if (settlementError) throw new Error(`verify settlements: ${settlementError.message}`);

  const settlementStatuses = new Set((settlements ?? []).map((row) => row.status));
  if ((settlements ?? []).length !== 4) {
    throw new Error(`Expected 4 demo settlements, found ${(settlements ?? []).length}.`);
  }
  for (const status of ["paid", "open", "voided"]) {
    if (!settlementStatuses.has(status)) {
      throw new Error(`Missing a ${status} demo settlement.`);
    }
  }
  for (const settlement of settlements ?? []) {
    if (settlement.status === "paid" && !settlement.paid_at) {
      throw new Error(`Paid settlement ${settlement.id} is missing paid_at.`);
    }
    if (settlement.status === "voided" && !settlement.voided_at) {
      throw new Error(`Voided settlement ${settlement.id} is missing voided_at.`);
    }
  }

  const { data: customerProfile, error: customerError } = await db
    .from("profiles")
    .select("id, full_name")
    .eq("id", customerId)
    .maybeSingle();
  if (customerError) throw new Error(`verify customer: ${customerError.message}`);
  if (!customerProfile?.full_name) throw new Error("Demo customer profile is incomplete.");

  console.log(
    `Verified 40 demo orders: ${Object.entries(expectedCounts)
      .map(([status, count]) => `${count} ${status}`)
      .join(", ")}; 2 multi-vendor; 4 settlements.`,
  );
}

async function apply(target, db, bySlug, specs) {
  const credentials = await readCredentials();
  const customer = await ensureCustomer(target, db, credentials);
  console.log(`Demo customer ready: ${customer.user.id}`);
  const admin = await signInAdmin(target, credentials);
  console.log("Admin ready.");
  const vendorSlugById = new Map(
    [...bySlug.values()].map((vendor) => [vendor.id, vendor.slug]),
  );

  for (const spec of specs) {
    console.log(`Starting order ${spec.index + 1}/40.`);
    const orderId = await placeOrder(db, customer.client, spec);
    const suborders = await loadOrderVendors(db, orderId);
    console.log(`Order ${spec.index + 1} placed; advancing ${suborders.length} shop(s).`);

    for (const suborder of suborders) {
      const slug = vendorSlugById.get(suborder.vendor_id);
      await advanceSuborder(admin.client, suborder, flowFor(spec, slug));
    }
    console.log(`Order ${spec.index + 1} transitions complete; backdating.`);

    const refreshed = await loadOrderVendors(db, orderId);
    await backdateOrder(db, spec, orderId, refreshed, vendorSlugById);
    console.log(
      `${String(spec.index + 1).padStart(2, "0")}: ${spec.target} / ${spec.vendors.join(" + ")} / ${orderId}`,
    );
  }

  console.log("Creating settlements.");
  await seedSettlements(admin.client, db, bySlug);
  await verify(db, specs, bySlug, customer.user.id);
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log("Usage: node scripts/demo-seed/seed-orders.mjs [--verify|--apply]");
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
  console.log(`Loaded ${bySlug.size} demo vendors.`);
  const productsByVendor = await loadProducts(db, bySlug);
  const specs = buildSpecs(productsByVendor);
  console.log(
    `Built 40 order specs from ${[...productsByVendor.values()].reduce((total, rows) => total + rows.length, 0)} active products.`,
  );

  if (args.verify) {
    const credentials = await readCredentials();
    const customer = await findUserByEmail(db, credentials[CUSTOMER_KEY]?.email ?? CUSTOMER_EMAIL);
    if (!customer) throw new Error("Demo customer account does not exist.");
    await verify(db, specs, bySlug, customer.id);
    return;
  }

  await apply(target, db, bySlug, specs);
}

main().catch((error) => {
  console.error(`Order seed failed: ${error.message}`);
  process.exit(1);
});
