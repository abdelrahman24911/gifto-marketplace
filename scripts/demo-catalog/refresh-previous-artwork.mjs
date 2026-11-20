#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const DATA_DIR = path.join(ROOT, "data/demo-catalog-previous");
const IMAGE_DIR = path.join(DATA_DIR, "images");
const SIZE = 1024;

const THEMES = {
  rose: {
    bg1: "#f8e9e8",
    bg2: "#e7c5c4",
    glow: "#fff8f5",
    arch: "#d7a9aa",
    accent: "#9a2f3f",
    accent2: "#cf777b",
    soft: "#f1cfd0",
    deep: "#4b242b",
    paper: "#fbf1e9",
    wood: "#b88f6a",
    metal: "#c6a15b",
    green: "#6f7d5e",
  },
  lily: {
    bg1: "#f2f3e8",
    bg2: "#dbe1cc",
    glow: "#fcfdf6",
    arch: "#bcc8ad",
    accent: "#f8f5e8",
    accent2: "#d9ddc7",
    soft: "#e8eadc",
    deep: "#3f4938",
    paper: "#f9f7ee",
    wood: "#b08b63",
    metal: "#bfa266",
    green: "#73855f",
  },
  sun: {
    bg1: "#f9efd9",
    bg2: "#ead2a7",
    glow: "#fffbf0",
    arch: "#dcc190",
    accent: "#d3a13b",
    accent2: "#f0cf72",
    soft: "#f4e4b9",
    deep: "#594423",
    paper: "#fbf4e4",
    wood: "#a97c4c",
    metal: "#c4a05b",
    green: "#758057",
  },
  peony: {
    bg1: "#f8ece9",
    bg2: "#ead0cc",
    glow: "#fff8f4",
    arch: "#dcbdb8",
    accent: "#ca7e7a",
    accent2: "#eab6a9",
    soft: "#f5ddd5",
    deep: "#5a3834",
    paper: "#fbf2ec",
    wood: "#b58a67",
    metal: "#c6a15d",
    green: "#748260",
  },
  pampas: {
    bg1: "#f4ecdf",
    bg2: "#dfcfb5",
    glow: "#fdf9f0",
    arch: "#cbb795",
    accent: "#c3a379",
    accent2: "#e3cfac",
    soft: "#eee2cd",
    deep: "#544433",
    paper: "#faf3e7",
    wood: "#a47f57",
    metal: "#b99a61",
    green: "#85846a",
  },
  graduation: {
    bg1: "#eef0ea",
    bg2: "#d4dacd",
    glow: "#fafcf7",
    arch: "#b4c0ae",
    accent: "#304a58",
    accent2: "#c6a65a",
    soft: "#e3e6d9",
    deep: "#22323b",
    paper: "#f6f5ea",
    wood: "#a68059",
    metal: "#c6a45a",
    green: "#687b5d",
  },
  chocolate: {
    bg1: "#f5eadc",
    bg2: "#dfc7ac",
    glow: "#fffaf2",
    arch: "#c7a987",
    accent: "#603a28",
    accent2: "#c38d56",
    soft: "#e8d3b7",
    deep: "#33221a",
    paper: "#f9f1e3",
    wood: "#a77851",
    metal: "#c9a15b",
    green: "#6e7458",
  },
  date: {
    bg1: "#f7edda",
    bg2: "#e5ceaa",
    glow: "#fffaf0",
    arch: "#cfb488",
    accent: "#7d4d2d",
    accent2: "#d2a160",
    soft: "#ecd9bd",
    deep: "#463020",
    paper: "#fbf4e6",
    wood: "#a97c53",
    metal: "#c9a45d",
    green: "#717b58",
  },
  baklava: {
    bg1: "#f8efdc",
    bg2: "#e6d1a9",
    glow: "#fffbf1",
    arch: "#d0b687",
    accent: "#c5923e",
    accent2: "#e5c16e",
    soft: "#f0dfb9",
    deep: "#58401f",
    paper: "#fbf5e8",
    wood: "#aa7f4f",
    metal: "#c8a256",
    green: "#6e7e54",
  },
  cake: {
    bg1: "#f5e9e3",
    bg2: "#dfc7bd",
    glow: "#fff9f5",
    arch: "#c9a99f",
    accent: "#5c3326",
    accent2: "#b87362",
    soft: "#ead2c8",
    deep: "#35211a",
    paper: "#fbf2ec",
    wood: "#a77c5d",
    metal: "#c19c5e",
    green: "#6c755a",
  },
  bonbon: {
    bg1: "#f7e9e8",
    bg2: "#e4cbc9",
    glow: "#fff8f7",
    arch: "#cfaeae",
    accent: "#b45363",
    accent2: "#e0a06f",
    soft: "#f0d7d2",
    deep: "#4b2b30",
    paper: "#fbf2ec",
    wood: "#b48867",
    metal: "#c7a05e",
    green: "#6f7d60",
  },
  walnut: {
    bg1: "#f2e9dc",
    bg2: "#dbc6ab",
    glow: "#fdf8ef",
    arch: "#c4a986",
    accent: "#7b5334",
    accent2: "#b58a60",
    soft: "#e8d8c2",
    deep: "#3f2c1e",
    paper: "#faf3e7",
    wood: "#9d744e",
    metal: "#c09c60",
    green: "#68745a",
  },
  leather: {
    bg1: "#f4e8e6",
    bg2: "#ddc8c7",
    glow: "#fff8f6",
    arch: "#c9aaa9",
    accent: "#733544",
    accent2: "#a66a70",
    soft: "#ead4d5",
    deep: "#3e222a",
    paper: "#faf1ec",
    wood: "#a47a5c",
    metal: "#c7a05d",
    green: "#6c7660",
  },
  frame: {
    bg1: "#f3ebdf",
    bg2: "#dccbb4",
    glow: "#fdf9f1",
    arch: "#c6ad8d",
    accent: "#a1744e",
    accent2: "#c89d75",
    soft: "#ead9c5",
    deep: "#453224",
    paper: "#faf3e9",
    wood: "#9b6f4b",
    metal: "#bf9a5c",
    green: "#728160",
  },
  corporate: {
    bg1: "#edf0ec",
    bg2: "#d3dcd6",
    glow: "#fafcf9",
    arch: "#b3c1b8",
    accent: "#2d4551",
    accent2: "#b48f4f",
    soft: "#e0e6e1",
    deep: "#1f3038",
    paper: "#f6f5ec",
    wood: "#a57d58",
    metal: "#c3a05c",
    green: "#64755f",
  },
  toy: {
    bg1: "#f8f0df",
    bg2: "#e6d4b5",
    glow: "#fffaf0",
    arch: "#d1b992",
    accent: "#cc8668",
    accent2: "#7fa1a0",
    soft: "#f1dfc6",
    deep: "#4d3b2a",
    paper: "#fbf5e9",
    wood: "#ae8253",
    metal: "#c4a05b",
    green: "#718761",
  },
  compass: {
    bg1: "#f1ecdf",
    bg2: "#d8ceb9",
    glow: "#fdf9f0",
    arch: "#bfae8f",
    accent: "#9f7436",
    accent2: "#d1b16e",
    soft: "#ece1c9",
    deep: "#403728",
    paper: "#faf5e9",
    wood: "#92704d",
    metal: "#c8a75c",
    green: "#647661",
  },
};

