const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function isLocalE2EHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname);
}

export function assertLocalE2ETarget(
  name: string,
  rawValue: string | undefined,
): void {
  if (!rawValue) return;

  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Refusing to run E2E tests with unsupported ${name} protocol "${parsed.protocol}".`,
    );
  }

  if (parsed.username || parsed.password) {
    throw new Error(`${name} must not contain credentials.`);
  }

  if (!isLocalE2EHost(parsed.hostname)) {
    throw new Error(
      `Refusing to run E2E tests with non-local ${name} host "${parsed.hostname}". ` +
        "Point the E2E target at a loopback address (for example http://127.0.0.1:54321).",
    );
  }
}
