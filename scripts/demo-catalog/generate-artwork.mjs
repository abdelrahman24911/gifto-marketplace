#!/usr/bin/env node
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const DATA_DIR = path.join(ROOT, "data/demo-catalog");
const IMAGE_DIR = path.join(DATA_DIR, "images");
const SIZE = 1024;

const THEMES = [
  {
    bg1: "#f8ede2",
    bg2: "#ead2c1",
    glow: "#fff9f1",
    arch: "#d8b39f",
    accent: "#a94f45",
    accent2: "#d58a68",
    soft: "#f4d9d0",
    deep: "#5f3b35",
    paper: "#f8ecdd",
    wood: "#b98d69",
    metal: "#c6a15b",
    green: "#718260",
  },
  {
    bg1: "#f4ead7",
    bg2: "#e4caa8",
    glow: "#fffaf0",
    arch: "#cfae86",
    accent: "#c47b56",
    accent2: "#e6b88f",
    soft: "#f5ddc4",
    deep: "#69463a",
    paper: "#fbf2e3",
    wood: "#b8865c",
    metal: "#c8a461",
    green: "#7b855b",
  },
  {
    bg1: "#eef0e3",
    bg2: "#d5ddc7",
    glow: "#fbfcf4",
    arch: "#b8c4a7",
    accent: "#7c8d61",
    accent2: "#b5bd8c",
    soft: "#e3e7d2",
    deep: "#445140",
    paper: "#f6f4e7",
    wood: "#ad8a64",
    metal: "#b99b62",
    green: "#657957",
  },
  {
    bg1: "#efe3d5",
    bg2: "#d6bfa8",
    glow: "#fbf4ea",
    arch: "#b89273",
    accent: "#754b36",
    accent2: "#ad7b58",
    soft: "#dfc9b2",
    deep: "#493127",
    paper: "#f5eadb",
    wood: "#8d674a",
    metal: "#b7925b",
    green: "#68725a",
  },
  {
    bg1: "#f5efdf",
    bg2: "#dfd0ae",
    glow: "#fffdf4",
    arch: "#c8b78d",
    accent: "#9c7a3e",
    accent2: "#c7a45f",
    soft: "#ece2c7",
    deep: "#4f432f",
    paper: "#fbf7ea",
    wood: "#a47c51",
    metal: "#b89552",
    green: "#788061",
  },
  {
    bg1: "#f2e8e8",
    bg2: "#ddc7cb",
    glow: "#fff8f6",
    arch: "#c9aeb5",
    accent: "#8c5360",
    accent2: "#be8791",
    soft: "#e8d3d7",
    deep: "#4c343a",
    paper: "#faf1ef",
    wood: "#a87c68",
    metal: "#b9955f",
    green: "#697560",
  },
  {
    bg1: "#e8eff2",
    bg2: "#cddce1",
    glow: "#f8fcfd",
    arch: "#afc4cc",
    accent: "#587b87",
    accent2: "#8db0b9",
    soft: "#d8e5e8",
    deep: "#354d55",
    paper: "#f4f7f4",
    wood: "#b18a65",
    metal: "#c0a267",
    green: "#72866a",
  },
  {
    bg1: "#eff0e2",
    bg2: "#d5d8bd",
    glow: "#fcfcf4",
    arch: "#b7be98",
    accent: "#6d7a4e",
    accent2: "#a8b27b",
    soft: "#e4e6d0",
    deep: "#41482f",
    paper: "#f8f6eb",
    wood: "#a6815c",
    metal: "#b99d63",
    green: "#5e7350",
  },
  {
    bg1: "#f7eddb",
    bg2: "#e4cfaa",
    glow: "#fffaf0",
    arch: "#ceb283",
    accent: "#a66f2e",
    accent2: "#d7a95d",
    soft: "#f1dfc0",
    deep: "#5a4125",
    paper: "#fbf4e6",
    wood: "#a57a4e",
    metal: "#c4a05b",
    green: "#747b58",
  },
  {
    bg1: "#f5e9df",
    bg2: "#dfc8b9",
    glow: "#fff9f4",
    arch: "#c7a894",
    accent: "#a65f48",
    accent2: "#d18e72",
    soft: "#eddbd0",
    deep: "#553a30",
    paper: "#fbf1e7",
    wood: "#9f7656",
    metal: "#b99a61",
    green: "#6e765c",
  },
  {
    bg1: "#e9f0e8",
    bg2: "#cfddcb",
    glow: "#f8fcf6",
    arch: "#afc4aa",
    accent: "#5f7b61",
    accent2: "#95b18d",
    soft: "#dce8d8",
    deep: "#354937",
    paper: "#f5f8f1",
    wood: "#aa8561",
    metal: "#bfa166",
    green: "#597252",
  },
  {
    bg1: "#f0eaf1",
    bg2: "#d9cddd",
    glow: "#fbf8fd",
    arch: "#c2b1c8",
    accent: "#796185",
    accent2: "#ac91b5",
    soft: "#e6dbe9",
    deep: "#46374d",
    paper: "#f8f3f9",
    wood: "#a57c66",
    metal: "#b99b65",
    green: "#69735d",
  },
];

const COLLECTION_OFFSET = {
  Flowers: 0,
  "Chocolates & Sweets": 3,
  "Personalized Gifts": 4,
  "Gift Boxes": 5,
  "Perfumes & Accessories": 8,
  "Toys & Cute Gifts": 6,
  "Home & Lifestyle": 9,
};

function paletteFor(product) {
  const offset = COLLECTION_OFFSET[product.collection] ?? 0;
  return THEMES[(offset + product.image.variant) % THEMES.length];
}

function flower(cx, cy, radius, petal, center, petalCount = 8, rotation = 0, deep = "#5f3b35") {
  let output = `<g transform="translate(${cx} ${cy}) rotate(${rotation})">`;
  for (let index = 0; index < petalCount; index += 1) {
    const angle = (360 / petalCount) * index;
    output += `<ellipse cx="0" cy="${-radius * 0.55}" rx="${radius * 0.38}" ry="${radius * 0.62}" fill="${petal}" transform="rotate(${angle})" opacity="0.94"/>`;
  }
  output += `<circle r="${radius * 0.34}" fill="${center}"/>`;
  output += `<circle r="${radius * 0.2}" fill="${deep}" opacity="0.16"/>`;
  output += "</g>";
  return output;
}

function rose(cx, cy, radius, petal, center, rotation = 0) {
  return `<g transform="translate(${cx} ${cy}) rotate(${rotation})">
    <circle r="${radius}" fill="${petal}"/>
    <circle r="${radius * 0.78}" fill="${center}" opacity="0.22"/>
    <path d="M ${-radius * 0.5} ${radius * 0.1} C ${-radius * 0.45} ${-radius * 0.39}, ${radius * 0.42} ${-radius * 0.43}, ${radius * 0.38} ${radius * 0.1} C ${radius * 0.31} ${radius * 0.42}, ${-radius * 0.3} ${radius * 0.4}, ${-radius * 0.5} ${radius * 0.1}" fill="none" stroke="${center}" stroke-width="${radius * 0.09}" opacity="0.55"/>
    <path d="M ${-radius * 0.25} ${radius * 0.02} C ${-radius * 0.13} ${-radius * 0.25}, ${radius * 0.24} ${-radius * 0.2}, ${radius * 0.18} ${radius * 0.09} C ${radius * 0.1} ${radius * 0.29}, ${-radius * 0.16} ${radius * 0.24}, ${-radius * 0.25} ${radius * 0.02}" fill="none" stroke="${center}" stroke-width="${radius * 0.075}" opacity="0.48"/>
  </g>`;
}