const PRODUCTS = [
  {
    slug: "classic-red-rose-bouquet",
    name: "Classic Red Rose Bouquet",
    vendorSlug: "nile-blossoms",
    theme: "rose",
    kind: "roses",
    file: "classic-red-rose-bouquet.jpg",
    alt: "Illustration of a classic red rose bouquet wrapped in kraft paper with a gold ribbon.",
  },
  {
    slug: "white-lily-arrangement",
    name: "White Lily & Gypsophila Arrangement",
    vendorSlug: "nile-blossoms",
    theme: "lily",
    kind: "lilies",
    file: "white-lily-arrangement.jpg",
    alt: "Illustration of white lilies and gypsophila arranged in a pale ceramic vase.",
  },
  {
    slug: "sunflower-bright-bunch",
    name: "Sunflower Bright Bunch",
    vendorSlug: "nile-blossoms",
    theme: "sun",
    kind: "sunflowers",
    file: "sunflower-bright-bunch.jpg",
    alt: "Illustration of a bright sunflower bunch wrapped in warm kraft paper.",
  },
  {
    slug: "pastel-peony-bouquet",
    name: "Pastel Peony Bouquet",
    vendorSlug: "nile-blossoms",
    theme: "peony",
    kind: "peonies",
    file: "pastel-peony-bouquet.jpg",
    alt: "Illustration of a pastel peony bouquet in blush and cream tones.",
  },
  {
    slug: "dried-pampas-vase",
    name: "Dried Pampas Vase Arrangement",
    vendorSlug: "nile-blossoms",
    theme: "pampas",
    kind: "pampas",
    file: "dried-pampas-vase.jpg",
    alt: "Illustration of dried pampas grass stems arranged in a textured ceramic vase.",
  },
  {
    slug: "graduation-flower-box",
    name: "Graduation Flower Box",
    vendorSlug: "nile-blossoms",
    theme: "graduation",
    kind: "graduation",
    file: "graduation-flower-box.jpg",
    alt: "Illustration of a graduation flower box with a gold ribbon and a small graduation cap.",
  },
  {
    slug: "belgian-dark-truffle-box",
    name: "Belgian Dark Truffle Box (16 pc)",
    vendorSlug: "cairo-cocoa",
    theme: "chocolate",
    kind: "truffles",
    file: "belgian-dark-truffle-box.jpg",
    alt: "Illustration of sixteen dark chocolate truffles in a ribboned gift box.",
  },
  {
    slug: "date-chocolate-gift-box",
    name: "Egyptian Date & Chocolate Gift Box",
    vendorSlug: "cairo-cocoa",
    theme: "date",
    kind: "dates",
    file: "date-chocolate-gift-box.jpg",
    alt: "Illustration of an Egyptian date and chocolate gift box with gold detailing.",
  },
  {
    slug: "pistachio-baklava-tray",
    name: "Pistachio Baklava Tray (1 kg)",
    vendorSlug: "cairo-cocoa",
    theme: "baklava",
    kind: "baklava",
    file: "pistachio-baklava-tray.jpg",
    alt: "Illustration of a brass tray filled with pistachio baklava pieces.",
  },
  {
    slug: "molten-cake-dessert-kit",
    name: "Molten Cake Dessert Kit",
    vendorSlug: "cairo-cocoa",
    theme: "cake",
    kind: "lava-cake",
    file: "molten-cake-dessert-kit.jpg",
    alt: "Illustration of a molten chocolate cake dessert kit with sauce and a gift box.",
  },
  {
    slug: "luxury-chocolate-tower",
    name: "Luxury Chocolate Tower (3 tiers)",
    vendorSlug: "cairo-cocoa",
    theme: "chocolate",
    kind: "tower",
    file: "luxury-chocolate-tower.jpg",
    alt: "Illustration of a three-tier luxury chocolate tower tied with a gold ribbon.",
  },
  {
    slug: "assorted-bonbon-bag",
    name: "Assorted Bonbon Bag (24 pc)",
    vendorSlug: "cairo-cocoa",
    theme: "bonbon",
    kind: "bonbons",
    file: "assorted-bonbon-bag.jpg",
    alt: "Illustration of a gift bag filled with assorted colourful bonbons.",
  },
  {
    slug: "engraved-walnut-keepsake-box",
    name: "Engraved Walnut Keepsake Box",
    vendorSlug: "legacy-engraving",
    theme: "walnut",
    kind: "walnut-box",
    file: "engraved-walnut-keepsake-box.jpg",
    alt: "Illustration of an engraved walnut keepsake box with brass hinges.",
  },
  {
    slug: "monogram-leather-journal",
    name: "Monogram Leather Journal",
    vendorSlug: "legacy-engraving",
    theme: "leather",
    kind: "journal",
    file: "monogram-leather-journal.jpg",
    alt: "Illustration of a burgundy leather journal with a gold monogram and strap.",
  },
  {
    slug: "personalized-photo-frame",
    name: "Personalized Photo Frame (Oak)",
    vendorSlug: "legacy-engraving",
    theme: "frame",
    kind: "photo-frame",
    file: "personalized-photo-frame.jpg",
    alt: "Illustration of a personalised oak photo frame with an engraved nameplate.",
  },
  {
    slug: "corporate-pen-card-set",
    name: "Corporate Pen & Card Set",
    vendorSlug: "legacy-engraving",
    theme: "corporate",
    kind: "pen-set",
    file: "corporate-pen-card-set.jpg",
    alt: "Illustration of a corporate pen and card set presented in a gift box.",
  },
  {
    slug: "custom-name-wooden-toy",
    name: "Custom Name Wooden Toy",
    vendorSlug: "legacy-engraving",
    theme: "toy",
    kind: "name-toy",
    file: "custom-name-wooden-toy.jpg",
    alt: "Illustration of a custom wooden name puzzle toy with colourful letters.",
  },
  {
    slug: "engraved-brass-compass",
    name: "Engraved Brass Compass",
    vendorSlug: "legacy-engraving",
    theme: "compass",
    kind: "compass",
    file: "engraved-brass-compass.jpg",
    alt: "Illustration of an engraved brass compass with an open lid and leather strap.",
  },
];

function flower(cx, cy, radius, petal, center, petalCount = 8, rotation = 0, deep = "#5f3b35") {
  let output = `<g transform="translate(${cx} ${cy}) rotate(${rotation})">`;
  for (let index = 0; index < petalCount; index += 1) {
    const angle = (360 / petalCount) * index;
    output += `<ellipse cx="0" cy="${-radius * 0.58}" rx="${radius * 0.4}" ry="${radius * 0.62}" fill="${petal}" transform="rotate(${angle})" opacity="0.95"/>`;
  }
  output += `<circle r="${radius * 0.34}" fill="${center}"/>`;
  output += `<circle r="${radius * 0.2}" fill="${deep}" opacity="0.15"/>`;
  for (let dot = 0; dot < 7; dot += 1) {
    const angle = (Math.PI * 2 * dot) / 7;
    output += `<circle cx="${Math.cos(angle) * radius * 0.17}" cy="${Math.sin(angle) * radius * 0.17}" r="${radius * 0.035}" fill="${deep}" opacity="0.4"/>`;
  }
  output += "</g>";
  return output;
}

function rose(cx, cy, radius, petal, inner, rotation = 0) {
  let output = `<g transform="translate(${cx} ${cy}) rotate(${rotation})">`;
  output += `<circle r="${radius}" fill="${petal}"/>`;
  output += `<circle r="${radius * 0.82}" fill="${inner}" opacity="0.24"/>`;
  output += `<path d="M ${-radius * 0.58} ${radius * 0.08} C ${-radius * 0.5} ${-radius * 0.44}, ${radius * 0.46} ${-radius * 0.48}, ${radius * 0.42} ${radius * 0.08} C ${radius * 0.34} ${radius * 0.46}, ${-radius * 0.32} ${radius * 0.44}, ${-radius * 0.58} ${radius * 0.08}" fill="none" stroke="${inner}" stroke-width="${radius * 0.1}" opacity="0.55"/>`;
  output += `<path d="M ${-radius * 0.3} ${radius * 0.04} C ${-radius * 0.18} ${-radius * 0.3}, ${radius * 0.3} ${-radius * 0.25}, ${radius * 0.21} ${radius * 0.1} C ${radius * 0.12} ${radius * 0.35}, ${-radius * 0.2} ${radius * 0.3}, ${-radius * 0.3} ${radius * 0.04}" fill="none" stroke="${inner}" stroke-width="${radius * 0.09}" opacity="0.48"/>`;
  output += `<circle r="${radius * 0.12}" fill="${inner}" opacity="0.35"/>`;
  output += "</g>";
  return output;
}

function sunflower(cx, cy, radius, petal, center, rotation = 0) {
  let output = `<g transform="translate(${cx} ${cy}) rotate(${rotation})">`;
  for (let index = 0; index < 16; index += 1) {
    output += `<ellipse cx="0" cy="${-radius * 0.7}" rx="${radius * 0.18}" ry="${radius * 0.48}" fill="${petal}" transform="rotate(${index * 22.5})"/>`;
  }
  output += `<circle r="${radius * 0.4}" fill="${center}"/>`;
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      output += `<circle cx="${(column - 1.5) * radius * 0.15}" cy="${(row - 1) * radius * 0.15}" r="${radius * 0.035}" fill="#3c281e" opacity="0.5"/>`;
    }
  }
  output += "</g>";
  return output;
}

