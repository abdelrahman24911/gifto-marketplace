#!/usr/bin/env node
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

import { ROOT } from "./shared.mjs";

const OUTPUT_DIR = path.join(ROOT, "data/demo-seed");
const BRANDING_DIR = path.join(OUTPUT_DIR, "vendor-branding");
const OCCASION_DIR = path.join(OUTPUT_DIR, "occasion-banners");

const VENDORS = [
  {
    slug: "nile-blossoms",
    name: "Nile Blossoms",
    monogram: "NB",
    tagline: "Alexandria florist · hand-tied bouquets",
    ink: "#5f1830",
    accent: "#c66b7b",
    paper: "#fbf3ea",
    soft: "#efd8d8",
  },
  {
    slug: "cairo-cocoa",
    name: "Cairo Cocoa",
    monogram: "CC",
    tagline: "Maadi chocolate kitchen · small-batch confections",
    ink: "#3d2417",
    accent: "#b98548",
    paper: "#faf1e2",
    soft: "#e6d2b8",
  },
  {
    slug: "legacy-engraving",
    name: "Legacy Engraving",
    monogram: "LE",
    tagline: "Luxor workshop · engraved keepsakes",
    ink: "#3b2b21",
    accent: "#b26a3c",
    paper: "#f6eee2",
    soft: "#ddcbb7",
  },
  {
    slug: "alex-toy-corner",
    name: "Alexandria Toy Corner",
    monogram: "AT",
    tagline: "Smouha toy shop · gifts for little moments",
    ink: "#174c57",
    accent: "#d99a26",
    paper: "#f5f0e3",
    soft: "#cfe3e1",
  },
];

