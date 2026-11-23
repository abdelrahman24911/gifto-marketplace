/**
 * Deployment environment (P5 demo separation).
 *
 * GIFTO_ENVIRONMENT names which deployment an app instance belongs to:
 *
 * - "production" — the real marketplace: real shops, real orders, real
 *   money. Demo data must never be seeded here and demo vendors must
 *   never take orders here (migration 67 containment).
 * - "staging" — a pre-release check of a production-like deployment.
 *   Test data only; nothing here is real.
 * - "demo" — the isolated demo environment: demo vendors only, demo
 *   orders only. No real customer ever gets an email from here, and no
 *   payout recorded here is real.
 * - "development" — local work. This is the default when the variable
 *   is unset, so a missing value can never accidentally claim to be
 *   production.
 *
 * The value is load-bearing, not decorative: the demo scripts refuse to
 * run unless it is "demo", the mail module refuses to send real email
 * from a demo environment, and the root layout shows a banner on demo
 * and staging so nobody mistakes test data for the real marketplace.
 * An unknown value is a configuration error: getEnvironment() throws
 * instead of guessing, and the deployment preflight fails on it.
 */
export const GIFTO_ENVIRONMENTS = [
  "production",
  "staging",
  "demo",
  "development",
] as const;

export type GiftoEnvironment = (typeof GIFTO_ENVIRONMENTS)[number];

/**
 * Parses a raw value: a known environment name (case- and
 * whitespace-insensitive), or null for missing/empty/unknown values.
 * Never throws — use this where a bad value must not break the request
 * (for example the mail module, which never throws).
 */
export function parseEnvironment(
  value: string | undefined,
): GiftoEnvironment | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  return (GIFTO_ENVIRONMENTS as readonly string[]).includes(normalized)
    ? (normalized as GiftoEnvironment)
    : null;
}

/**
 * Reads GIFTO_ENVIRONMENT. Unset or blank means "development". An
 * unknown value throws — a deployment that cannot name itself must fail
 * loudly at startup (or in preflight) instead of running as the wrong
 * environment.
 */
export function getEnvironment(
  env: Record<string, string | undefined> = process.env,
): GiftoEnvironment {
  const raw = env.GIFTO_ENVIRONMENT;
  if (raw === undefined || raw.trim() === "") return "development";
  const parsed = parseEnvironment(raw);
  if (!parsed) {
    throw new Error(
      `GIFTO_ENVIRONMENT must be one of ${GIFTO_ENVIRONMENTS.join(", ")} (got "${raw.trim()}").`,
    );
  }
  return parsed;
}

export function isDemoEnvironment(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return getEnvironment(env) === "demo";
}

export function isProductionEnvironment(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return getEnvironment(env) === "production";
}

export function isStagingEnvironment(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return getEnvironment(env) === "staging";
}

/** Banner copy for a non-real environment, or null for production/dev. */
export type EnvironmentBanner = {
  message: string;
  tone: "demo" | "staging";
};

export function getEnvironmentBanner(
  environment: GiftoEnvironment,
): EnvironmentBanner | null {
  if (environment === "demo") {
    return {
      message:
        "Demo environment — demo data only. No real orders, payments or emails.",
      tone: "demo",
    };
  }
  if (environment === "staging") {
    return {
      message:
        "Staging environment — test data only. Nothing here is real.",
      tone: "staging",
    };
  }
  return null;
}