function lily(cx, cy, radius, petal, accent, rotation = 0) {
  let output = `<g transform="translate(${cx} ${cy}) rotate(${rotation})">`;
  for (let index = 0; index < 6; index += 1) {
    output += `<path d="M 0 ${radius * 0.2} C ${-radius * 0.42} ${-radius * 0.12}, ${-radius * 0.34} ${-radius * 0.9}, 0 ${-radius * 0.96} C ${radius * 0.34} ${-radius * 0.9}, ${radius * 0.42} ${-radius * 0.12}, 0 ${radius * 0.2} Z" fill="${petal}" stroke="${accent}" stroke-width="3" transform="rotate(${index * 60})"/>`;
  }
  output += `<circle r="${radius * 0.13}" fill="${accent}" opacity="0.8"/>`;
  output += `<path d="M 0 0 L ${-radius * 0.28} ${-radius * 0.42}" stroke="${accent}" stroke-width="4" stroke-linecap="round"/>`;
  output += `<path d="M 0 0 L ${radius * 0.28} ${-radius * 0.42}" stroke="${accent}" stroke-width="4" stroke-linecap="round"/>`;
  output += "</g>";
  return output;
}

function leaf(cx, cy, rx, ry, rotation, color, opacity = 0.92) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${color}" opacity="${opacity}" transform="rotate(${rotation} ${cx} ${cy})"/>`;
}

function sparkle(cx, cy, size, color) {
  return `<path d="M ${cx} ${cy - size} L ${cx + size * 0.23} ${cy - size * 0.23} L ${cx + size} ${cy} L ${cx + size * 0.23} ${cy + size * 0.23} L ${cx} ${cy + size} L ${cx - size * 0.23} ${cy + size * 0.23} L ${cx - size} ${cy} L ${cx - size * 0.23} ${cy - size * 0.23} Z" fill="${color}" opacity="0.82"/>`;
}

function shadowOpen() {
  return `<g filter="url(#shadow)">`;
}

function stem(fromX, fromY, toX, toY, color, width = 8) {
  return `<path d="M ${fromX} ${fromY} Q ${(fromX + toX) / 2 + 18} ${(fromY + toY) / 2} ${toX} ${toY}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" opacity="0.82"/>`;
}

function kraftWrap(palette, topY = 644, bottomY = 860) {
  return `${shadowOpen()}
    <path d="M 382 ${topY} L 642 ${topY - 8} L 592 ${bottomY} Q 512 ${bottomY + 36} 432 ${bottomY} Z" fill="${palette.wood}"/>
    <path d="M 382 ${topY} L 512 ${topY + 96} L 642 ${topY - 8} L 592 ${bottomY} Q 512 ${bottomY + 36} 432 ${bottomY} Z" fill="${palette.paper}" opacity="0.24"/>
    <path d="M 400 ${topY + 5} Q 512 ${topY + 63} 624 ${topY - 3}" fill="none" stroke="${palette.accent}" stroke-width="18" opacity="0.82"/>
    <path d="M 512 ${topY + 40} L 482 ${topY + 94} L 512 ${topY + 78} L 542 ${topY + 94} Z" fill="${palette.paper}" opacity="0.84"/>
  </g>`;
}

function renderRoses(palette) {
  const rosePositions = [
    [428, 390, 76, 0],
    [560, 342, 82, 1],
    [644, 454, 66, 2],
    [396, 502, 62, 1],
    [512, 500, 56, 0],
    [602, 566, 54, 2],
    [450, 612, 46, 1],
  ];
  let output = `<g>`;
  for (const [x, y] of rosePositions) {
    output += stem(512, 742, x, y, palette.green, 8);
    output += leaf(x + 48, y + 58, 28, 11, -38, palette.green);
    output += leaf(x - 44, y + 66, 24, 10, 42, palette.green);
  }
  output += kraftWrap(palette);
  const colors = [palette.accent, palette.accent2, palette.soft];
  for (const [x, y, radius, colorIndex] of rosePositions) {
    output += rose(x, y, radius, colors[colorIndex], palette.deep, x + y);
    output += leaf(x + radius * 0.72, y + radius * 0.52, radius * 0.38, radius * 0.15, 38, palette.green);
    output += leaf(x - radius * 0.68, y + radius * 0.62, radius * 0.32, radius * 0.13, -42, palette.green);
  }
  output += sparkle(352, 338, 12, palette.metal);
  output += sparkle(674, 336, 9, palette.metal);
  output += "</g>";
  return output;
}

function renderLilies(palette) {
  const flowers = [
    [396, 420, 60, -12],
    [548, 352, 70, 4],
    [640, 480, 58, 14],
    [492, 512, 54, -8],
  ];
  let output = `<g>`;
  for (const [x, y] of flowers) {
    output += stem(512, 700, x, y, palette.green, 7);
    output += leaf(x + 46, y + 74, 29, 11, -36, palette.green);
    output += leaf(x - 42, y + 82, 25, 10, 40, palette.green);
  }
  output += shadowOpen();
  output += `<path d="M 400 692 Q 400 660 438 660 L 586 660 Q 624 660 624 692 L 610 838 Q 512 866 414 838 Z" fill="${palette.paper}" stroke="${palette.deep}" stroke-opacity="0.12" stroke-width="5"/>`;
  output += `<ellipse cx="512" cy="662" rx="112" ry="22" fill="${palette.soft}" opacity="0.8"/>`;
  output += `</g>`;
  for (const [x, y, radius, rotation] of flowers) {
    output += lily(x, y, radius, palette.accent, palette.metal, rotation);
    output += leaf(x + radius * 0.8, y + radius * 0.48, radius * 0.4, radius * 0.15, 42, palette.green);
  }
  const gypsophila = [
    [320, 360, 18],
    [346, 316, 13],
    [286, 430, 15],
    [684, 356, 16],
    [714, 410, 12],
    [664, 588, 15],
    [352, 612, 14],
    [724, 556, 11],
  ];
  for (const [x, y, radius] of gypsophila) {
    output += `<circle cx="${x}" cy="${y}" r="${radius}" fill="${palette.paper}" opacity="0.9"/>`;
    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI * 2 * index) / 6;
      output += `<circle cx="${x + Math.cos(angle) * radius * 0.6}" cy="${y + Math.sin(angle) * radius * 0.6}" r="${radius * 0.28}" fill="${palette.paper}" opacity="0.8"/>`;
    }
  }
  output += sparkle(360, 292, 10, palette.metal);
  output += "</g>";
  return output;
}

function renderSunflowers(palette) {
  const flowers = [
    [412, 374, 62, -8],
    [560, 330, 70, 4],
    [648, 452, 56, 13],
    [484, 492, 52, -4],
    [374, 536, 48, -12],
    [588, 560, 54, 9],
  ];
  let output = `<g>`;
  for (const [x, y] of flowers) {
    output += stem(512, 730, x, y, palette.green, 9);
    output += leaf(x + 44, y + 64, 30, 12, -38, palette.green);
    output += leaf(x - 42, y + 72, 26, 11, 38, palette.green);
  }
  output += kraftWrap(palette, 636, 858);
  for (const [x, y, radius, rotation] of flowers) {
    output += sunflower(x, y, radius, palette.accent, palette.deep, rotation);
  }
  output += sparkle(336, 414, 10, palette.metal);
  output += sparkle(704, 388, 8, palette.metal);
  output += "</g>";
  return output;
}

