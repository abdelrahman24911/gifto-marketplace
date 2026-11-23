import { getEnvironmentBanner, type GiftoEnvironment } from "@/lib/environment";

/**
 * Environment banner (P5 demo separation).
 *
 * Renders on every page when the deployment is not production or
 * local development, so nobody mistakes demo or staging data for the
 * real marketplace: a demo shop list, a demo order, or a demo
 * settlement must be visibly labelled as not real. The colours are
 * deliberately outside the brand palette (amber for demo, sky for
 * staging) so the banner is unmistakable. Returns null for production
 * and development — the banner must never appear on the real site.
 */
export function EnvironmentBanner({
  environment,
}: {
  environment: GiftoEnvironment;
}) {
  const banner = getEnvironmentBanner(environment);
  if (!banner) return null;

  return (
    <div
      role="status"
      data-environment={environment}
      className={
        banner.tone === "demo"
          ? "bg-amber-200 px-4 py-2 text-center text-sm font-semibold text-amber-950"
          : "bg-sky-200 px-4 py-2 text-center text-sm font-semibold text-sky-950"
      }
    >
      {banner.message}
    </div>
  );
}