function leaf(cx, cy, rx, ry, rotation, color) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${color}" transform="rotate(${rotation} ${cx} ${cy})" opacity="0.9"/>`;
}

function sparkle(cx, cy, size, color) {
  return `<path d="M ${cx} ${cy - size} L ${cx + size * 0.23} ${cy - size * 0.23} L ${cx + size} ${cy} L ${cx + size * 0.23} ${cy + size * 0.23} L ${cx} ${cy + size} L ${cx - size * 0.23} ${cy + size * 0.23} L ${cx - size} ${cy} L ${cx - size * 0.23} ${cy - size * 0.23} Z" fill="${color}" opacity="0.85"/>`;
}

function renderBouquet(palette, variant) {
  const positions = [
    [
      [385, 430, 70],
      [505, 350, 78],
      [625, 420, 66],
      [465, 500, 60],
      [590, 510, 56],
    ],
    [
      [360, 460, 62],
      [490, 370, 72],
      [625, 390, 58],
      [430, 535, 66],
      [575, 520, 73],
    ],
    [
      [390, 410, 64],
      [510, 330, 72],
      [630, 410, 68],
      [475, 490, 57],
      [605, 500, 62],
    ],
  ];
  const arrangement = positions[variant % positions.length];
  let output = `<g filter="url(#shadow)">`;

  for (const [x, y] of arrangement) {
    output += `<path d="M 512 700 Q ${(x + 512) / 2 + 20} ${(y + 700) / 2} ${x} ${y}" fill="none" stroke="${palette.green}" stroke-width="8" stroke-linecap="round" opacity="0.75"/>`;
    output += leaf(x + 42, y + 52, 25, 10, -35, palette.green);
    output += leaf(x - 42, y + 55, 22, 9, 38, palette.green);
    output += leaf(x + 10, y + 76, 28, 11, 85, palette.green);
  }

  if (variant === 2) {
    output += `<path d="M 420 650 L 604 650 L 620 792 Q 512 842 404 792 Z" fill="${palette.paper}" stroke="${palette.deep}" stroke-opacity="0.16" stroke-width="5"/>`;
    output += `<ellipse cx="512" cy="651" rx="92" ry="20" fill="${palette.soft}" opacity="0.7"/>`;
  } else if (variant === 4) {
    output += `<path d="M 398 625 Q 512 600 626 625 L 598 765 Q 512 812 426 765 Z" fill="${palette.arc}" stroke="${palette.deep}" stroke-opacity="0.16" stroke-width="5"/>`;
    output += `<ellipse cx="512" cy="627" rx="114" ry="24" fill="${palette.paper}" opacity="0.72"/>`;
  } else {
    output += `<path d="M 408 612 L 616 612 L 562 842 Q 512 866 462 842 Z" fill="${palette.wood}" opacity="0.9"/>`;
    output += `<path d="M 408 612 L 512 706 L 616 612 L 562 842 Q 512 866 462 842 Z" fill="${palette.paper}" opacity="0.36"/>`;
    output += `<path d="M 430 618 Q 512 670 594 618" fill="none" stroke="${palette.accent}" stroke-width="16" opacity="0.8"/>`;
  }

  const colors = [
    [palette.accent, palette.accent2],
    [palette.soft, palette.accent],
    [palette.paper, palette.accent2],
    [palette.accent2, palette.deep],
    [palette.accent, palette.paper],
  ];

  arrangement.forEach(([x, y, radius], index) => {
    const [petal] = colors[(index + variant) % colors.length];
    if (variant === 2) {
      output += `<path d="M ${x} ${y + radius * 0.5} Q ${x - radius * 0.7} ${y - radius * 0.7} ${x} ${y - radius * 1.15} Q ${x + radius * 0.75} ${y - radius * 0.55} ${x + radius * 0.3} ${y + radius * 0.55} Q ${x + radius * 0.05} ${y + radius * 0.9} ${x} ${y + radius * 0.5} Z" fill="${palette.paper}" stroke="${palette.accent2}" stroke-width="5"/>`;
      output += `<path d="M ${x} ${y + radius * 0.45} Q ${x - radius * 0.05} ${y - radius * 0.1} ${x + radius * 0.1} ${y - radius * 0.78}" fill="none" stroke="${palette.metal}" stroke-width="8" stroke-linecap="round"/>`;
    } else if (variant === 3) {
      output += `<g transform="translate(${x} ${y})">`;
      for (let petalIndex = 0; petalIndex < 12; petalIndex += 1) {
        output += `<ellipse cx="0" cy="${-radius * 0.62}" rx="${radius * 0.2}" ry="${radius * 0.5}" fill="${palette.metal}" transform="rotate(${petalIndex * 30})"/>`;
      }
      output += `<circle r="${radius * 0.42}" fill="${palette.deep}"/>`;
      output += `<circle r="${radius * 0.28}" fill="${palette.accent}" opacity="0.55"/>`;
      output += "</g>";
    } else if (variant === 1 || variant === 5) {
      output += flower(x, y, radius, petal, palette.metal, 10, index * 11, palette.deep);
      output += flower(x - radius * 0.22, y + radius * 0.18, radius * 0.55, palette.accent2, palette.metal, 7, -index * 9, palette.deep);
    } else {
      output += rose(x, y, radius, petal, palette.deep, index * 7);
    }
    output += leaf(x + radius * 0.65, y + radius * 0.62, radius * 0.36, radius * 0.17, 36, palette.green);
    output += leaf(x - radius * 0.58, y + radius * 0.7, radius * 0.3, radius * 0.14, -42, palette.green);
  });

  if (variant === 6) {
    output += `<path d="M 430 622 Q 512 670 594 622" fill="none" stroke="${palette.paper}" stroke-width="18" opacity="0.85"/>`;
    output += `<path d="M 512 662 L 482 720 L 512 704 L 542 720 Z" fill="${palette.paper}" opacity="0.9"/>`;
  }
  output += "</g>";
  return output;
}