function renderPeonies(palette) {
  const flowers = [
    [392, 408, 72, -9],
    [546, 342, 78, 5],
    [646, 454, 66, 12],
    [458, 516, 62, -2],
    [604, 558, 58, 10],
  ];
  let output = `<g>`;
  for (const [x, y] of flowers) {
    output += stem(512, 728, x, y, palette.green, 8);
    output += leaf(x + 46, y + 66, 26, 10, -38, palette.green);
  }
  output += `<g filter="url(#shadow)"><path d="M 386 646 L 642 638 L 592 862 Q 512 896 432 860 Z" fill="${palette.soft}"/><path d="M 386 646 L 512 748 L 642 638 L 592 862 Q 512 896 432 860 Z" fill="${palette.paper}" opacity="0.3"/><path d="M 408 650 Q 512 714 624 642" fill="none" stroke="${palette.accent}" stroke-width="16" opacity="0.7"/></g>`;
  for (const [x, y, radius] of flowers) {
    output += flower(x, y, radius, palette.accent2, palette.metal, 9, x, palette.deep);
    output += flower(x - radius * 0.2, y + radius * 0.1, radius * 0.62, palette.accent, palette.paper, 7, -x, palette.deep);
    output += leaf(x + radius * 0.72, y + radius * 0.55, radius * 0.4, radius * 0.16, 40, palette.green);
  }
  output += sparkle(360, 322, 12, palette.metal);
  output += sparkle(688, 340, 8, palette.metal);
  output += "</g>";
  return output;
}

function renderPampas(palette) {
  const stems = [
    [512, 684, 374, 270, -8],
    [512, 684, 444, 210, -4],
    [512, 684, 530, 190, 2],
    [512, 684, 628, 244, 7],
    [512, 684, 686, 350, 12],
    [512, 684, 342, 390, -14],
  ];
  let output = `<g>`;
  for (const [x1, y1, x2, y2] of stems) {
    output += stem(x1, y1, x2, y2, palette.green, 6);
  }
  output += shadowOpen();
  output += `<path d="M 404 672 Q 404 640 440 640 L 584 640 Q 620 640 620 672 L 604 848 Q 512 878 420 848 Z" fill="${palette.paper}" stroke="${palette.deep}" stroke-opacity="0.12" stroke-width="5"/>`;
  output += `<path d="M 424 700 Q 512 676 600 700 L 590 776 Q 512 798 434 776 Z" fill="${palette.soft}" opacity="0.55"/>`;
  for (let index = 0; index < 24; index += 1) {
    output += `<circle cx="${432 + ((index * 71) % 160)}" cy="${722 + ((index * 37) % 104)}" r="3" fill="${palette.deep}" opacity="0.18"/>`;
  }
  output += `</g>`;
  for (const [x1, y1, x2, y2] of stems) {
    const angle = Math.atan2(y2 - y1, x2 - x1) * 57.3 + 90;
    const plumeBaseX = x1 + (x2 - x1) * 0.38;
    const plumeBaseY = y1 + (y2 - y1) * 0.38;
    output += `<path d="M ${plumeBaseX} ${plumeBaseY} L ${x2} ${y2}" stroke="${palette.accent2}" stroke-width="34" stroke-linecap="round" opacity="0.28"/>`;
    for (let index = 0; index < 30; index += 1) {
      const t = index / 29;
      const x = plumeBaseX + (x2 - plumeBaseX) * t;
      const y = plumeBaseY + (y2 - plumeBaseY) * t;
      const width = 7 + 16 * t;
      const offset = Math.sin(index * 2.4) * (5 + 13 * t);
      output += `<ellipse cx="${x + offset * 0.45}" cy="${y}" rx="${width * 0.52}" ry="${width * 1.8}" fill="${index % 4 === 0 ? palette.paper : palette.accent2}" opacity="${0.5 + t * 0.34}" transform="rotate(${angle + Math.sin(index * 1.7) * 9} ${x} ${y})"/>`;
    }
    for (let index = 0; index < 9; index += 1) {
      const t = 0.52 + index * 0.055;
      const x = plumeBaseX + (x2 - plumeBaseX) * t;
      const y = plumeBaseY + (y2 - plumeBaseY) * t;
      const side = index % 2 === 0 ? -1 : 1;
      output += `<ellipse cx="${x + side * (13 + index * 1.6)}" cy="${y - 4}" rx="${5 + index * 0.5}" ry="${15 + index}" fill="${palette.paper}" opacity="0.62" transform="rotate(${angle + side * 24} ${x} ${y})"/>`;
    }
  }
  output += leaf(390, 600, 82, 15, -48, palette.accent, 0.48);
  output += leaf(646, 606, 74, 14, 44, palette.accent, 0.42);
  output += "</g>";
  return output;
}

function renderGraduation(palette) {
  let output = `<g>`;
  const flowers = [
    [396, 510, 58],
    [472, 438, 64],
    [558, 430, 58],
    [636, 500, 52],
    [514, 544, 50],
  ];
  for (const [x, y] of flowers) {
    output += stem(512, 706, x, y, palette.green, 7);
    output += leaf(x + 42, y + 60, 22, 9, -36, palette.green);
  }
  output += shadowOpen();
  output += `<path d="M 350 664 L 674 664 L 650 850 L 374 850 Z" fill="${palette.accent}"/>`;
  output += `<path d="M 350 664 L 674 664 L 662 716 L 362 716 Z" fill="${palette.paper}" opacity="0.16"/>`;
  output += `<path d="M 512 664 L 512 850" stroke="${palette.metal}" stroke-width="22" opacity="0.9"/>`;
  output += `<path d="M 366 750 L 658 750" stroke="${palette.metal}" stroke-width="18" opacity="0.9"/>`;
  output += `<path d="M 512 700 C 472 666, 462 716, 500 726 C 478 746, 522 772, 532 738 C 554 766, 592 734, 560 720 C 588 692, 546 670, 512 700 Z" fill="${palette.metal}"/>`;
  output += `<rect x="584" y="774" width="54" height="34" rx="5" fill="${palette.paper}" transform="rotate(-7 611 791)"/>`;
  output += `<path d="M 596 790 L 626 786" stroke="${palette.deep}" stroke-width="3" opacity="0.38"/>`;
  output += `</g>`;
  for (const [x, y, radius] of flowers) {
    output += flower(x, y, radius, palette.paper, palette.metal, 8, x, palette.deep);
    output += flower(x - radius * 0.2, y + radius * 0.1, radius * 0.56, palette.accent2, palette.paper, 7, -x, palette.deep);
    output += leaf(x + radius * 0.68, y + radius * 0.52, radius * 0.34, radius * 0.14, 38, palette.green);
  }
  output += `<g transform="translate(512 258)">`;
  output += `<path d="M -104 34 L 0 -28 L 104 34 L 0 96 Z" fill="${palette.deep}"/>`;
  output += `<path d="M -104 34 L 0 -28 L 104 34 L 0 52 Z" fill="${palette.accent}"/>`;
  output += `<path d="M 0 60 L 0 148" stroke="${palette.metal}" stroke-width="7"/>`;
  output += `<path d="M 0 148 L -20 206 L 0 194 L 20 206 Z" fill="${palette.metal}"/>`;
  output += `<circle cx="0" cy="60" r="8" fill="${palette.metal}"/>`;
  output += `</g>`;
  output += sparkle(324, 400, 12, palette.metal);
  output += sparkle(700, 432, 9, palette.metal);
  output += "</g>";
  return output;
}

function renderTruffles(palette) {
  let output = `<g>`;
  output += shadowOpen();
  output += `<path d="M 284 450 L 740 450 L 714 470 L 714 500 L 286 500 L 286 470 Z" fill="${palette.deep}"/>`;
  output += `<path d="M 300 500 L 724 500 L 696 824 L 328 824 Z" fill="${palette.paper}" stroke="${palette.deep}" stroke-opacity="0.2" stroke-width="6"/>`;
  output += `<path d="M 330 528 L 694 528 L 676 796 L 348 796 Z" fill="${palette.soft}" opacity="0.45"/>`;
  output += `</g>`;
  const colors = [palette.deep, palette.accent, "#4d2f22", "#3b251c"];
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const x = 382 + column * 88;
      const y = 576 + row * 56;
      output += `<circle cx="${x}" cy="${y}" r="27" fill="${colors[(row + column) % colors.length]}"/>`;
      output += `<path d="M ${x - 18} ${y - 14} Q ${x} ${y - 26} ${x + 18} ${y - 15}" fill="none" stroke="${palette.paper}" stroke-width="3" opacity="0.25" stroke-linecap="round"/>`;
      output += `<circle cx="${x - 8}" cy="${y - 9}" r="3" fill="${palette.accent2}" opacity="0.55"/>`;
    }
  }
  output += `<path d="M 512 452 L 512 818" stroke="${palette.metal}" stroke-width="24" opacity="0.9"/>`;
  output += `<path d="M 294 548 L 718 548" stroke="${palette.metal}" stroke-width="18" opacity="0.9"/>`;
  output += `<path d="M 512 500 C 466 456, 452 518, 496 530 C 468 556, 516 588, 528 548 C 554 588, 600 546, 562 528 C 598 492, 550 470, 512 500 Z" fill="${palette.metal}"/>`;
  output += `<rect x="584" y="720" width="82" height="48" rx="6" fill="${palette.accent2}" opacity="0.9"/>`;
  output += `<path d="M 598 738 L 650 738 M 598 752 L 632 752" stroke="${palette.deep}" stroke-width="4" opacity="0.4" stroke-linecap="round"/>`;
  output += sparkle(306, 402, 11, palette.metal);
  output += "</g>";
  return output;
}

