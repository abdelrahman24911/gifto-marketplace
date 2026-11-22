// Checks every t("key") / t.rich("key") call in src/ against messages/en.json,
// resolving the namespace from the translator variable binding:
//   const t = useTranslations("order") / const t = await getTranslations("order")
// next-intl keys are NOT type-checked (no IntlMessages declaration), so this
// is the only guard against silent missing-key fallbacks at runtime.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const messages = JSON.parse(readFileSync("messages/en.json", "utf8"));
const flat = (o, p = "") =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`],
  );
const known = new Set(flat(messages));

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|ts)$/.test(f)) files.push(p);
  }
})("src");

const missing = [];
let usedCount = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const bindings = new Map();
  for (const m of src.matchAll(
    /const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\("([a-zA-Z]+)"\)/g,
  )) {
    bindings.set(m[1], m[2]);
  }
  if (bindings.size === 0) continue;
  for (const m of src.matchAll(/\b(\w+)(?:\.rich)?\("([a-zA-Z0-9_]+)"/g)) {
    const varName = m[1];
    const key = m[2];
    const ns = bindings.get(varName);
    if (!ns) continue; // not a translator call (e.g. formatEgp, t is something else)
    usedCount++;
    if (!known.has(`${ns}.${key}`)) {
      missing.push(`${f}: ${varName} -> ${ns}.${key}`);
    }
  }
}
if (missing.length) {
  console.log("MISSING/WRONG-NAMESPACE KEYS:\n" + missing.join("\n"));
  process.exit(1);
}
console.log(`OK — ${usedCount} translator calls, all keys present in messages/en.json`);
