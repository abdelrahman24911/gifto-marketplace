#!/usr/bin/env node
// Gifto — demo target guard (P5 demo separation).
//
// The demo scripts (seed-demo, cleanup-demo, demo-passwords, reset-demo)
// are service-role scripts that write and delete rows. Before the demo
// separation they ran against whatever NEXT_PUBLIC_SUPABASE_URL happened
// to be in .env.local — which, until the isolated demo project exists,
// is the production project. One careless run in the wrong terminal
// could seed demo vendors into production or, worse, wipe demo data
// the owner still needs.
//
// This guard makes the target explicit and fail-closed:
//
//   1. The scripts run ONLY with GIFTO_ENVIRONMENT=demo. An unset or
//      different value refuses immediately — seeding must be a
//      deliberate demo-environment action, never a default.
//   2. The target URL must use https (http only for localhost), so a
//      demo database is never reached over plain HTTP in the wild.
//   3. A target whose Supabase project ref is a known production
//      project refuses unless the owner explicitly opts in with
//      GIFTO_DEMO_ALLOW_PRODUCTION_PROJECT=true. The production ref
//      list defaults to the hosted project recorded in
//      docs/DEMO_DATA_GUIDE.md and can be extended with
//      GIFTO_PRODUCTION_PROJECT_REFS (comma-separated).
//
// A target that is not a *.supabase.co URL has no extractable ref and
// cannot be proven to be production — it passes the ref check (the
// environment check above is still the gate). Self-hosted or custom
// domains stay the operator's responsibility; the checklist names
// them explicitly.

/**
 * The hosted production project ref(s). The demo data currently lives
 * in this project (docs/DEMO_DATA_GUIDE.md) until the isolated demo
 * environment exists — that is exactly why it is blocklisted here:
 * seeding into it must be an explicit, acknowledged act, not an
 * accident.
 */
export const KNOWN_PRODUCTION_PROJECT_REFS = ["hqusykdyjpruysxezsrn"];

/** Extracts the project ref from a *.supabase.co URL, or null. */
export function projectRefFromUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    if (!hostname.endsWith(".supabase.co")) return null;
    const ref = hostname.slice(0, -".supabase.co".length);
    return ref ? ref : null;
  } catch {
    return null;
  }
}

/**
 * Throws unless the target is a legitimate demo target. The error
 * message always says what to do instead — the operator should never
 * have to guess why a script refused.
 */
export function assertDemoTarget({
  url,
  environment,
  allowProductionProject = false,
  productionRefs = KNOWN_PRODUCTION_PROJECT_REFS,
} = {}) {
  if (environment !== "demo") {
    throw new Error(
      `Demo scripts run only with GIFTO_ENVIRONMENT=demo (got ${environment === undefined ? "unset" : JSON.stringify(environment)}). ` +
        "Set GIFTO_ENVIRONMENT=demo in the demo deployment's environment and re-run. " +
        "See docs/DEMO_SEPARATION_CHECKLIST.md.",
    );
  }
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is missing — the demo scripts need a target database. " +
        "Set it to the isolated demo project's URL (see docs/DEMO_SEPARATION_CHECKLIST.md).",
    );
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL is not a valid URL (${JSON.stringify(url)}).`,
    );
  }
  const isLocalhost =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocalhost)) {
    throw new Error(
      `Demo target must use https (http is allowed only for localhost); got ${parsed.protocol}//${parsed.hostname}.`,
    );
  }
  const ref = projectRefFromUrl(url);
  if (ref && productionRefs.includes(ref) && !allowProductionProject) {
    throw new Error(
      `Refusing: ${url} is the production Supabase project (ref ${ref}). ` +
        "Demo data belongs in the isolated demo project, not in production. " +
        "If you really mean to seed demo data into the production project " +
        "(the pre-separation setup, until the isolated environment exists), " +
        "set GIFTO_DEMO_ALLOW_PRODUCTION_PROJECT=true explicitly and re-run. " +
        "See docs/DEMO_SEPARATION_CHECKLIST.md.",
    );
  }
}

/** Reads the guard inputs from environment names (see .env.example). */
export function demoTargetFromEnv(env = process.env) {
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    environment: env.GIFTO_ENVIRONMENT,
    allowProductionProject:
      env.GIFTO_DEMO_ALLOW_PRODUCTION_PROJECT?.trim().toLowerCase() ===
      "true",
    productionRefs:
      env.GIFTO_PRODUCTION_PROJECT_REFS === undefined ||
      env.GIFTO_PRODUCTION_PROJECT_REFS.trim() === ""
        ? undefined
        : env.GIFTO_PRODUCTION_PROJECT_REFS.split(",")
            .map((ref) => ref.trim())
            .filter(Boolean),
  };
}