const OCCASIONS = [
  {
    slug: "graduation",
    name: "Graduation",
    kicker: "THE MILESTONE",
    tagline: "Mark the achievement with something they keep.",
    ink: "#172a4a",
    accent: "#c49a45",
    paper: "#f5f0e4",
    soft: "#d9e0ea",
  },
  {
    slug: "ramdan-night",
    name: "Ramadan Nights",
    kicker: "THE HOLY MONTH",
    tagline: "Thoughtful gifts for warm evenings together.",
    ink: "#143c3a",
    accent: "#c9a24a",
    paper: "#f4efdf",
    soft: "#cfe0d8",
  },
  {
    slug: "birthdays",
    name: "Birthdays",
    kicker: "ANOTHER YEAR",
    tagline: "Make the day feel unmistakably theirs.",
    ink: "#6b2631",
    accent: "#e08a5f",
    paper: "#fdf0e6",
    soft: "#f6cabf",
  },
  {
    slug: "weddings",
    name: "Weddings",
    kicker: "THE BEGINNING",
    tagline: "Quietly beautiful gifts for a new chapter.",
    ink: "#40514a",
    accent: "#b99a63",
    paper: "#fbf8ef",
    soft: "#dfe5d7",
  },
  {
    slug: "mothers-day",
    name: "Mother's Day",
    kicker: "FOR HER",
    tagline: "Gifts that say thank you, slowly and well.",
    ink: "#6d3245",
    accent: "#d4938f",
    paper: "#fdf1ed",
    soft: "#f2d2cc",
  },
  {
    slug: "housewarming",
    name: "Housewarming",
    kicker: "A NEW HOME",
    tagline: "Useful, beautiful things for a fresh start.",
    ink: "#54502f",
    accent: "#b5764b",
    paper: "#f7f2e3",
    soft: "#ded7bb",
  },
];

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function logoHtml(vendor) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { margin: 0; }
    .logo {
      width: 800px; height: 800px; position: relative; overflow: hidden;
      background:
        radial-gradient(circle at 22% 18%, ${vendor.soft} 0, transparent 42%),
        linear-gradient(145deg, ${vendor.paper} 0%, #fffdf8 58%, ${vendor.soft} 100%);
      color: ${vendor.ink}; display: grid; place-items: center;
      font-family: Georgia, "Times New Roman", serif;
    }
    .ring { position: absolute; border: 2px solid ${vendor.accent}55; border-radius: 999px; }
    .a { width: 560px; height: 560px; right: -170px; top: -180px; }
    .b { width: 420px; height: 420px; left: -150px; bottom: -160px; }
    .c { width: 12px; height: 12px; border-radius: 999px; background: ${vendor.accent}; right: 150px; bottom: 128px; }
    .mark { position: relative; text-align: center; }
    .monogram {
      width: 300px; height: 300px; margin: 0 auto 42px; border-radius: 50%;
      display: grid; place-items: center; background: ${vendor.ink};
      color: ${vendor.paper}; font-size: 122px; letter-spacing: -0.08em;
      box-shadow: 0 26px 80px -34px ${vendor.ink}aa;
    }
    h1 { margin: 0; font-size: 56px; font-weight: 500; letter-spacing: -0.035em; }
    p { margin: 16px 0 0; font-family: "Segoe UI", Arial, sans-serif; font-size: 15px; letter-spacing: 0.24em; text-transform: uppercase; color: ${vendor.ink}99; }
  </style></head><body>
    <div class="logo">
      <span class="ring a"></span><span class="ring b"></span><span class="c"></span>
      <div class="mark">
        <div class="monogram">${escapeHtml(vendor.monogram)}</div>
        <h1>${escapeHtml(vendor.name)}</h1>
        <p>Demo shop</p>
      </div>
    </div>
  </body></html>`;
}

function coverHtml(vendor) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { margin: 0; }
    .cover {
      width: 1600px; height: 600px; position: relative; overflow: hidden;
      background:
        radial-gradient(circle at 78% 18%, ${vendor.soft} 0, transparent 34%),
        linear-gradient(118deg, ${vendor.ink} 0%, ${vendor.ink} 46%, ${vendor.accent} 135%);
      color: ${vendor.paper}; font-family: Georgia, "Times New Roman", serif;
      padding: 92px 110px; display: flex; flex-direction: column; justify-content: center;
    }
    .eyebrow { font-family: "Segoe UI", Arial, sans-serif; font-size: 17px; letter-spacing: 0.28em; text-transform: uppercase; color: ${vendor.paper}bb; margin: 0 0 28px; }
    h1 { margin: 0; max-width: 980px; font-size: 104px; line-height: 0.94; letter-spacing: -0.045em; font-weight: 500; }
    .rule { width: 180px; height: 3px; background: ${vendor.accent}; margin: 38px 0 26px; }
    p { margin: 0; max-width: 760px; font-family: "Segoe UI", Arial, sans-serif; font-size: 25px; line-height: 1.4; color: ${vendor.paper}dd; }
    .orb { position: absolute; border-radius: 999px; border: 2px solid ${vendor.paper}33; }
    .one { width: 480px; height: 480px; right: -150px; top: -180px; }
    .two { width: 270px; height: 270px; right: 140px; bottom: -150px; border-color: ${vendor.accent}88; }
    .three { width: 20px; height: 20px; background: ${vendor.accent}; right: 118px; top: 120px; border: 0; }
    .monogram { position: absolute; right: 118px; top: 178px; font-size: 230px; letter-spacing: -0.1em; color: ${vendor.paper}14; }
  </style></head><body>
    <div class="cover">
      <span class="orb one"></span><span class="orb two"></span><span class="orb three"></span>
      <span class="monogram">${escapeHtml(vendor.monogram)}</span>
      <p class="eyebrow">Independent shop on Gifto</p>
      <h1>${escapeHtml(vendor.name)}</h1>
      <div class="rule"></div>
      <p>${escapeHtml(vendor.tagline)}</p>
    </div>
  </body></html>`;
}

