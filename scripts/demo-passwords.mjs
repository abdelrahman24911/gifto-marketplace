#!/usr/bin/env node
// Gifto Marketplace — rotate and reveal demo owner credentials.
//
// Run this yourself (npm run demo:passwords) when you need to sign in to the
// vendor dashboard as a demo shop. It rotates the password of every
// @demo.gifto.example account and prints the new credentials to YOUR terminal.
//
// Why rotation instead of reading stored passwords: Supabase never exposes
// existing passwords, and the seeder deliberately does not print or persist
// them. Treat this output as a secret — do not paste it into issues, docs, or
// chat. It is local-only and every run invalidates the previous passwords.

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

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

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_EMAIL_DOMAIN = "@demo.gifto.example";
const generatePassword = () => crypto.randomBytes(12).toString("base64url");

async function listDemoUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users.filter((u) => u.email?.toLowerCase().endsWith(DEMO_EMAIL_DOMAIN));
}

async function main() {
  const users = await listDemoUsers();
  if (!users.length) {
    console.error(`No demo accounts found (${DEMO_EMAIL_DOMAIN}). Run: npm run seed:demo`);
    process.exit(1);
  }

  const { data: vendors, error } = await db
    .from("vendors")
    .select("name, contact_email")
    .eq("is_demo", true);
  if (error) throw new Error(`vendors: ${error.message}`);
  const vendorByEmail = new Map(
    vendors.filter((v) => v.contact_email).map((v) => [v.contact_email.toLowerCase(), v.name]),
  );

  console.log("Demo owner credentials (rotated just now; previous passwords are invalid):\n");
  for (const user of users.sort((a, b) => a.email.localeCompare(b.email))) {
    const password = generatePassword();
    const { error: updErr } = await db.auth.admin.updateUserById(user.id, { password });
    if (updErr) throw new Error(`updateUserById(${user.email}): ${updErr.message}`);
    const vendor = vendorByEmail.get(user.email.toLowerCase()) ?? "(no vendor)";
    console.log(`  ${user.email}`);
    console.log(`    vendor:   ${vendor}`);
    console.log(`    password: ${password}\n`);
  }
  console.log("Do not commit or share this output.");
}

main().catch((err) => {
  console.error(`Password rotation failed: ${err.message}`);
  process.exit(1);
});
