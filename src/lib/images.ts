/**
 * Whether storefront images should go through the Next.js image optimizer.
 *
 * The optimizer fetches the source on the server and (correctly) refuses
 * private-network addresses, so a local Supabase stack (localhost / 127.0.0.1)
 * has to serve images as-is. Hosted projects are optimized. Safe to call from
 * client components: `NEXT_PUBLIC_*` values are inlined at build time.
 */
export function shouldOptimizeImages(
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): boolean {
  if (!supabaseUrl) return false;

  try {
    const { hostname } = new URL(supabaseUrl);
    if (hostname === "localhost" || hostname === "::1" || hostname === "[::1]") {
      return false;
    }
    if (/^127\./.test(hostname) || /^10\./.test(hostname)) return false;
    if (/^192\.168\./.test(hostname)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}
