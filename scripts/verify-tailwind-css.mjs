import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const cssDir = join(process.cwd(), ".next", "static", "css");

const requiredSnippets = [
  ".flex{",
  ".bg-paper{",
  ".h-7{",
  ".fill-berry{",
  ".max-w-6xl{",
  "--color-paper:",
];

const forbiddenSnippets = [
  "@tailwind utilities",
  "@theme",
  '@import "tailwindcss"',
];

let cssFiles;
try {
  cssFiles = (await readdir(cssDir)).filter((file) => file.endsWith(".css"));
} catch {
  console.error(
    `[verify-tailwind-css] No CSS output found at ${cssDir}. Run the production build first.`,
  );
  process.exit(1);
}

if (cssFiles.length === 0) {
  console.error(`[verify-tailwind-css] No stylesheets found at ${cssDir}.`);
  process.exit(1);
}

const css = (
  await Promise.all(
    cssFiles.map((file) => readFile(join(cssDir, file), "utf8")),
  )
).join("\n");

const missing = requiredSnippets.filter((snippet) => !css.includes(snippet));
const forbidden = forbiddenSnippets.filter((snippet) => css.includes(snippet));

if (missing.length > 0 || forbidden.length > 0) {
  if (missing.length > 0) {
    console.error(
      `[verify-tailwind-css] Missing compiled Tailwind output: ${missing.join(", ")}`,
    );
  }
  if (forbidden.length > 0) {
    console.error(
      `[verify-tailwind-css] Unprocessed Tailwind directives remain: ${forbidden.join(", ")}`,
    );
  }
  process.exit(1);
}

console.log(
  `[verify-tailwind-css] OK: ${cssFiles.length} stylesheet(s) contain compiled utilities and theme tokens.`,
);