function renderChocolate(palette, variant) {
  let output = `<g filter="url(#shadow)">`;
  if (variant === 6) {
    output += `<path d="M 300 470 L 724 470 L 700 782 L 324 782 Z" fill="${palette.deep}"/>`;
    output += `<path d="M 324 496 L 700 496 L 680 756 L 344 756 Z" fill="${palette.paper}"/>`;
    const macaronColors = [palette.accent2, palette.soft, palette.accent, palette.paper];
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        const x = 392 + column * 88;
        const y = 566 + row * 62;
        const color = macaronColors[(row + column) % macaronColors.length];
        output += `<ellipse cx="${x}" cy="${y}" rx="35" ry="18" fill="${color}" stroke="${palette.deep}" stroke-opacity="0.12" stroke-width="3"/>`;
        output += `<rect x="${x - 32}" y="${y + 5}" width="64" height="12" rx="6" fill="${palette.paper}" opacity="0.9"/>`;
        output += `<ellipse cx="${x}" cy="${y + 20}" rx="32" ry="12" fill="${color}" opacity="0.9"/>`;
      }
    }
  } else if (variant === 8) {
    output += `<path d="M 300 500 L 724 500 L 700 780 L 324 780 Z" fill="${palette.paper}" stroke="${palette.deep}" stroke-opacity="0.15" stroke-width="5"/>`;
    for (let index = 0; index < 9; index += 1) {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = 386 + column * 126;
      const y = 570 + row * 66;
      output += `<path d="M ${x} ${y - 39} C ${x + 30} ${y - 39}, ${x + 36} ${y + 5}, ${x + 20} ${y + 29} C ${x + 10} ${y + 44}, ${x - 10} ${y + 44}, ${x - 20} ${y + 29} C ${x - 36} ${y + 5}, ${x - 30} ${y - 39}, ${x} ${y - 39} Z" fill="#b54a45"/>`;
      output += `<path d="M ${x - 34} ${y - 37} L ${x - 14} ${y - 25} L ${x - 4} ${y - 42} L ${x + 9} ${y - 24} L ${x + 20} ${y - 41} L ${x + 33} ${y - 28} Q ${x} ${y - 18} ${x - 34} ${y - 37} Z" fill="${palette.green}"/>`;
      output += `<path d="M ${x} ${y - 41} L ${x + 5} ${y - 58}" stroke="${palette.green}" stroke-width="4" stroke-linecap="round"/>`;
      output += `<path d="M ${x - 23} ${y + 4} Q ${x} ${y - 5} ${x + 23} ${y + 4} L ${x + 17} ${y + 28} Q ${x} ${y + 40} ${x - 17} ${y + 28} Z" fill="${palette.deep}" opacity="0.92"/>`;
      for (const [dx, dy] of [[-10, -16], [10, -18], [0, -6], [-18, -2], [18, -4]]) {
        output += `<circle cx="${x + dx}" cy="${y + dy}" r="2" fill="${palette.paper}" opacity="0.55"/>`;
      }
    }
  } else if (variant === 9) {
    const tiers = [
      { x: 340, y: 690, w: 344, h: 72, color: palette.deep },
      { x: 372, y: 596, w: 280, h: 68, color: palette.accent },
      { x: 404, y: 500, w: 216, h: 66, color: palette.paper },
    ];
    for (const tier of tiers) {
      output += `<rect x="${tier.x}" y="${tier.y}" width="${tier.w}" height="${tier.h}" rx="18" fill="${tier.color}" stroke="${palette.deep}" stroke-opacity="0.16" stroke-width="4"/>`;
      output += `<rect x="${tier.x + 24}" y="${tier.y + 12}" width="${tier.w - 48}" height="8" rx="4" fill="${palette.metal}" opacity="0.55"/>`;
      output += `<rect x="${tier.x + tier.w / 2 - 11}" y="${tier.y}" width="22" height="${tier.h}" fill="${palette.metal}" opacity="0.9"/>`;
    }
    output += `<path d="M 512 458 C 466 420, 446 470, 484 488 C 462 504, 490 538, 512 512 C 534 538, 562 504, 540 488 C 578 470, 558 420, 512 458 Z" fill="${palette.accent2}"/>`;
  } else {
    output += `<path d="M 286 468 L 738 468 L 714 764 L 310 764 Z" fill="${palette.deep}" opacity="0.95"/>`;
    output += `<path d="M 310 488 L 714 488 L 696 736 L 328 736 Z" fill="${palette.paper}"/>`;
    output += `<path d="M 310 488 L 714 488 L 696 512 L 328 512 Z" fill="${palette.soft}" opacity="0.8"/>`;

    if (variant === 5) {
      for (let index = 0; index < 10; index += 1) {
        const x = 354 + (index % 5) * 78;
        const y = 570 + Math.floor(index / 5) * 108;
        output += `<path d="M ${x} ${y - 28} L ${x + 42} ${y - 74} L ${x + 31} ${y + 6} L ${x - 24} ${y + 38} L ${x - 39} ${y - 2} Z" fill="${index % 2 ? palette.accent : palette.deep}" transform="rotate(${index * 23} ${x} ${y})"/>`;
      }
    } else if (variant === 7) {
      for (let index = 0; index < 4; index += 1) {
        const x = 365;
        const y = 560 + index * 48;
        output += `<rect x="${x}" y="${y}" width="294" height="34" rx="10" fill="${palette.accent}" stroke="${palette.deep}" stroke-opacity="0.15" stroke-width="3"/>`;
        for (let dot = 0; dot < 5; dot += 1) {
          output += `<circle cx="${x + 36 + dot * 55}" cy="${y + 17}" r="7" fill="${palette.paper}" opacity="0.5"/>`;
        }
      }
    } else {
      const rows = 3;
      const columns = 4;
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const x = 368 + column * 98;
          const y = 552 + row * 58;
          if ((row + column) % 3 === 0) {
            output += `<rect x="${x - 25}" y="${y - 19}" width="50" height="38" rx="10" fill="${palette.deep}" transform="rotate(${(row - column) * 5} ${x} ${y})"/>`;
            output += `<path d="M ${x - 15} ${y - 8} Q ${x} ${y + 7} ${x + 16} ${y - 8}" fill="none" stroke="${palette.metal}" stroke-width="4" opacity="0.65"/>`;
          } else {
            output += `<circle cx="${x}" cy="${y}" r="22" fill="${palette.accent}"/>`;
            output += `<circle cx="${x - 7}" cy="${y - 8}" r="7" fill="${palette.paper}" opacity="0.28"/>`;
            output += `<path d="M ${x - 11} ${y - 18} Q ${x + 2} ${y - 6} ${x + 16} ${y - 17}" fill="none" stroke="${palette.accent2}" stroke-width="4" stroke-linecap="round"/>`;
          }
        }
      }
    }
    output += `<path d="M 512 470 L 512 730" stroke="${palette.metal}" stroke-width="24" opacity="0.88"/>`;
    output += `<path d="M 294 560 L 706 560" stroke="${palette.metal}" stroke-width="18" opacity="0.82"/>`;
    output += `<path d="M 512 470 C 470 430, 460 482, 500 494 C 484 518, 526 532, 532 500 C 552 528, 588 498, 558 482 C 580 458, 548 436, 512 470 Z" fill="${palette.metal}"/>`;
  }
  output += "</g>";
  return output;
}

