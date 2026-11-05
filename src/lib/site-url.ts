const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "NEXT_PUBLIC_SITE_URL must be set to the public site origin in production.",
      );
    }
    return "http://localhost:3000";
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("NEXT_PUBLIC_SITE_URL must be a valid absolute URL.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("NEXT_PUBLIC_SITE_URL must use http or https.");
  }

  if (process.env.NODE_ENV === "production" && LOCAL_HOSTNAMES.has(parsed.hostname)) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL must not point to localhost in production.",
    );
  }

  return configured.replace(/\/+$/, "");
}