function renderDates(palette) {
  let output = `<g>`;
  output += shadowOpen();
  output += `<path d="M 288 478 L 736 478 L 712 820 L 312 820 Z" fill="${palette.deep}"/>`;
  output += `<path d="M 314 502 L 710 502 L 688 792 L 336 792 Z" fill="${palette.paper}"/>`;
  output += `<path d="M 314 502 L 710 502 L 696 552 L 328 552 Z" fill="${palette.soft}" opacity="0.7"/>`;
  output += `</g>`;
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const x = 390 + column * 82;
      const y = 598 + row * 62;
      if ((row + column) % 2 === 0) {
        output += `<ellipse cx="${x}" cy="${y}" rx="24" ry="17" fill="${palette.accent}" transform="rotate(-16 ${x} ${y})"/>`;
        output += `<path d="M ${x - 14} ${y - 8} Q ${x} ${y - 17} ${x + 14} ${y - 8}" fill="none" stroke="${palette.accent2}" stroke-width="3" opacity="0.6"/>`;
      } else {
        output += `<rect x="${x - 22}" y="${y - 18}" width="44" height="36" rx="6" fill="${palette.deep}" transform="rotate(${(row + column) * 4} ${x} ${y})"/>`;
        output += `<path d="M ${x - 14} ${y - 6} Q ${x} ${y + 6} ${x + 14} ${y - 6}" fill="none" stroke="${palette.metal}" stroke-width="3" opacity="0.55"/>`;
      }
    }
  }
  output += `<path d="M 512 480 L 512 810" stroke="${palette.metal}" stroke-width="20" opacity="0.85"/>`;
  output += `<path d="M 324 568 L 700 568" stroke="${palette.metal}" stroke-width="16" opacity="0.85"/>`;
  output += `<path d="M 512 520 C 472 486, 462 536, 500 546 C 480 568, 522 592, 530 558 C 552 586, 590 552, 558 540 C 586 510, 546 494, 512 520 Z" fill="${palette.metal}"/>`;
  output += `<path d="M 640 694 Q 694 650 738 694 Q 694 738 640 694 Z" fill="${palette.green}" opacity="0.9"/>`;
  output += `<path d="M 640 694 L 738 694" stroke="${palette.deep}" stroke-width="4" opacity="0.35"/>`;
  output += sparkle(306, 424, 10, palette.metal);
  output += "</g>";
  return output;
}

function renderBaklava(palette) {
  let output = `<g>`;
  output += shadowOpen();
  output += `<ellipse cx="512" cy="698" rx="282" ry="88" fill="${palette.metal}" opacity="0.28"/>`;
  output += `<path d="M 248 620 L 776 620 L 734 798 Q 512 858 290 798 Z" fill="${palette.metal}" stroke="${palette.deep}" stroke-opacity="0.15" stroke-width="6"/>`;
  output += `<path d="M 274 644 L 750 644 L 716 780 Q 512 828 308 780 Z" fill="${palette.accent2}" opacity="0.55"/>`;
  output += `<path d="M 248 620 Q 214 620 202 650 M 776 620 Q 810 620 822 650" fill="none" stroke="${palette.metal}" stroke-width="18" stroke-linecap="round"/>`;
  output += `</g>`;
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const x = 382 + column * 90;
      const y = 584 + row * 62;
      output += `<g transform="translate(${x} ${y}) rotate(45)">`;
      output += `<rect x="-38" y="-38" width="76" height="76" rx="7" fill="${palette.accent}"/>`;
      output += `<rect x="-33" y="-33" width="66" height="66" rx="5" fill="${palette.accent2}" opacity="0.75"/>`;
      output += `<rect x="-26" y="-26" width="52" height="52" rx="4" fill="${palette.paper}" opacity="0.18"/>`;
      output += `<circle cx="-12" cy="-10" r="4" fill="${palette.green}" opacity="0.85"/>`;
      output += `<circle cx="10" cy="9" r="3" fill="${palette.green}" opacity="0.7"/>`;
      output += `<circle cx="14" cy="-12" r="2.5" fill="${palette.green}" opacity="0.7"/>`;
      output += `</g>`;
    }
  }
  output += `<path d="M 338 676 L 686 676 M 356 736 L 668 736" stroke="${palette.paper}" stroke-width="5" opacity="0.22" stroke-dasharray="12 14"/>`;
  output += `<g transform="translate(710 478)"><ellipse cx="0" cy="34" rx="58" ry="17" fill="${palette.deep}" opacity="0.14"/><path d="M -48 -6 Q 0 24 48 -6 L 38 38 Q 0 60 -38 38 Z" fill="${palette.metal}" stroke="${palette.deep}" stroke-opacity="0.14" stroke-width="4"/><ellipse cx="0" cy="-8" rx="46" ry="17" fill="${palette.paper}"/><ellipse cx="0" cy="-12" rx="35" ry="11" fill="${palette.green}" opacity="0.72"/><circle cx="-16" cy="-14" r="5" fill="${palette.paper}" opacity="0.65"/><circle cx="9" cy="-9" r="4" fill="${palette.paper}" opacity="0.6"/><circle cx="18" cy="-17" r="3" fill="${palette.paper}" opacity="0.55"/></g>`;
  output += `<g transform="translate(320 466)"><path d="M 0 74 L 0 0" stroke="${palette.green}" stroke-width="6"/><path d="M 0 18 Q -38 8 -52 34 Q -18 48 0 26 M 0 38 Q 38 28 52 54 Q 18 68 0 46" fill="${palette.green}" opacity="0.9"/><circle cx="-34" cy="26" r="5" fill="${palette.metal}" opacity="0.8"/><circle cx="38" cy="43" r="4" fill="${palette.metal}" opacity="0.7"/></g>`;
  output += sparkle(294, 540, 10, palette.paper);
  output += "</g>";
  return output;
}

function renderLavaCake(palette) {
  let output = `<g>`;
  output += shadowOpen();
  output += `<ellipse cx="512" cy="790" rx="268" ry="48" fill="${palette.deep}" opacity="0.12"/>`;
  output += `<ellipse cx="512" cy="764" rx="234" ry="70" fill="${palette.paper}" stroke="${palette.deep}" stroke-opacity="0.1" stroke-width="5"/>`;
  output += `<ellipse cx="512" cy="758" rx="178" ry="46" fill="${palette.soft}" opacity="0.75"/>`;
  output += `<path d="M 404 694 Q 404 640 458 640 L 566 640 Q 620 640 620 694 L 620 752 Q 512 798 404 752 Z" fill="${palette.accent}"/>`;
  output += `<path d="M 404 694 Q 512 736 620 694 L 620 712 Q 512 758 404 712 Z" fill="${palette.deep}" opacity="0.55"/>`;
  output += `<path d="M 458 646 Q 512 676 566 646 L 558 704 Q 512 724 466 704 Z" fill="${palette.accent2}" opacity="0.55"/>`;
  output += `<path d="M 476 694 Q 486 750 470 782 Q 512 796 554 782 Q 540 748 550 698 Q 512 720 476 694 Z" fill="${palette.deep}" opacity="0.92"/>`;
  output += `<ellipse cx="512" cy="648" rx="58" ry="18" fill="${palette.paper}" opacity="0.2"/>`;
  output += `<path d="M 512 642 Q 530 610 560 622 Q 548 646 512 642 Z" fill="${palette.green}" opacity="0.8"/>`;
  output += `<circle cx="616" cy="720" r="28" fill="${palette.paper}"/>`;
  output += `<circle cx="630" cy="708" r="24" fill="${palette.soft}" opacity="0.65"/>`;
  output += `</g>`;
  output += `<g transform="translate(708 590)">`;
  output += `<rect x="-54" y="-74" width="108" height="126" rx="18" fill="${palette.paper}" stroke="${palette.deep}" stroke-opacity="0.15" stroke-width="5"/>`;
  output += `<rect x="-38" y="-50" width="76" height="68" rx="10" fill="${palette.accent}" opacity="0.9"/>`;
  output += `<path d="M -26 -26 L 26 -26 M -26 -8 L 12 -8" stroke="${palette.paper}" stroke-width="4" opacity="0.35" stroke-linecap="round"/>`;
  output += `<path d="M -38 -64 L 38 -64 L 28 -88 L -28 -88 Z" fill="${palette.metal}"/>`;
  output += `</g>`;
  output += `<g transform="translate(322 624)"><rect x="-46" y="-58" width="92" height="116" rx="12" fill="${palette.paper}" stroke="${palette.deep}" stroke-opacity="0.12" stroke-width="4"/><path d="M -28 -30 L 28 -30 M -28 -12 L 12 -12 M -28 6 L 24 6" stroke="${palette.deep}" stroke-width="4" opacity="0.28" stroke-linecap="round"/><rect x="-24" y="26" width="48" height="22" rx="5" fill="${palette.metal}" opacity="0.8"/></g>`;
  output += `<path d="M 400 610 Q 444 584 482 610" fill="none" stroke="${palette.green}" stroke-width="5" opacity="0.6"/>`;
  output += "</g>";
  return output;
}