function renderKeepsake(palette, variant) {
  let output = `<g filter="url(#shadow)">`;
  if (variant === 0) {
    output += `<rect x="264" y="270" width="496" height="530" rx="24" fill="${palette.wood}"/>`;
    output += `<rect x="292" y="298" width="440" height="474" rx="14" fill="${palette.paper}"/>`;
    const frames = [
      [326, 330, 170, 150],
      [528, 330, 170, 150],
      [326, 508, 170, 220],
      [528, 508, 170, 220],
    ];
    for (const [x, y, width, height] of frames) {
      output += `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="${palette.soft}" stroke="${palette.deep}" stroke-opacity="0.2" stroke-width="4"/>`;
      output += `<circle cx="${x + width / 2}" cy="${y + height * 0.4}" r="${Math.min(width, height) * 0.15}" fill="${palette.accent2}" opacity="0.6"/>`;
      output += `<path d="M ${x + 18} ${y + height - 18} Q ${x + width / 2} ${y + height * 0.54} ${x + width - 18} ${y + height - 18}" fill="${palette.accent}" opacity="0.45"/>`;
    }
  } else if (variant === 1) {
    output += `<path d="M 310 280 Q 512 248 714 280 L 700 772 Q 512 808 324 772 Z" fill="${palette.accent}" opacity="0.92"/>`;
    output += `<path d="M 310 280 Q 512 248 714 280 L 710 324 Q 512 292 314 324 Z" fill="${palette.deep}" opacity="0.35"/>`;
    output += `<rect x="342" y="322" width="22" height="420" rx="11" fill="${palette.deep}" opacity="0.3"/>`;
    output += `<rect x="570" y="360" width="76" height="94" rx="8" fill="${palette.paper}" opacity="0.82"/>`;
    for (let line = 0; line < 4; line += 1) {
      output += `<rect x="586" y="${382 + line * 14}" width="44" height="4" rx="2" fill="${palette.deep}" opacity="0.35"/>`;
    }
    output += `<circle cx="468" cy="566" r="66" fill="none" stroke="${palette.metal}" stroke-width="5" opacity="0.9"/>`;
    output += `<circle cx="468" cy="566" r="49" fill="none" stroke="${palette.metal}" stroke-width="2" opacity="0.5"/>`;
    output += `<path d="M 512 768 L 512 730" stroke="${palette.metal}" stroke-width="9" stroke-linecap="round"/>`;
    output += `<path d="M 480 730 L 544 730 L 532 774 L 492 774 Z" fill="${palette.metal}"/>`;
  } else if (variant === 2) {
    output += `<rect x="250" y="242" width="524" height="586" rx="20" fill="${palette.wood}"/>`;
    output += `<rect x="286" y="278" width="452" height="514" rx="8" fill="#233341"/>`;
    for (let index = 0; index < 30; index += 1) {
      const x = 326 + ((index * 83) % 366);
      const y = 326 + ((index * 127) % 416);
      const radius = index % 4 === 0 ? 4 : 2;
      output += `<circle cx="${x}" cy="${y}" r="${radius}" fill="#f7efdb" opacity="${0.35 + (index % 5) * 0.12}"/>`;
    }
    output += `<path d="M 376 368 L 448 430 L 516 388 L 574 486 L 644 444 L 692 568" fill="none" stroke="#d8c18d" stroke-width="3" opacity="0.8"/>`;
    output += `<circle cx="620" cy="662" r="46" fill="#e9d7a9" opacity="0.9"/>`;
    output += `<circle cx="638" cy="646" r="42" fill="#233341" opacity="0.92"/>`;
    output += sparkle(376, 368, 12, "#f5e5b4");
    output += sparkle(574, 486, 9, "#f5e5b4");
    output += sparkle(692, 568, 8, "#f5e5b4");
  } else if (variant === 3) {
    output += `<circle cx="512" cy="326" r="92" fill="none" stroke="${palette.metal}" stroke-width="22"/>`;
    output += `<circle cx="512" cy="326" r="64" fill="none" stroke="${palette.metal}" stroke-width="6" opacity="0.5"/>`;
    output += `<path d="M 512 418 L 512 470" stroke="${palette.metal}" stroke-width="8"/>`;
    output += `<rect x="374" y="462" width="276" height="280" rx="26" fill="${palette.accent}" stroke="${palette.deep}" stroke-opacity="0.15" stroke-width="5"/>`;
    for (let line = 0; line < 4; line += 1) {
      output += `<path d="M 424 ${540 + line * 34} Q 512 ${522 + line * 34} 600 ${540 + line * 34}" fill="none" stroke="${palette.metal}" stroke-width="4" opacity="0.55"/>`;
    }
    output += `<circle cx="512" cy="690" r="12" fill="${palette.paper}" opacity="0.7"/>`;
  } else if (variant === 4) {
    output += `<rect x="268" y="462" width="488" height="296" rx="18" fill="${palette.wood}"/>`;
    output += `<rect x="300" y="428" width="424" height="70" rx="14" fill="${palette.wood}" stroke="${palette.deep}" stroke-opacity="0.2" stroke-width="4"/>`;
    output += `<rect x="338" y="350" width="186" height="116" rx="6" fill="${palette.paper}" transform="rotate(-6 431 408)"/>`;
    output += `<rect x="512" y="342" width="174" height="124" rx="6" fill="${palette.soft}" transform="rotate(5 599 404)"/>`;
    output += `<path d="M 388 378 L 478 378 M 388 400 L 458 400 M 388 422 L 472 422" stroke="${palette.accent}" stroke-width="5" opacity="0.55"/>`;
    output += `<rect x="354" y="502" width="316" height="74" rx="10" fill="${palette.paper}"/>`;
    output += `<path d="M 512 462 L 512 558" stroke="${palette.metal}" stroke-width="13" opacity="0.8"/>`;
  } else if (variant === 5) {
    output += `<rect x="326" y="380" width="372" height="360" rx="28" fill="${palette.accent}" stroke="${palette.deep}" stroke-opacity="0.18" stroke-width="5"/>`;
    output += `<path d="M 326 454 Q 512 520 698 454" fill="${palette.deep}" opacity="0.16"/>`;
    output += `<rect x="374" y="494" width="276" height="18" rx="9" fill="${palette.metal}" opacity="0.7"/>`;
    output += `<circle cx="512" cy="608" r="54" fill="none" stroke="${palette.metal}" stroke-width="5" opacity="0.8"/>`;
    output += `<path d="M 492 608 L 506 622 L 538 584" fill="none" stroke="${palette.metal}" stroke-width="8" stroke-linecap="round"/>`;
  } else {
    output += `<rect x="272" y="300" width="484" height="486" rx="18" fill="${palette.deep}" transform="rotate(-4 514 543)"/>`;
    output += `<rect x="290" y="320" width="484" height="486" rx="18" fill="${palette.accent}" transform="rotate(2 532 563)"/>`;
    output += `<rect x="310" y="340" width="484" height="486" rx="18" fill="${palette.paper}"/>`;
    output += `<rect x="348" y="382" width="306" height="280" rx="6" fill="${palette.soft}"/>`;
    output += `<circle cx="438" cy="474" r="36" fill="${palette.accent2}" opacity="0.7"/>`;
    output += `<path d="M 368 652 Q 500 512 650 652" fill="${palette.accent}" opacity="0.45"/>`;
    output += `<path d="M 348 704 L 654 704 M 348 730 L 578 730" stroke="${palette.deep}" stroke-width="6" opacity="0.25" stroke-linecap="round"/>`;
  }
  output += "</g>";
  return output;
}

function renderJewelry(palette, variant) {
  let output = `<g filter="url(#shadow)">`;
  if (variant === 0) {
    output += `<rect x="330" y="266" width="364" height="500" rx="16" fill="${palette.paper}" stroke="${palette.deep}" stroke-opacity="0.12" stroke-width="4"/>`;
    for (const x of [438, 586]) {
      output += `<circle cx="${x}" cy="380" r="34" fill="none" stroke="${palette.metal}" stroke-width="7"/>`;
      output += `<path d="M ${x} 414 L ${x} 478" stroke="${palette.metal}" stroke-width="5"/>`;
      output += `<path d="M ${x} 472 L ${x + 46} ${x === 438 ? 566 : 550} L ${x} ${640} L ${x - 46} ${x === 438 ? 566 : 550} Z" fill="${palette.green}" opacity="0.9"/>`;
      output += `<path d="M ${x} 472 L ${x + 46} ${x === 438 ? 566 : 550} L ${x} 640 Z" fill="${palette.accent2}" opacity="0.55"/>`;
      output += sparkle(x - 12, 546, 11, palette.paper);
    }
    output += `<rect x="398" y="704" width="228" height="8" rx="4" fill="${palette.metal}" opacity="0.45"/>`;
  } else {
    output += `<rect x="300" y="250" width="424" height="536" rx="20" fill="${palette.paper}" stroke="${palette.deep}" stroke-opacity="0.12" stroke-width="4"/>`;
    output += `<path d="M 362 392 Q 512 610 662 392" fill="none" stroke="${palette.metal}" stroke-width="4"/>`;
    for (let index = 0; index < 17; index += 1) {
      const t = index / 16;
      const x = 362 + t * 300;
      const y = 392 + Math.sin(t * Math.PI) * 132;
      output += `<circle cx="${x}" cy="${y}" r="4" fill="${palette.metal}" opacity="0.7"/>`;
    }
    output += `<circle cx="512" cy="570" r="44" fill="none" stroke="${palette.metal}" stroke-width="6"/>`;
    output += `<circle cx="512" cy="570" r="22" fill="${palette.accent2}" opacity="0.8"/>`;
    output += `<path d="M 512 614 L 512 652" stroke="${palette.metal}" stroke-width="5"/>`;
    output += `<path d="M 488 652 L 536 652 L 526 682 L 498 682 Z" fill="${palette.metal}"/>`;
    output += sparkle(512, 570, 14, palette.paper);
  }
  output += "</g>";
  return output;
}

