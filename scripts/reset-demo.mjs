#!/usr/bin/env node
// Gifto Marketplace — reset the demo catalogue (cleanup + re-seed).
//
// Runs scripts/cleanup-demo.mjs and then scripts/seed-demo.mjs in one
// step, for the isolated demo environment only. The target guard runs
// once here and again inside each child script (defense in depth), so
// a reset can never run against the wrong database even if this file
// is edited.
//
// The reset removes demo vendors, their products/images and the demo
// owner accounts, then re-creates them with fresh random passwords
// that are never printed. Run `npm run demo:passwords` afterwards to
// rotate and reveal credentials for signing in.
//
// See docs/DEMO_SEPARATION_CHECKLIST.md and docs/DEMO_DATA_GUIDE.md.

import { spawnSync } from "node:child_process";

import {
  assertDemoTarget,
  demoTargetFromEnv,
} from "./demo-target-guard.mjs";

try {
  process.loadEnvFile(".env.local");
} catch {
  // fall back to whatever is already in the environment
}

try {
  assertDemoTarget(demoTargetFromEnv());
} catch (error) {
  console.error(`Refusing to reset demo data: ${error.message}`);
  process.exit(1);
}

for (const script of ["cleanup-demo.mjs", "seed-demo.mjs"]) {
  const result = spawnSync(
    "node",
    [new URL(script, import.meta.url).pathname],
    { stdio: "inherit" },
  );
  if (result.status !== 0) {
    console.error(`demo:reset stopped: ${script} failed.`);
    process.exit(result.status ?? 1);
  }
}

console.log(
  "Demo catalogue reset: cleanup + seed complete. " +
    "Demo owner passwords were re-created — run `npm run demo:passwords` " +
    "to rotate and reveal fresh credentials before signing in.",
);