function renderTower(palette) {
  let output = `<g>`;
  output += shadowOpen();
  output += `<ellipse cx="512" cy="806" rx="238" ry="34" fill="${palette.deep}" opacity="0.14"/>`;
  const tiers = [
    [332, 700, 360, 78, palette.deep],
    [370, 580, 284, 76, palette.accent],
    [408, 468, 208, 72, palette.paper],
  ];
  for (const [x, y, width, height, fill] of tiers) {
    output += `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" fill="${fill}" stroke="${palette.deep}" stroke-opacity="0.16" stroke-width="4"/>`;
    output += `<rect x="${x + 26}" y="${y + 14}" width="${width - 52}" height="8" rx="4" fill="${palette.metal}" opacity="0.55"/>`;
    output += `<rect x="${x + width / 2 - 12}" y="${y}" width="24" height="${height}" fill="${palette.metal}" opacity="0.9"/>`;
  }
  for (const [x, y] of [[460, 448], [512, 430], [564, 448], [486, 410], [538, 410]]) {
    output += `<circle cx="${x}" cy="${y}" r="16" fill="${palette.deep}"/>`;
    output += `<circle cx="${x - 5}" cy="${y - 5}" r="4" fill="${palette.accent2}" opacity="0.55"/>`;
  }
  output += `<path d="M 512 458 C 468 414, 452 476, 496 488 C 466 514, 516 548, 528 508 C 554 548, 600 504, 562 486 C 596 450, 550 430, 512 458 Z" fill="${palette.metal}"/>`;
  output += `<path d="M 512 390 L 512 330" stroke="${palette.metal}" stroke-width="8"/>`;
  output += `<path d="M 476 330 L 548 330 L 532 300 L 492 300 Z" fill="${palette.accent2}"/>`;
  output += sparkle(300, 516, 10, palette.metal);
  output += sparkle(724, 548, 8, palette.metal);
  output += "</g>";
  return output;
}

function renderBonbons(palette) {
  let output = `<g>`;
  output += shadowOpen();
  output += `<path d="M 356 414 L 668 414 L 704 806 Q 512 858 320 806 Z" fill="${palette.paper}"/>`;
  output += `<path d="M 356 414 L 668 414 L 672 470 L 352 470 Z" fill="${palette.accent}" opacity="0.85"/>`;
  output += `<path d="M 402 508 L 622 508 L 642 748 Q 512 786 382 748 Z" fill="${palette.soft}" opacity="0.8"/>`;
  output += `<path d="M 408 512 L 616 512 L 636 744 Q 512 778 388 744 Z" fill="${palette.paper}" stroke="${palette.deep}" stroke-opacity="0.12" stroke-width="4"/>`;
  output += `<path d="M 398 390 Q 512 282 626 390" fill="none" stroke="${palette.metal}" stroke-width="14" stroke-linecap="round"/>`;
  output += `<path d="M 512 414 L 512 474" stroke="${palette.metal}" stroke-width="10"/>`;
  output += `<path d="M 512 474 L 484 514 L 512 500 L 540 514 Z" fill="${palette.accent}"/>`;
  output += `</g>`;
  const colors = [palette.accent, palette.accent2, palette.metal, palette.green, "#d88f8b", "#8a6c9a"];
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const x = 430 + column * 82;
      const y = 560 + row * 48;
      const color = colors[(row + column) % colors.length];
      output += `<circle cx="${x}" cy="${y}" r="23" fill="${color}"/>`;
      output += `<circle cx="${x - 7}" cy="${y - 7}" r="6" fill="${palette.paper}" opacity="0.35"/>`;
    }
  }
  output += `<path d="M 370 470 Q 512 514 654 470" fill="none" stroke="${palette.accent}" stroke-width="8" opacity="0.7"/>`;
  output += `<g transform="translate(300 768) rotate(-14)"><rect x="-26" y="-16" width="52" height="32" rx="16" fill="${palette.accent2}"/><path d="M -26 0 L -46 -12 L -46 12 Z M 26 0 L 46 -12 L 46 12 Z" fill="${palette.accent2}" opacity="0.8"/></g>`;
  output += `<g transform="translate(724 748) rotate(18)"><rect x="-24" y="-14" width="48" height="28" rx="14" fill="${palette.green}"/><path d="M -24 0 L -42 -10 L -42 10 Z M 24 0 L 42 -10 L 42 10 Z" fill="${palette.green}" opacity="0.8"/></g>`;
  output += sparkle(336, 520, 10, palette.metal);
  output += "</g>";
  return output;
}

function woodGrain(palette, startX, endX, startY, endY, lines = 6) {
  let output = "";
  for (let index = 0; index < lines; index += 1) {
    const y = startY + ((endY - startY) / (lines + 1)) * (index + 1);
    output += `<path d="M ${startX} ${y} Q ${(startX + endX) / 2} ${y - 8} ${endX} ${y} " fill="none" stroke="${palette.deep}" stroke-width="3" opacity="0.12"/>`;
  }
  return output;
}

function renderWalnutBox(palette) {
  let output = `<g>`;
  output += shadowOpen();
  output += `<rect x="298" y="450" width="428" height="340" rx="22" fill="${palette.wood}"/>`;
  output += `<rect x="322" y="490" width="380" height="274" rx="14" fill="${palette.accent}"/>`;
  output += `<rect x="322" y="490" width="380" height="58" rx="14" fill="${palette.deep}" opacity="0.28"/>`;
  output += woodGrain(palette, 330, 694, 510, 746, 5);
  output += `<rect x="286" y="404" width="452" height="76" rx="18" fill="${palette.wood}" stroke="${palette.deep}" stroke-opacity="0.18" stroke-width="4"/>`;
  output += `<ellipse cx="512" cy="520" rx="82" ry="40" fill="none" stroke="${palette.metal}" stroke-width="5" opacity="0.9"/>`;
  output += `<text x="512" y="536" text-anchor="middle" font-family="Georgia, serif" font-size="52" font-style="italic" fill="${palette.metal}">G</text>`;
  output += `<rect x="348" y="602" width="74" height="24" rx="6" fill="${palette.metal}" opacity="0.8"/>`;
  output += `<rect x="602" y="602" width="74" height="24" rx="6" fill="${palette.metal}" opacity="0.8"/>`;
  output += `<path d="M 512 404 L 512 362" stroke="${palette.metal}" stroke-width="10" stroke-linecap="round"/>`;
  output += `<circle cx="512" cy="352" r="14" fill="${palette.metal}"/>`;
  output += `<rect x="478" y="690" width="68" height="18" rx="8" fill="${palette.deep}" opacity="0.45"/>`;
  output += `</g>`;
  output += `<g transform="translate(754 620) rotate(6)"><rect x="-58" y="-80" width="116" height="160" rx="8" fill="${palette.paper}" stroke="${palette.deep}" stroke-opacity="0.12" stroke-width="4"/><path d="M -36 -44 L 36 -44 M -36 -18 L 18 -18 M -36 8 L 30 8" stroke="${palette.deep}" stroke-width="5" opacity="0.25" stroke-linecap="round"/><circle cx="0" cy="54" r="16" fill="${palette.accent2}" opacity="0.7"/></g>`;
  output += sparkle(318, 394, 11, palette.metal);
  output += "</g>";
  return output;
}