function renderGiftbox(palette, variant) {
  let output = `<g filter="url(#shadow)">`;
  if (variant === 1) {
    output += `<path d="M 264 548 L 760 548 L 724 796 L 300 796 Z" fill="${palette.wood}"/>`;
    output += `<rect x="300" y="578" width="424" height="180" rx="10" fill="${palette.paper}" opacity="0.85"/>`;
    output += `<rect x="350" y="610" width="140" height="112" rx="12" fill="${palette.accent}"/>`;
    output += `<path d="M 420 610 L 420 722 M 350 666 L 490 666" stroke="${palette.paper}" stroke-width="9" opacity="0.55"/>`;
    output += `<ellipse cx="584" cy="684" rx="56" ry="34" fill="${palette.deep}" opacity="0.9"/>`;
    output += `<ellipse cx="584" cy="672" rx="56" ry="32" fill="${palette.accent2}"/>`;
    output += `<path d="M 548 678 Q 584 646 620 678" fill="none" stroke="${palette.paper}" stroke-width="4" opacity="0.5"/>`;
    output += `<circle cx="666" cy="684" r="26" fill="${palette.paper}" stroke="${palette.deep}" stroke-opacity="0.17" stroke-width="4"/>`;
    output += `<path d="M 666 664 L 666 704" stroke="${palette.wood}" stroke-width="6"/>`;
  } else if (variant === 2 || variant === 3) {
    output += `<path d="M 264 500 L 760 500 L 726 800 L 298 800 Z" fill="${palette.wood}"/>`;
    output += `<rect x="300" y="536" width="424" height="224" rx="12" fill="${palette.paper}"/>`;
    const shapeColors = [palette.accent, palette.accent2, palette.deep, palette.metal];
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        const x = 386 + column * 126;
        const y = 610 + row * 88;
        const color = shapeColors[(row + column + variant) % shapeColors.length];
        if ((row + column) % 2 === 0) {
          output += `<circle cx="${x}" cy="${y}" r="34" fill="${color}"/>`;
          output += `<circle cx="${x - 8}" cy="${y - 10}" r="9" fill="${palette.paper}" opacity="0.25"/>`;
        } else {
          output += `<rect x="${x - 32}" y="${y - 24}" width="64" height="48" rx="10" fill="${color}" transform="rotate(${(column - 1) * 5} ${x} ${y})"/>`;
          output += `<path d="M ${x - 18} ${y - 5} L ${x + 18} ${y - 5}" stroke="${palette.paper}" stroke-width="4" opacity="0.35"/>`;
        }
      }
    }
    output += `<path d="M 264 500 L 760 500 L 742 540 L 282 540 Z" fill="${palette.metal}" opacity="0.6"/>`;
  } else {
    output += `<path d="M 292 466 L 732 466 L 700 798 L 324 798 Z" fill="${palette.deep}"/>`;
    output += `<path d="M 324 496 L 700 496 L 676 770 L 348 770 Z" fill="${palette.accent}"/>`;
    output += `<path d="M 324 496 L 700 496 L 688 536 L 336 536 Z" fill="${palette.soft}" opacity="0.4"/>`;
    output += `<path d="M 512 470 L 512 786" stroke="${palette.metal}" stroke-width="28" opacity="0.85"/>`;
    output += `<path d="M 302 548 L 722 548" stroke="${palette.metal}" stroke-width="22" opacity="0.85"/>`;
    output += `<path d="M 512 520 C 464 476, 450 536, 496 548 C 468 572, 516 602, 526 560 C 552 598, 596 558, 560 540 C 592 504, 544 486, 512 520 Z" fill="${palette.metal}"/>`;
    if (variant === 4) {
      output += `<rect x="592" y="612" width="54" height="92" rx="16" fill="${palette.paper}" opacity="0.9"/>`;
      output += `<path d="M 619 612 L 619 584" stroke="${palette.deep}" stroke-width="5" stroke-linecap="round"/>`;
      output += `<circle cx="619" cy="572" r="12" fill="${palette.metal}"/>`;
    } else if (variant === 5) {
      output += `<path d="M 596 640 L 646 640 L 646 704 L 596 704 Z" fill="${palette.paper}" opacity="0.9"/>`;
      output += `<path d="M 586 640 L 621 604 L 656 640 Z" fill="${palette.paper}" opacity="0.9"/>`;
    } else if (variant === 6) {
      output += `<rect x="590" y="618" width="46" height="84" rx="14" fill="${palette.paper}" opacity="0.9"/>`;
      output += leaf(638, 650, 22, 9, -35, palette.green);
      output += leaf(650, 676, 18, 8, 30, palette.green);
    } else if (variant === 7) {
      output += `<rect x="588" y="610" width="78" height="56" rx="4" fill="${palette.paper}" transform="rotate(-7 627 638)"/>`;
      output += `<path d="M 588 610 L 627 638 L 666 610" fill="none" stroke="${palette.metal}" stroke-width="3"/>`;
    }
  }
  output += "</g>";
  return output;
}

function renderPerfume(palette, variant) {
  const widths = [214, 248, 180];
  const heights = [320, 286, 360];
  const width = widths[variant % widths.length];
  const height = heights[variant % heights.length];
  const x = 512 - width / 2;
  const y = 734 - height;
  let output = `<g filter="url(#shadow)">`;
  output += `<rect x="${x + 32}" y="${y - 38}" width="${width - 64}" height="52" rx="12" fill="${palette.metal}"/>`;
  output += `<rect x="${x + 52}" y="${y - 2}" width="${width - 104}" height="40" rx="8" fill="${palette.deep}" opacity="0.55"/>`;
  output += `<path d="M ${x + 24} ${y + 36} Q ${x} ${y + 68} ${x} ${y + 118} L ${x} ${y + height - 24} Q ${x} ${y + height} ${x + 24} ${y + height} L ${x + width - 24} ${y + height} Q ${x + width} ${y + height} ${x + width} ${y + height - 24} L ${x + width} ${y + 118} Q ${x + width} ${y + 68} ${x + width - 24} ${y + 36} Z" fill="${palette.soft}" fill-opacity="0.72" stroke="${palette.paper}" stroke-width="4"/>`;
  output += `<path d="M ${x + 20} ${y + 96} Q ${x + width * 0.34} ${y + 74} ${x + width * 0.35} ${y + 130} L ${x + width * 0.3} ${y + height - 30} Q ${x + 32} ${y + height - 16} ${x + 26} ${y + height - 28} Z" fill="${palette.paper}" opacity="0.34"/>`;
  output += `<rect x="${x + width * 0.23}" y="${y + height * 0.4}" width="${width * 0.54}" height="${height * 0.3}" rx="8" fill="${palette.paper}" opacity="0.82"/>`;
  output += `<path d="M ${x + width * 0.32} ${y + height * 0.49} L ${x + width * 0.68} ${y + height * 0.49} M ${x + width * 0.32} ${y + height * 0.56} L ${x + width * 0.58} ${y + height * 0.56}" stroke="${palette.deep}" stroke-width="4" opacity="0.28" stroke-linecap="round"/>`;
  output += `<circle cx="${x + width / 2}" cy="${y + height * 0.64}" r="10" fill="${palette.metal}" opacity="0.8"/>`;
  output += `<ellipse cx="512" cy="776" rx="${width * 0.74}" ry="28" fill="${palette.deep}" opacity="0.18"/>`;
  if (variant === 1) {
    output += leaf(300, 592, 52, 17, -32, palette.green);
    output += leaf(726, 610, 46, 15, 27, palette.green);
    output += flower(300, 540, 38, palette.paper, palette.metal, 7, 12, palette.deep);
    output += flower(730, 560, 32, palette.accent2, palette.metal, 6, -8, palette.deep);
  } else if (variant === 2) {
    output += `<rect x="706" y="460" width="92" height="238" rx="8" fill="${palette.accent}" opacity="0.86"/>`;
    output += `<rect x="722" y="486" width="60" height="6" rx="3" fill="${palette.paper}" opacity="0.5"/>`;
    output += flower(280, 584, 44, palette.paper, palette.metal, 8, 0, palette.deep);
  } else {
    output += leaf(292, 648, 48, 15, -38, palette.green);
    output += leaf(732, 622, 44, 14, 31, palette.green);
    output += flower(286, 602, 35, palette.accent2, palette.paper, 7, 10, palette.deep);
  }
  output += "</g>";
  return output;
}

