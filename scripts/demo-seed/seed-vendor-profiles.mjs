#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  ROOT,
  assertApplyConfirmation,
  assertTarget,
  loadEnv,
  parseArgs,
  serviceClient,
} from "./shared.mjs";

const BRANDING_DIR = path.join(ROOT, "data/demo-seed/vendor-branding");
const BUCKET = "vendor-media";
const SCRIPT = "vendor-profiles";

const PROFILES = [
  {
    slug: "nile-blossoms",
    description:
      "A neighbourhood florist on the Alexandria corniche crafting hand-tied bouquets, vase arrangements and dried-flower pieces for birthdays, graduations and just-because moments. Same-day delivery across Alexandria.",
    addressLine: "14 El Geish Road, Raml Station, Alexandria",
    deliveryCoverage: {
      governorates: ["alexandria", "beheira"],
      areas: ["Raml Station", "Sidi Gaber", "Smouha", "San Stefano"],
    },
    workingHours: {
      sun: { open: "09:00", close: "20:00" },
      mon: { open: "09:00", close: "20:00" },
      tue: { open: "09:00", close: "20:00" },
      wed: { open: "09:00", close: "20:00" },
      thu: { open: "09:00", close: "20:00" },
      fri: { open: "11:00", close: "21:00" },
      sat: { open: "09:00", close: "21:00" },
    },
    prepTimeMin: 0,
    prepTimeMax: 1,
  },
  {
    slug: "cairo-cocoa",
    description:
      "A Maadi chocolate kitchen specialising in Belgian couverture, Egyptian date-and-nut confections and fresh-baked dessert trays. Corporate gift towers are wrapped and branded on request.",
    addressLine: "18 Road 9, Maadi, Cairo",
    deliveryCoverage: {
      governorates: ["cairo", "giza"],
      areas: ["Maadi", "Zamalek", "New Cairo", "Sheikh Zayed", "Dokki"],
    },
    workingHours: {
      sun: { open: "10:00", close: "22:00" },
      mon: { open: "10:00", close: "22:00" },
      tue: { open: "10:00", close: "22:00" },
      wed: { open: "10:00", close: "22:00" },
      thu: { open: "10:00", close: "22:00" },
      fri: { open: "12:00", close: "22:00" },
      sat: { open: "10:00", close: "22:00" },
    },
    prepTimeMin: 1,
    prepTimeMax: 2,
  },
  {
    slug: "legacy-engraving",
    description:
      "A family workshop engraving names, dates and monograms into walnut, leather and brass. Personal keepsakes for weddings and graduations, plus small-batch corporate sets for Egyptian businesses.",
    addressLine: "6 Station Street, Luxor",
    deliveryCoverage: {
      governorates: ["luxor", "qena", "aswan"],
      areas: ["Luxor City", "Karnak", "Qena", "Aswan"],
    },
    workingHours: {
      sun: { open: "10:00", close: "18:00" },
      mon: { open: "10:00", close: "18:00" },
      tue: { open: "10:00", close: "18:00" },
      wed: { open: "10:00", close: "18:00" },
      thu: { open: "10:00", close: "18:00" },
      sat: { open: "11:00", close: "16:00" },
    },
    prepTimeMin: 2,
    prepTimeMax: 4,
  },
  {
    slug: "alex-toy-corner",
    description:
      "A Smouha toy shop stocking plush animals, wooden puzzles, art kits and radio-control favourites. Gift wrapping is included on every order, with age guidance from our shop team.",
    addressLine: "22 Victor Emanuel Square, Smouha, Alexandria",
    deliveryCoverage: {
      governorates: ["alexandria", "beheira"],
      areas: ["Smouha", "Sidi Gaber", "Gleem", "Damanhour"],
    },
    workingHours: {
      sun: { open: "10:00", close: "21:00" },
      mon: { open: "10:00", close: "21:00" },
      tue: { open: "10:00", close: "21:00" },
      wed: { open: "10:00", close: "21:00" },
      thu: { open: "10:00", close: "21:00" },
      fri: { open: "13:00", close: "21:00" },
      sat: { open: "10:00", close: "21:00" },
    },
    prepTimeMin: 1,
    prepTimeMax: 2,
  },
];