function bannerHtml(occasion) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { margin: 0; }
    .banner {
      width: 1200px; height: 1200px; position: relative; overflow: hidden;
      background:
        radial-gradient(circle at 20% 12%, ${occasion.soft} 0, transparent 42%),
        linear-gradient(155deg, ${occasion.paper} 0%, #fffdf7 48%, ${occasion.soft} 100%);
      color: ${occasion.ink}; font-family: Georgia, "Times New Roman", serif;
      padding: 96px 92px; display: flex; flex-direction: column; justify-content: flex-end;
    }
    .kicker { font-family: "Segoe UI", Arial, sans-serif; font-size: 18px; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; color: ${occasion.ink}aa; margin: 0 0 24px; }
    h1 { margin: 0; font-size: 122px; line-height: 0.9; letter-spacing: -0.05em; font-weight: 500; }
    p { margin: 30px 0 0; max-width: 760px; font-family: "Segoe UI", Arial, sans-serif; font-size: 28px; line-height: 1.45; color: ${occasion.ink}bb; }
    .ring { position: absolute; border-radius: 999px; border: 2px solid ${occasion.accent}88; }
    .one { width: 620px; height: 620px; right: -190px; top: -160px; }
    .two { width: 390px; height: 390px; right: 95px; top: 110px; border-color: ${occasion.accent}66; }
    .orb { position: absolute; border-radius: 999px; background: ${occasion.accent}; opacity: 0.9; }
    .a { width: 28px; height: 28px; right: 342px; top: 470px; }
    .b { width: 14px; height: 14px; right: 190px; top: 610px; opacity: 0.55; }
    .c { width: 66px; height: 66px; left: 90px; top: 110px; opacity: 0.22; }
    .arc { position: absolute; width: 700px; height: 350px; border-radius: 700px 700px 0 0; border: 2px solid ${occasion.accent}55; border-bottom: 0; right: -120px; bottom: -20px; }
  </style></head><body>
    <div class="banner">
      <span class="ring one"></span><span class="ring two"></span><span class="arc"></span>
      <span class="orb a"></span><span class="orb b"></span><span class="orb c"></span>
      <p class="kicker">${escapeHtml(occasion.kicker)}</p>
      <h1>${escapeHtml(occasion.name)}</h1>
      <p>${escapeHtml(occasion.tagline)}</p>
    </div>
  </body></html>`;
}

async function screenshot(page, html, filePath, width, height, type) {
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: filePath, type, quality: type === "jpeg" ? 88 : undefined });
  const info = await stat(filePath);
  if (info.size < 12_000) throw new Error(`${filePath} is unexpectedly small (${info.size} bytes).`);
  return info.size;
}

async function main() {
  await mkdir(BRANDING_DIR, { recursive: true });
  await mkdir(OCCASION_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });

    for (const vendor of VENDORS) {
      const vendorDir = path.join(BRANDING_DIR, vendor.slug);
      await mkdir(vendorDir, { recursive: true });
      const logoBytes = await screenshot(
        page,
        logoHtml(vendor),
        path.join(vendorDir, "logo.png"),
        800,
        800,
        "png",
      );
      const coverBytes = await screenshot(
        page,
        coverHtml(vendor),
        path.join(vendorDir, "cover.jpg"),
        1600,
        600,
        "jpeg",
      );
      console.log(`${vendor.slug}: logo ${logoBytes} B, cover ${coverBytes} B`);
    }

    for (const occasion of OCCASIONS) {
      const bannerBytes = await screenshot(
        page,
        bannerHtml(occasion),
        path.join(OCCASION_DIR, `${occasion.slug}.jpg`),
        1200,
        1200,
        "jpeg",
      );
      console.log(`${occasion.slug}: banner ${bannerBytes} B`);
    }
  } finally {
    await browser.close();
  }

  console.log(`Artwork written to ${path.relative(ROOT, OUTPUT_DIR)}.`);
}

main().catch((error) => {
  console.error(`Artwork generation failed: ${error.message}`);
  process.exit(1);
});