function renderBag(palette) {
  return `<g filter="url(#shadow)">
    <path d="M 370 424 Q 512 240 654 424" fill="none" stroke="${palette.wood}" stroke-width="26" stroke-linecap="round"/>
    <path d="M 346 438 L 678 438 L 738 768 Q 512 814 286 768 Z" fill="${palette.accent}"/>
    <path d="M 366 470 L 658 470 L 706 740 Q 512 780 318 740 Z" fill="${palette.accent2}" opacity="0.72"/>
    <g stroke="${palette.paper}" stroke-width="5" opacity="0.28">
      <path d="M 360 528 L 668 528 M 346 586 L 684 586 M 334 644 L 698 644 M 322 702 L 710 702"/>
      <path d="M 430 466 L 402 754 M 494 462 L 478 764 M 558 462 L 562 764 M 622 466 L 644 754"/>
    </g>
    <path d="M 512 440 L 512 780" stroke="${palette.wood}" stroke-width="13" opacity="0.55"/>
    <path d="M 532 470 L 610 470 L 610 522 L 532 522 Z" fill="${palette.paper}" opacity="0.9"/>
    <path d="M 546 496 L 596 496" stroke="${palette.deep}" stroke-width="4" opacity="0.3"/>
    <rect x="674" y="536" width="46" height="82" rx="8" fill="${palette.deep}" opacity="0.55"/>
  </g>`;
}

function renderSunglasses(palette) {
  return `<g filter="url(#shadow)">
    <path d="M 282 440 Q 304 388 370 392 L 438 430 Q 464 510 406 574 Q 330 592 296 526 Q 276 480 282 440 Z" fill="${palette.deep}" opacity="0.9"/>
    <path d="M 742 440 Q 720 388 654 392 L 586 430 Q 560 510 618 574 Q 694 592 728 526 Q 748 480 742 440 Z" fill="${palette.deep}" opacity="0.9"/>
    <path d="M 306 448 Q 326 414 372 418 L 426 446 Q 444 500 404 546 Q 350 558 322 510 Q 306 478 306 448 Z" fill="${palette.soft}" opacity="0.62"/>
    <path d="M 718 448 Q 698 414 652 418 L 598 446 Q 580 500 620 546 Q 674 558 702 510 Q 718 478 718 448 Z" fill="${palette.soft}" opacity="0.62"/>
    <path d="M 438 438 Q 512 414 586 438" fill="none" stroke="${palette.wood}" stroke-width="18" stroke-linecap="round"/>
    <path d="M 290 442 Q 238 448 220 484" fill="none" stroke="${palette.wood}" stroke-width="15" stroke-linecap="round"/>
    <path d="M 734 442 Q 786 448 804 484" fill="none" stroke="${palette.wood}" stroke-width="15" stroke-linecap="round"/>
    <path d="M 330 474 Q 370 454 414 476" fill="none" stroke="${palette.paper}" stroke-width="7" opacity="0.28" stroke-linecap="round"/>
    <path d="M 392 720 Q 392 694 420 694 L 604 694 Q 632 694 632 720 L 632 766 Q 632 790 606 790 L 418 790 Q 392 790 392 766 Z" fill="${palette.accent}" opacity="0.78"/>
    <path d="M 404 720 Q 404 706 422 706 L 602 706 Q 620 706 620 720" fill="none" stroke="${palette.paper}" stroke-width="5" opacity="0.38"/>
    <circle cx="512" cy="742" r="7" fill="${palette.metal}"/>
  </g>`;
}