async function loadVendors(db) {
  const { data, error } = await db
    .from("vendors")
    .select(
      "id, slug, name, status, is_demo, description, logo_path, cover_path, address_line, working_hours, prep_time_min_days, prep_time_max_days",
    )
    .in(
      "slug",
      PROFILES.map((profile) => profile.slug),
    );
  if (error) throw new Error(`vendor lookup failed: ${error.message}`);
  const bySlug = new Map((data ?? []).map((vendor) => [vendor.slug, vendor]));
  for (const profile of PROFILES) {
    const vendor = bySlug.get(profile.slug);
    if (!vendor) throw new Error(`${profile.slug} is missing.`);
    if (!vendor.is_demo) throw new Error(`${profile.slug} is not demo data.`);
    if (vendor.status !== "active") {
      throw new Error(`${profile.slug} is not active (${vendor.status}).`);
    }
  }
  return bySlug;
}

async function readAssets(vendor) {
  const logoPath = path.join(BRANDING_DIR, vendor.slug, "logo.png");
  const coverPath = path.join(BRANDING_DIR, vendor.slug, "cover.jpg");
  const [logo, cover, logoInfo, coverInfo] = await Promise.all([
    readFile(logoPath),
    readFile(coverPath),
    stat(logoPath),
    stat(coverPath),
  ]);
  if (logoInfo.size > 5 * 1024 * 1024 || coverInfo.size > 5 * 1024 * 1024) {
    throw new Error(`${vendor.slug}: branding asset exceeds the 5 MB bucket limit.`);
  }
  return { logo, cover, logoInfo, coverInfo };
}

function objectPaths(vendor) {
  return {
    logo: `${vendor.id}/branding/logo-${vendor.slug}.png`,
    cover: `${vendor.id}/cover/cover-${vendor.slug}.jpg`,
  };
}

async function verify(db, bySlug) {
  let failures = 0;
  for (const profile of PROFILES) {
    const vendor = bySlug.get(profile.slug);
    const paths = objectPaths(vendor);
    const [logo, cover] = await Promise.all([
      db.storage.from(BUCKET).download(paths.logo),
      db.storage.from(BUCKET).download(paths.cover),
    ]);
    const complete =
      vendor.logo_path === paths.logo &&
      vendor.cover_path === paths.cover &&
      vendor.address_line === profile.addressLine &&
      vendor.prep_time_min_days === profile.prepTimeMin &&
      vendor.prep_time_max_days === profile.prepTimeMax &&
      Boolean(vendor.working_hours && Object.keys(vendor.working_hours).length > 0) &&
      !logo.error &&
      !cover.error;
    if (!complete) {
      failures += 1;
      console.error(
        `${profile.slug}: incomplete profile (logo=${Boolean(vendor.logo_path)}, cover=${Boolean(vendor.cover_path)}, address=${Boolean(vendor.address_line)}, assets=${!logo.error && !cover.error}).`,
      );
    } else {
      console.log(
        `${profile.slug}: logo ${logo.data.size} B, cover ${cover.data.size} B, ${Object.keys(vendor.working_hours).length} working days.`,
      );
    }
  }
  if (failures > 0) throw new Error(`${failures} vendor profile(s) are incomplete.`);
}

async function apply(db, bySlug) {
  for (const profile of PROFILES) {
    const vendor = bySlug.get(profile.slug);
    const assets = await readAssets(vendor);
    const paths = objectPaths(vendor);

    const logoUpload = await db.storage.from(BUCKET).upload(paths.logo, assets.logo, {
      contentType: "image/png",
      cacheControl: "31536000",
      upsert: true,
    });
    if (logoUpload.error) throw new Error(`${profile.slug}: logo upload failed: ${logoUpload.error.message}`);
    const coverUpload = await db.storage.from(BUCKET).upload(paths.cover, assets.cover, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: true,
    });
    if (coverUpload.error) throw new Error(`${profile.slug}: cover upload failed: ${coverUpload.error.message}`);

    const { error } = await db
      .from("vendors")
      .update({
        description: profile.description,
        address_line: profile.addressLine,
        delivery_coverage: profile.deliveryCoverage,
        working_hours: profile.workingHours,
        prep_time_min_days: profile.prepTimeMin,
        prep_time_max_days: profile.prepTimeMax,
        logo_path: paths.logo,
        cover_path: paths.cover,
      })
      .eq("id", vendor.id)
      .eq("is_demo", true);
    if (error) throw new Error(`${profile.slug}: profile update failed: ${error.message}`);

    console.log(`${profile.slug}: branding and profile updated.`);
  }
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log("Usage: node scripts/demo-seed/seed-vendor-profiles.mjs [--verify|--apply]");
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

  if (args.verify) {
    await verify(db, bySlug);
    return;
  }

  await apply(db, bySlug);
  const refreshed = await loadVendors(db);
  await verify(db, refreshed);
}

main().catch((error) => {
  console.error(`Vendor profile seed failed: ${error.message}`);
  process.exit(1);
});
