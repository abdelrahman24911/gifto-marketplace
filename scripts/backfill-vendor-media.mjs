#!/usr/bin/env node
// Gifto Marketplace - copy legacy vendor branding into the vendor-media bucket.
//
// Phase 20/21 added `vendor-media`. Existing logos still live in
// `product-images`; the application reads vendor-media first and falls back to
// product-images while this backfill is pending. The script copies (never
// moves) each object, verifies the byte length, and leaves the source in place
// for rollback.
//
// Usage:
//   node scripts/backfill-vendor-media.mjs          # dry run
//   node scripts/backfill-vendor-media.mjs --apply  # copy and verify
//
// Service-role only. Safe to re-run: objects already present in vendor-media
// are skipped.

import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile(".env.local");
} catch {
  // fall back to the current environment
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

function mimeFor(path) {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME[extension] ?? "application/octet-stream";
}

async function download(bucket, path) {
  const { data, error } = await db.storage.from(bucket).download(path);
  if (error) {
    if (error.statusCode === "404" || error.statusCode === 404) return null;
    throw new Error(`${bucket}/${path}: ${error.message}`);
  }
  return data;
}

async function main() {
  const { data: vendors, error } = await db
    .from("vendors")
    .select("id, name, logo_path, cover_path")
    .or("logo_path.not.is.null,cover_path.not.is.null")
    .order("id");

  if (error) throw new Error(`Could not load vendors: ${error.message}`);

  let copied = 0;
  let skipped = 0;
  const failed = [];

  for (const vendor of vendors ?? []) {
    for (const path of [vendor.logo_path, vendor.cover_path]) {
      if (!path) continue;

      try {
        const existing = await download("vendor-media", path);
        if (existing) {
          skipped += 1;
          continue;
        }

        const source = await download("product-images", path);
        if (!source) {
          skipped += 1;
          continue;
        }

        if (!apply) {
          console.log(`would copy ${path} for ${vendor.name}`);
          copied += 1;
          continue;
        }

        const { error: uploadError } = await db.storage
          .from("vendor-media")
          .upload(path, source, {
            contentType: mimeFor(path),
            cacheControl: "31536000",
            upsert: false,
          });
        if (uploadError) throw new Error(uploadError.message);

        const target = await download("vendor-media", path);
        if (!target || target.size !== source.size) {
          throw new Error(
            `verification failed (source ${source.size} B, target ${target?.size ?? 0} B)`,
          );
        }

        copied += 1;
        console.log(`copied ${path} for ${vendor.name}`);
      } catch (error) {
        failed.push(`${path}: ${error.message}`);
      }
    }
  }

  console.log(
    `${apply ? "Backfill" : "Dry run"} complete: ${copied} copied, ${skipped} skipped, ${failed.length} failed.`,
  );
  if (failed.length > 0) {
    for (const message of failed) console.error(`FAILED ${message}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