function renderToy(palette, variant) {
  let output = `<g filter="url(#shadow)">`;
  if (variant === 0) {
    output += `<circle cx="436" cy="346" r="68" fill="${palette.wood}"/><circle cx="588" cy="346" r="68" fill="${palette.wood}"/>`;
    output += `<circle cx="436" cy="346" r="39" fill="${palette.soft}"/><circle cx="588" cy="346" r="39" fill="${palette.soft}"/>`;
    output += `<ellipse cx="512" cy="650" rx="154" ry="174" fill="${palette.wood}"/>`;
    output += `<circle cx="512" cy="420" r="126" fill="${palette.wood}"/>`;
    output += `<ellipse cx="512" cy="458" rx="68" ry="52" fill="${palette.paper}" opacity="0.86"/>`;
    output += `<circle cx="472" cy="408" r="11" fill="${palette.deep}"/><circle cx="552" cy="408" r="11" fill="${palette.deep}"/>`;
    output += `<ellipse cx="512" cy="446" rx="18" ry="13" fill="${palette.deep}"/>`;
    output += `<path d="M 492 468 Q 512 484 532 468" fill="none" stroke="${palette.deep}" stroke-width="5" stroke-linecap="round"/>`;
    output += `<ellipse cx="398" cy="614" rx="58" ry="104" fill="${palette.wood}" transform="rotate(18 398 614)"/>`;
    output += `<ellipse cx="626" cy="614" rx="58" ry="104" fill="${palette.wood}" transform="rotate(-18 626 614)"/>`;
    output += `<path d="M 512 544 C 468 512, 462 556, 500 566 C 472 586, 512 614, 526 580 C 548 608, 586 570, 554 554 C 580 528, 542 506, 512 544 Z" fill="${palette.accent}"/>`;
    output += `<ellipse cx="512" cy="792" rx="162" ry="26" fill="${palette.deep}" opacity="0.16"/>`;
  } else if (variant === 1) {
    output += `<ellipse cx="512" cy="636" rx="126" ry="164" fill="${palette.soft}"/>`;
    output += `<circle cx="512" cy="410" r="108" fill="${palette.soft}"/>`;
    output += `<ellipse cx="512" cy="432" rx="76" ry="58" fill="${palette.paper}" opacity="0.82"/>`;
    output += `<ellipse cx="482" cy="410" rx="22" ry="28" fill="${palette.deep}" opacity="0.18"/>`;
    output += `<ellipse cx="542" cy="410" rx="22" ry="28" fill="${palette.deep}" opacity="0.18"/>`;
    output += `<circle cx="480" cy="400" r="7" fill="${palette.deep}"/><circle cx="544" cy="400" r="7" fill="${palette.deep}"/>`;
    output += `<path d="M 494 438 Q 512 450 530 438" fill="none" stroke="${palette.deep}" stroke-width="4" stroke-linecap="round"/>`;
    output += `<path d="M 398 522 Q 318 590 344 760" fill="none" stroke="${palette.soft}" stroke-width="62" stroke-linecap="round"/>`;
    output += `<path d="M 626 522 Q 706 590 680 760" fill="none" stroke="${palette.soft}" stroke-width="62" stroke-linecap="round"/>`;
    output += `<ellipse cx="512" cy="798" rx="156" ry="22" fill="${palette.deep}" opacity="0.15"/>`;
  } else if (variant === 2) {
    const colors = [palette.accent2, palette.accent, palette.metal, palette.green, palette.soft];
    for (let index = 0; index < 5; index += 1) {
      const width = 360 - index * 46;
      const y = 722 - index * 56;
      output += `<path d="M ${512 - width / 2} ${y} Q 512 ${y - 130} ${512 + width / 2} ${y}" fill="none" stroke="${colors[index]}" stroke-width="34" stroke-linecap="round"/>`;
    }
    output += `<rect x="270" y="728" width="484" height="34" rx="17" fill="${palette.wood}"/>`;
    output += `<ellipse cx="512" cy="786" rx="180" ry="20" fill="${palette.deep}" opacity="0.14"/>`;
  } else if (variant === 3) {
    output += `<circle cx="680" cy="430" r="64" fill="${palette.accent2}" opacity="0.8"/>`;
    output += `<ellipse cx="680" cy="430" rx="96" ry="24" fill="none" stroke="${palette.metal}" stroke-width="8" transform="rotate(-18 680 430)"/>`;
    output += `<path d="M 412 700 L 412 544 Q 412 420 512 420 Q 612 420 612 544 L 612 700 Z" fill="${palette.paper}"/>`;
    output += `<path d="M 512 420 L 512 700" fill="none" stroke="${palette.accent}" stroke-width="4" opacity="0.28"/>`;
    output += `<circle cx="512" cy="532" r="38" fill="${palette.accent}" opacity="0.7"/>`;
    output += `<path d="M 460 700 L 438 778 L 486 748 L 512 800 L 538 748 L 586 778 L 564 700 Z" fill="${palette.metal}"/>`;
    output += `<rect x="336" y="606" width="46" height="154" rx="18" fill="${palette.soft}"/>`;
    output += `<circle cx="359" cy="594" r="30" fill="${palette.soft}"/>`;
    output += `<ellipse cx="512" cy="802" rx="164" ry="22" fill="${palette.deep}" opacity="0.14"/>`;
  } else if (variant === 4) {
    output += `<circle cx="512" cy="574" r="236" fill="${palette.paper}" opacity="0.2"/>`;
    output += `<circle cx="512" cy="574" r="194" fill="${palette.paper}" opacity="0.22"/>`;
    output += `<ellipse cx="464" cy="360" rx="34" ry="112" fill="${palette.soft}" transform="rotate(-10 464 360)"/>`;
    output += `<ellipse cx="560" cy="360" rx="34" ry="112" fill="${palette.soft}" transform="rotate(10 560 360)"/>`;
    output += `<circle cx="512" cy="574" r="160" fill="${palette.soft}"/>`;
    output += `<ellipse cx="512" cy="618" rx="94" ry="68" fill="${palette.paper}" opacity="0.55"/>`;
    output += `<circle cx="470" cy="548" r="9" fill="${palette.deep}"/><circle cx="554" cy="548" r="9" fill="${palette.deep}"/>`;
    output += `<path d="M 494 596 Q 512 608 530 596" fill="none" stroke="${palette.deep}" stroke-width="4" stroke-linecap="round"/>`;
    output += `<ellipse cx="512" cy="774" rx="132" ry="22" fill="${palette.deep}" opacity="0.12"/>`;
  } else {
    output += `<path d="M 512 336 L 680 414 L 680 610 L 512 688 L 344 610 L 344 414 Z" fill="${palette.deep}"/>`;
    output += `<path d="M 512 336 L 680 414 L 512 492 L 344 414 Z" fill="${palette.accent2}"/>`;
    output += `<path d="M 344 414 L 512 492 L 512 688 L 344 610 Z" fill="${palette.accent}"/>`;
    output += `<path d="M 680 414 L 512 492 L 512 688 L 680 610 Z" fill="${palette.green}"/>`;
    for (let index = 0; index < 3; index += 1) {
      for (let row = 0; row < 3; row += 1) {
        const x = 512 + (index - 1) * 56;
        const y = 414 + row * 62 + index * 18;
        output += `<rect x="${x - 16}" y="${y - 16}" width="32" height="32" rx="5" fill="${(index + row) % 2 ? palette.paper : palette.metal}" opacity="0.72"/>`;
      }
    }
    output += `<ellipse cx="512" cy="740" rx="160" ry="22" fill="${palette.deep}" opacity="0.14"/>`;
  }
  output += "</g>";
  return output;
}

