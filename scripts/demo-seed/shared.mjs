#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(HERE, "../..");
export const DEMO_EMAIL_DOMAIN = "@demo.gifto.example";
export const ADMIN_EMAIL = "admin@gifto.example";
export const CREDENTIALS_FILE = path.join(ROOT, ".demo-catalog/credentials.json");

export function loadEnv() {
  try {
    process.loadEnvFile(path.join(ROOT, ".env.local"));
  } catch {
    // fall back to the current environment
  }
}

export function parseArgs(argv = process.argv.slice(2)) {
  return {
    apply: argv.includes("--apply"),
    verify: argv.includes("--verify"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

export function assertTarget() {
  const environment = process.env.DEMO_SEED_ENV ?? process.env.DEMO_CATALOG_ENV;
  if (environment !== "local" && environment !== "preview") {
    throw new Error(
      "Set DEMO_SEED_ENV=local or DEMO_SEED_ENV=preview before targeting a database.",
    );
  }
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    throw new Error("Demo seed scripts refuse to run in a production environment.");
  }

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !anonKey || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const hostname = url.hostname.toLowerCase();
  let projectRef = null;

  if (environment === "local") {
    if (!localHosts.has(hostname)) {
      throw new Error(`DEMO_SEED_ENV=local requires a localhost Supabase URL, got ${hostname}.`);
    }
  } else {
    if (localHosts.has(hostname)) {
      throw new Error("DEMO_SEED_ENV=preview requires a hosted Supabase URL.");
    }
    projectRef = hostname.split(".")[0];
    const allowed = (
      process.env.DEMO_SEED_ALLOWED_PROJECT_REFS ??
      process.env.DEMO_CATALOG_ALLOWED_PROJECT_REFS ??
      ""
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (allowed.length === 0) {
      throw new Error(
        "Set DEMO_SEED_ALLOWED_PROJECT_REFS (or DEMO_CATALOG_ALLOWED_PROJECT_REFS) before running against a hosted target.",
      );
    }
    if (!allowed.includes(projectRef)) {
      throw new Error(`Project ref ${projectRef} is not in the preview allowlist.`);
    }
  }

  return {
    environment,
    url: url.toString().replace(/\/$/, ""),
    hostname,
    projectRef,
    anonKey,
    serviceKey,
  };
}

export function assertApplyConfirmation(script) {
  const expected = `SEED ${script}@1`;
  const actual = process.env.DEMO_SEED_CONFIRM;
  if (actual !== expected) {
    throw new Error(`Set DEMO_SEED_CONFIRM exactly to "${expected}" before applying.`);
  }
}

export function serviceClient(target) {
  return createClient(target.url, target.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function readCredentials() {
  try {
    return JSON.parse(await readFile(CREDENTIALS_FILE, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${CREDENTIALS_FILE}: ${error.message}`);
  }
}

export async function writeCredentials(credentials) {
  await writeFile(CREDENTIALS_FILE, `${JSON.stringify(credentials, null, 2)}\n`, "utf8");
}

export function requireCredential(credentials, key) {
  const credential = credentials?.[key];
  if (!credential?.email || !credential?.password) {
    throw new Error(`Missing credentials for ${key} in ${CREDENTIALS_FILE}.`);
  }
  return credential;
}

export async function findUserByEmail(db, email) {
  const target = email.toLowerCase();
  for (let page = 1; ; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const hit = data.users.find((user) => user.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
}

export async function signInAdmin(target, credentials) {
  const credential = requireCredential(credentials, "platform-admin");
  const client = createClient(target.url, target.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword(credential);
  if (error) throw new Error(`admin sign-in failed: ${error.message}`);
  if (!data.user) throw new Error("admin sign-in returned no user.");

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) throw new Error(`admin profile lookup failed: ${profileError.message}`);
  if (!profile?.is_platform_admin) {
    throw new Error(`${credential.email} is not a platform administrator.`);
  }
  return { client, credential, user: data.user };
}

export function isoDaysAgo(days, hour = 12, minute = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

export function stableUuid(input) {
  const hex = Buffer.from(input).toString("hex").padEnd(32, "0").slice(0, 32);
  const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80)
    .toString(16)
    .padStart(2, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}

export async function selectAll(buildQuery, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}
