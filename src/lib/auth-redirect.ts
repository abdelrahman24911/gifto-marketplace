import { getSiteUrl } from "./site-url";

const FALLBACK_PATH = "/account";
const CALLBACK_PATH = "/auth/callback";

/**
 * Accept only an absolute path on this site. In particular, reject protocol
 * relative URLs and backslashes, which browsers can interpret as host syntax.
 */
export function getSafeAuthPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return FALLBACK_PATH;
  }

  try {
    const parsed = new URL(value, "https://gifto-auth.invalid");
    if (parsed.origin !== "https://gifto-auth.invalid") return FALLBACK_PATH;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return FALLBACK_PATH;
  }
}

export function getAuthCallbackUrl(next?: string | null): string {
  const callback = new URL(CALLBACK_PATH, `${getSiteUrl()}/`);
  const safePath = next ? getSafeAuthPath(next) : null;
  if (safePath) callback.searchParams.set("next", safePath);
  return callback.toString();
}