function renderHome(palette, variant) {
  let output = `<g filter="url(#shadow)">`;
  if (variant === 0) {
    output += `<rect x="386" y="488" width="252" height="270" rx="42" fill="${palette.soft}" fill-opacity="0.7" stroke="${palette.paper}" stroke-width="4"/>`;
    output += `<rect x="412" y="526" width="200" height="182" rx="24" fill="${palette.paper}" opacity="0.65"/>`;
    output += `<path d="M 512 470 Q 482 430 512 398 Q 542 430 512 470 Z" fill="${palette.metal}"/>`;
    output += `<path d="M 512 458 Q 500 438 512 422 Q 524 438 512 458 Z" fill="${palette.paper}"/>`;
    output += `<rect x="434" y="574" width="156" height="86" rx="6" fill="${palette.accent}" opacity="0.8"/>`;
    output += `<path d="M 456 600 L 568 600 M 456 624 L 532 624" stroke="${palette.paper}" stroke-width="4" opacity="0.35" stroke-linecap="round"/>`;
    output += `<ellipse cx="512" cy="780" rx="152" ry="24" fill="${palette.deep}" opacity="0.16"/>`;
  } else if (variant === 1) {
    output += `<path d="M 318 434 Q 318 388 364 388 Q 410 388 410 434 L 410 724 Q 410 760 364 760 Q 318 760 318 724 Z" fill="${palette.paper}" stroke="${palette.deep}" stroke-opacity="0.12" stroke-width="4"/>`;
    output += `<path d="M 574 514 Q 574 468 620 468 Q 666 468 666 514 L 666 734 Q 666 766 620 766 Q 574 766 574 734 Z" fill="${palette.soft}" stroke="${palette.deep}" stroke-opacity="0.12" stroke-width="4"/>`;
    output += `<path d="M 364 388 L 364 348 M 620 468 L 620 424" stroke="${palette.green}" stroke-width="6" stroke-linecap="round"/>`;
    output += flower(364, 328, 34, palette.accent, palette.metal, 7, 0, palette.deep);
    output += flower(620, 406, 28, palette.paper, palette.metal, 6, 10, palette.deep);
    output += leaf(344, 368, 24, 9, -34, palette.green);
    output += leaf(642, 446, 24, 9, 34, palette.green);
  } else if (variant === 2) {
    output += `<path d="M 384 490 L 640 490 L 668 582 L 356 582 Z" fill="${palette.paper}" stroke="${palette.deep}" stroke-opacity="0.12" stroke-width="4"/>`;
    output += `<rect x="490" y="584" width="44" height="142" rx="14" fill="${palette.wood}"/>`;
    output += `<ellipse cx="512" cy="730" rx="94" ry="22" fill="${palette.wood}"/>`;
    output += `<path d="M 512 488 L 512 386" stroke="${palette.metal}" stroke-width="8"/>`;
    output += `<circle cx="512" cy="520" r="18" fill="${palette.metal}" opacity="0.85"/>`;
  } else if (variant === 3) {
    output += `<path d="M 512 758 L 512 526" stroke="${palette.wood}" stroke-width="22" stroke-linecap="round"/>`;
    output += `<path d="M 512 646 Q 438 604 390 534 M 512 588 Q 588 554 636 496 M 512 698 Q 602 686 662 630" fill="none" stroke="${palette.wood}" stroke-width="12" stroke-linecap="round"/>`;
    for (let index = 0; index < 13; index += 1) {
      const x = 350 + ((index * 73) % 330);
      const y = 460 + ((index * 59) % 250);
      output += leaf(x, y, 30, 10, index * 37 - 80, palette.green);
      output += `<ellipse cx="${x}" cy="${y - 10}" rx="8" ry="8" fill="${palette.deep}" opacity="0.38"/>`;
    }
    output += `<path d="M 386 740 L 638 740 L 606 820 L 418 820 Z" fill="${palette.paper}" stroke="${palette.deep}" stroke-opacity="0.13" stroke-width="4"/>`;
  } else if (variant === 4) {
    output += `<rect x="492" y="334" width="40" height="406" rx="12" fill="${palette.wood}"/>`;
    for (const [x, y] of [[402, 462], [622, 462], [402, 600], [622, 600]]) {
      output += `<path d="M ${x} ${y} L ${x + (x < 512 ? 90 : -90)} 334" stroke="${palette.wood}" stroke-width="13" stroke-linecap="round"/>`;
      output += `<path d="M ${x - 50} ${y + 84} L ${x + 50} ${y + 84}" stroke="${palette.wood}" stroke-width="13" stroke-linecap="round"/>`;
      output += `<path d="M ${x - 38} ${y + 18} L ${x + 38} ${y + 18} L ${x + 30} ${y + 84} Q ${x} ${y + 102} ${x - 30} ${y + 84} Z" fill="${palette.paper}" stroke="${palette.deep}" stroke-opacity="0.12" stroke-width="3"/>`;
    }
    output += `<rect x="430" y="740" width="164" height="24" rx="12" fill="${palette.wood}"/>`;
  } else {
    output += `<ellipse cx="512" cy="604" rx="262" ry="118" fill="${palette.paper}" stroke="${palette.metal}" stroke-width="10"/>`;
    output += `<ellipse cx="512" cy="584" rx="224" ry="92" fill="${palette.soft}" opacity="0.45"/>`;
    output += `<path d="M 288 526 Q 254 526 254 558" fill="none" stroke="${palette.metal}" stroke-width="18" stroke-linecap="round"/>`;
    output += `<path d="M 736 526 Q 770 526 770 558" fill="none" stroke="${palette.metal}" stroke-width="18" stroke-linecap="round"/>`;
    output += `<ellipse cx="456" cy="574" rx="60" ry="28" fill="${palette.accent}" opacity="0.75"/>`;
    output += `<path d="M 430 574 Q 456 538 482 574" fill="none" stroke="${palette.paper}" stroke-width="4" opacity="0.4"/>`;
    output += `<rect x="548" y="540" width="54" height="76" rx="9" fill="${palette.accent2}" opacity="0.8"/>`;
    output += `<circle cx="642" cy="582" r="34" fill="${palette.paper}" opacity="0.7"/>`;
    output += `<ellipse cx="512" cy="736" rx="210" ry="22" fill="${palette.deep}" opacity="0.12"/>`;
  }
  output += "</g>";
  return output;
}

const MOTIF_RENDERERS = {
  bouquet: renderBouquet,
  chocolate: renderChocolate,
  keepsake: renderKeepsake,
  jewelry: renderJewelry,
  giftbox: renderGiftbox,
  perfume: renderPerfume,
  bag: renderBag,
  sunglasses: renderSunglasses,
  toy: renderToy,
  home: renderHome,
};

function background(palette) {
  return `
    <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
    <circle cx="512" cy="438" r="448" fill="url(#glow)" opacity="0.9"/>
    <path d="M 206 862 L 206 450 C 206 276 343 156 512 156 C 681 156 818 276 818 450 L 818 862 Z" fill="${palette.arch}" opacity="0.34"/>
    <path d="M 206 862 L 206 450 C 206 276 343 156 512 156 C 681 156 818 276 818 450 L 818 862" fill="none" stroke="${palette.paper}" stroke-width="3" opacity="0.52"/>
    <ellipse cx="512" cy="786" rx="300" ry="66" fill="${palette.deep}" opacity="0.07"/>
    <rect x="42" y="42" width="940" height="940" rx="2" fill="none" stroke="${palette.deep}" stroke-width="2" opacity="0.16"/>
    <rect x="58" y="58" width="908" height="908" rx="2" fill="none" stroke="${palette.paper}" stroke-width="2" opacity="0.42"/>
    <circle cx="106" cy="106" r="8" fill="${palette.metal}" opacity="0.55"/>
    <circle cx="918" cy="106" r="8" fill="${palette.metal}" opacity="0.55"/>
    <circle cx="106" cy="918" r="8" fill="${palette.metal}" opacity="0.55"/>
    <circle cx="918" cy="918" r="8" fill="${palette.metal}" opacity="0.55"/>
  `;
}

function defs(palette) {
  return `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${palette.bg1}"/>
        <stop offset="1" stop-color="${palette.bg2}"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="42%" r="52%">
        <stop offset="0" stop-color="${palette.glow}" stop-opacity="0.9"/>
        <stop offset="1" stop-color="${palette.glow}" stop-opacity="0"/>
      </radialGradient>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="180%">
        <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="${palette.deep}" flood-opacity="0.2"/>
      </filter>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.74" numOctaves="3" seed="7"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
    </defs>
  `;
}

function renderSvg(product) {
  const palette = paletteFor(product);
  const render = MOTIF_RENDERERS[product.image.motif];
  if (!render) throw new Error(`Unknown motif: ${product.image.motif}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
    ${defs(palette)}
    ${background(palette)}
    ${render(palette, product.image.variant)}
    <rect width="${SIZE}" height="${SIZE}" filter="url(#grain)" opacity="0.035"/>
    <path d="M 108 888 L 916 888" stroke="${palette.deep}" stroke-width="2" opacity="0.18"/>
  </svg>`;
}

async function main() {
  await mkdir(IMAGE_DIR, { recursive: true });
  const dataset = JSON.parse(await readFile(path.join(DATA_DIR, "products.json"), "utf8"));
  const products = dataset.products ?? [];
  if (products.length === 0) throw new Error("No products found");

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
    for (const product of products) {
      const target = path.join(DATA_DIR, product.image.path);
      if (!target.startsWith(IMAGE_DIR)) throw new Error(`Image path escapes image directory: ${product.image.path}`);
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${SIZE}px;height:${SIZE}px;overflow:hidden;background:#f4eadc}svg{display:block}</style></head><body>${renderSvg(product)}</body></html>`;
      await page.setContent(html, { waitUntil: "load" });
      await page.screenshot({ path: target, type: "jpeg", quality: 90 });
      const size = (await stat(target)).size;
      if (size < 10_000) throw new Error(`Generated image is unexpectedly small: ${target} (${size} bytes)`);
      console.log(`${product.demoId} ${path.basename(target)} ${Math.round(size / 1024)} KiB`);
    }
  } finally {
    await browser.close();
  }

  for (const product of products) {
    const target = path.join(DATA_DIR, product.image.path);
    const header = (await readFile(target)).subarray(0, 3);
    if (header[0] !== 0xff || header[1] !== 0xd8 || header[2] !== 0xff) {
      throw new Error(`Not a JPEG: ${target}`);
    }
  }
  console.log(`Generated and checked ${products.length} JPEG images`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