function renderJournal(palette) {
  let output = `<g>`;
  output += shadowOpen();
  output += `<path d="M 320 300 Q 512 264 704 300 L 690 782 Q 512 818 334 782 Z" fill="${palette.accent}"/>`;
  output += `<path d="M 320 300 Q 512 264 704 300 L 702 344 Q 512 310 322 344 Z" fill="${palette.deep}" opacity="0.3"/>`;
  output += `<rect x="350" y="348" width="20" height="402" rx="10" fill="${palette.deep}" opacity="0.28"/>`;
  output += `<rect x="584" y="392" width="68" height="88" rx="8" fill="${palette.paper}" opacity="0.82"/>`;
  for (let index = 0; index < 4; index += 1) {
    output += `<rect x="598" y="${412 + index * 15}" width="40" height="4" rx="2" fill="${palette.deep}" opacity="0.34"/>`;
  }
  output += `<circle cx="478" cy="580" r="72" fill="none" stroke="${palette.metal}" stroke-width="5" opacity="0.9"/>`;
  output += `<circle cx="478" cy="580" r="52" fill="none" stroke="${palette.metal}" stroke-width="2" opacity="0.5"/>`;
  output += `<text x="478" y="600" text-anchor="middle" font-family="Georgia, serif" font-size="64" font-style="italic" fill="${palette.metal}">G</text>`;
  output += `<path d="M 646 704 L 676 704 L 676 752 L 646 752 Z" fill="${palette.metal}" opacity="0.8"/>`;
  output += `<path d="M 650 710 L 672 710" stroke="${palette.deep}" stroke-width="3" opacity="0.3"/>`;
  output += `</g>`;
  output += `<path d="M 700 380 Q 758 468 706 592" fill="none" stroke="${palette.metal}" stroke-width="12" opacity="0.8"/>`;
  output += `<path d="M 704 592 L 728 620 L 720 582 Z" fill="${palette.metal}"/>`;
  output += sparkle(360, 324, 9, palette.metal);
  output += "</g>";
  return output;
}

function renderPhotoFrame(palette) {
  let output = `<g>`;
  output += shadowOpen();
  output += `<rect x="288" y="306" width="448" height="522" rx="18" fill="${palette.wood}"/>`;
  output += `<rect x="322" y="340" width="380" height="454" rx="8" fill="${palette.paper}"/>`;
  output += `<rect x="350" y="368" width="324" height="334" rx="6" fill="${palette.soft}"/>`;
  output += `<circle cx="512" cy="492" r="54" fill="${palette.accent2}" opacity="0.7"/>`;
  output += `<path d="M 390 674 Q 512 520 634 674 Z" fill="${palette.accent}" opacity="0.55"/>`;
  output += `<path d="M 426 460 Q 512 384 598 460" fill="none" stroke="${palette.paper}" stroke-width="5" opacity="0.6"/>`;
  output += `<rect x="376" y="714" width="272" height="50" rx="8" fill="${palette.wood}" stroke="${palette.deep}" stroke-opacity="0.18" stroke-width="3"/>`;
  output += `<text x="512" y="748" text-anchor="middle" font-family="Georgia, serif" font-size="24" letter-spacing="5" fill="${palette.metal}">FAMILY</text>`;
  output += `<path d="M 512 306 L 512 266" stroke="${palette.metal}" stroke-width="8"/>`;
  output += `<path d="M 476 266 L 548 266 L 532 238 L 492 238 Z" fill="${palette.accent2}"/>`;
  output += `</g>`;
  output += leaf(728, 760, 58, 16, 36, palette.green, 0.7);
  output += leaf(760, 732, 44, 13, 58, palette.green, 0.55);
  output += sparkle(300, 360, 10, palette.metal);
  output += "</g>";
  return output;
}

function renderPenSet(palette) {
  let output = `<g>`;
  output += shadowOpen();
  output += `<path d="M 274 498 L 750 498 L 724 806 L 300 806 Z" fill="${palette.deep}"/>`;
  output += `<path d="M 302 526 L 722 526 L 700 778 L 324 778 Z" fill="${palette.paper}"/>`;
  output += `<path d="M 302 526 L 722 526 L 714 576 L 310 576 Z" fill="${palette.soft}" opacity="0.6"/>`;
  output += `</g>`;
  output += `<g transform="translate(470 626) rotate(-6)">`;
  output += `<rect x="-96" y="-98" width="192" height="210" rx="8" fill="${palette.paper}" stroke="${palette.deep}" stroke-opacity="0.12" stroke-width="4"/>`;
  output += `<path d="M -64 -56 L 64 -56 M -64 -28 L 20 -28 M -64 0 L 48 0" stroke="${palette.deep}" stroke-width="5" opacity="0.3" stroke-linecap="round"/>`;
  output += `<circle cx="0" cy="62" r="30" fill="none" stroke="${palette.metal}" stroke-width="4"/>`;
  output += `<text x="0" y="73" text-anchor="middle" font-family="Georgia, serif" font-size="34" font-style="italic" fill="${palette.metal}">G</text>`;
  output += `</g>`;
  output += `<g transform="translate(640 580) rotate(28)">`;
  output += `<rect x="-16" y="-126" width="32" height="236" rx="14" fill="${palette.metal}"/>`;
  output += `<rect x="-16" y="110" width="32" height="40" rx="8" fill="${palette.deep}"/>`;
  output += `<path d="M -10 -168 L 0 -206 L 10 -168 Z" fill="${palette.metal}"/>`;
  output += `<path d="M -4 -168 L 0 -196 L 4 -168 Z" fill="${palette.deep}"/>`;
  output += `</g>`;
  output += `<g transform="translate(370 690) rotate(-18)">`;
  output += `<rect x="-78" y="-50" width="156" height="100" rx="6" fill="${palette.soft}" stroke="${palette.deep}" stroke-opacity="0.12" stroke-width="4"/>`;
  output += `<path d="M -78 -50 L 0 16 L 78 -50" fill="none" stroke="${palette.deep}" stroke-width="5" opacity="0.28"/>`;
  output += `<circle cx="0" cy="12" r="10" fill="${palette.accent2}" opacity="0.8"/>`;
  output += `</g>`;
  output += sparkle(314, 468, 10, palette.metal);
  output += "</g>";
  return output;
}

function renderNameToy(palette) {
  let output = `<g>`;
  output += shadowOpen();
  output += `<rect x="252" y="430" width="520" height="250" rx="30" fill="${palette.wood}"/>`;
  output += `<rect x="282" y="460" width="460" height="190" rx="20" fill="${palette.paper}" opacity="0.28"/>`;
  output += woodGrain(palette, 300, 724, 480, 630, 5);
  output += `</g>`;
  const letters = [
    ["L", "#d68c71"],
    ["I", "#7fa1a0"],
    ["L", "#d7b15f"],
    ["Y", "#9b87b0"],
  ];
  const colors = palette;
  letters.forEach(([letter, color], index) => {
    const x = 348 + index * 88;
    output += `<g transform="translate(${x} 552) rotate(${index % 2 ? 2 : -2})">`;
    output += `<rect x="-34" y="-62" width="68" height="124" rx="14" fill="${color}" stroke="${colors.deep}" stroke-opacity="0.15" stroke-width="3"/>`;
    output += `<text x="0" y="20" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="66" fill="${colors.paper}">${letter}</text>`;
    output += `</g>`;
  });
  output += `<g transform="translate(716 456) rotate(12)"><path d="M 0 -28 L 8 -8 L 30 0 L 8 8 L 0 28 L -8 8 L -30 0 L -8 -8 Z" fill="${palette.metal}"/></g>`;
  output += `<g transform="translate(310 716)"><path d="M 0 0 C -22 -20, -50 4, -24 24 L 0 46 L 24 24 C 50 4, 22 -20, 0 0 Z" fill="${palette.accent}"/></g>`;
  output += `<rect x="288" y="742" width="448" height="28" rx="14" fill="${palette.wood}" opacity="0.85"/>`;
  output += `<ellipse cx="512" cy="786" rx="238" ry="24" fill="${palette.deep}" opacity="0.12"/>`;
  output += sparkle(300, 360, 10, palette.metal);
  output += "</g>";
  return output;
}

function renderCompass(palette) {
  let output = `<g>`;
  output += shadowOpen();
  output += `<g transform="translate(512 586)">`;
  output += `<circle r="256" fill="${palette.metal}" stroke="${palette.deep}" stroke-opacity="0.18" stroke-width="8"/>`;
  output += `<circle r="222" fill="${palette.soft}" stroke="${palette.deep}" stroke-opacity="0.12" stroke-width="5"/>`;
  output += `<circle r="186" fill="${palette.paper}" stroke="${palette.deep}" stroke-opacity="0.15" stroke-width="4"/>`;
  for (let index = 0; index < 72; index += 1) {
    const angle = (Math.PI * 2 * index) / 72;
    const outer = 216;
    const inner = index % 18 === 0 ? 178 : index % 6 === 0 ? 192 : 204;
    output += `<path d="M ${Math.cos(angle) * inner} ${Math.sin(angle) * inner} L ${Math.cos(angle) * outer} ${Math.sin(angle) * outer}" stroke="${palette.deep}" stroke-width="${index % 18 === 0 ? 5 : 2}" opacity="0.45"/>`;
  }
  output += `<text x="0" y="-120" text-anchor="middle" font-family="Georgia, serif" font-size="48" fill="${palette.deep}">N</text>`;
  output += `<text x="142" y="16" text-anchor="middle" font-family="Georgia, serif" font-size="38" fill="${palette.deep}" opacity="0.8">E</text>`;
  output += `<text x="0" y="150" text-anchor="middle" font-family="Georgia, serif" font-size="38" fill="${palette.deep}" opacity="0.8">S</text>`;
  output += `<text x="-142" y="16" text-anchor="middle" font-family="Georgia, serif" font-size="38" fill="${palette.deep}" opacity="0.8">W</text>`;
  output += `<path d="M 0 -156 L 22 0 L 0 156 L -22 0 Z" fill="${palette.accent}" opacity="0.9"/>`;
  output += `<path d="M 0 156 L 22 0 L -22 0 Z" fill="${palette.deep}" opacity="0.8"/>`;
  output += `<circle r="22" fill="${palette.metal}" stroke="${palette.deep}" stroke-opacity="0.2" stroke-width="4"/>`;
  output += `<circle r="8" fill="${palette.deep}" opacity="0.6"/>`;
  output += `<text x="0" y="118" text-anchor="middle" font-family="Georgia, serif" font-size="17" letter-spacing="4" fill="${palette.deep}" opacity="0.55">EXPLORE</text>`;
  output += `</g>`;
  output += `<path d="M 726 390 Q 824 512 744 664" fill="none" stroke="${palette.wood}" stroke-width="24" opacity="0.72"/>`;
  output += `<path d="M 738 680 L 752 722 L 720 704 Z" fill="${palette.metal}"/>`;
  output += `</g>`;
  output += `<g transform="translate(286 362) rotate(-18)"><rect x="-84" y="-48" width="168" height="96" rx="12" fill="${palette.deep}" opacity="0.18"/><rect x="-78" y="-42" width="156" height="84" rx="10" fill="${palette.paper}" opacity="0.9"/><text x="0" y="10" text-anchor="middle" font-family="Georgia, serif" font-size="22" letter-spacing="3" fill="${palette.metal}">GIFTO</text></g>`;
  output += sparkle(774, 336, 12, palette.metal);
  output += "</g>";
  return output;
}

const RENDERERS = {
  roses: renderRoses,
  lilies: renderLilies,
  sunflowers: renderSunflowers,
  peonies: renderPeonies,
  pampas: renderPampas,
  graduation: renderGraduation,
  truffles: renderTruffles,
  dates: renderDates,
  baklava: renderBaklava,
  "lava-cake": renderLavaCake,
  tower: renderTower,
  bonbons: renderBonbons,
  "walnut-box": renderWalnutBox,
  journal: renderJournal,
  "photo-frame": renderPhotoFrame,
  "pen-set": renderPenSet,
  "name-toy": renderNameToy,
  compass: renderCompass,
};

function defs(palette) {
  return `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${palette.bg1}"/>
        <stop offset="1" stop-color="${palette.bg2}"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="40%" r="54%">
        <stop offset="0" stop-color="${palette.glow}" stop-opacity="0.92"/>
        <stop offset="1" stop-color="${palette.glow}" stop-opacity="0"/>
      </radialGradient>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="180%">
        <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="${palette.deep}" flood-opacity="0.2"/>
      </filter>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.74" numOctaves="3" seed="11"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
    </defs>
  `;
}

function background(palette) {
  return `
    <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
    <circle cx="512" cy="430" r="450" fill="url(#glow)" opacity="0.9"/>
    <path d="M 194 876 L 194 452 C 194 274 334 146 512 146 C 690 146 830 274 830 452 L 830 876 Z" fill="${palette.arch}" opacity="0.3"/>
    <path d="M 194 876 L 194 452 C 194 274 334 146 512 146 C 690 146 830 274 830 452 L 830 876" fill="none" stroke="${palette.paper}" stroke-width="3" opacity="0.45"/>
    <ellipse cx="512" cy="792" rx="294" ry="62" fill="${palette.deep}" opacity="0.06"/>
    <rect x="40" y="40" width="944" height="944" rx="2" fill="none" stroke="${palette.deep}" stroke-width="2" opacity="0.14"/>
    <rect x="56" y="56" width="912" height="912" rx="2" fill="none" stroke="${palette.paper}" stroke-width="2" opacity="0.38"/>
    <circle cx="104" cy="104" r="8" fill="${palette.metal}" opacity="0.5"/>
    <circle cx="920" cy="104" r="8" fill="${palette.metal}" opacity="0.5"/>
    <circle cx="104" cy="920" r="8" fill="${palette.metal}" opacity="0.5"/>
    <circle cx="920" cy="920" r="8" fill="${palette.metal}" opacity="0.5"/>
  `;
}

function renderSvg(product) {
  const palette = THEMES[product.theme];
  if (!palette) throw new Error(`Unknown theme: ${product.theme}`);
  const render = RENDERERS[product.kind];
  if (!render) throw new Error(`Unknown kind: ${product.kind}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
    ${defs(palette)}
    ${background(palette)}
    ${render(palette)}
    <rect width="${SIZE}" height="${SIZE}" filter="url(#grain)" opacity="0.035"/>
    <path d="M 106 894 L 918 894" stroke="${palette.deep}" stroke-width="2" opacity="0.16"/>
  </svg>`;
}

async function main() {
  await mkdir(IMAGE_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
    for (const product of PRODUCTS) {
      const target = path.join(IMAGE_DIR, product.file);
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${SIZE}px;height:${SIZE}px;overflow:hidden;background:#f4eadc}svg{display:block}</style></head><body>${renderSvg(product)}</body></html>`;
      await page.setContent(html, { waitUntil: "load" });
      await page.screenshot({ path: target, type: "jpeg", quality: 92 });
      const size = (await readFile(target)).length;
      if (size < 12_000) throw new Error(`Generated image is unexpectedly small: ${target} (${size} bytes)`);
      console.log(`${product.slug} ${product.file} ${Math.round(size / 1024)} KiB`);
    }
  } finally {
    await browser.close();
  }

  const manifest = {
    datasetId: "gifto-demo-catalog-previous-refresh",
    version: 1,
    imagePolicy:
      "Original Gifto artwork generated for the pre-existing demo products; no third-party image assets.",
    products: PRODUCTS,
  };
  await writeFile(path.join(DATA_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Generated and checked ${PRODUCTS.length} JPEG images`);
}

main().catch((error) => {
  console.error(`Preview artwork generation failed: ${error.message}`);
  process.exit(1);
});
