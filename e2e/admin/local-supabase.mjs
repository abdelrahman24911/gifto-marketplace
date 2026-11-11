import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

let cached;
let cli;

function firstLine(value) {
  return value.split(/\r?\n/).find((line) => line.trim())?.trim();
}

function resolveSupabaseCli() {
  if (cli) return cli;

  if (process.platform === "win32") {
    try {
      const shim = firstLine(
        execFileSync("where.exe", ["supabase.cmd"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          windowsHide: true,
        }),
      );
      const script = shim
        ? path.join(
            path.dirname(shim),
            "node_modules",
            "supabase",
            "dist",
            "supabase.js",
          )
        : null;

      if (script && existsSync(script)) {
        cli = { command: process.execPath, prefix: [script] };
        return cli;
      }
    } catch {
      // Fall through to a standalone executable.
    }

    try {
      const exe = firstLine(
        execFileSync("where.exe", ["supabase.exe"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          windowsHide: true,
        }),
      );
      if (exe && existsSync(exe)) {
        cli = { command: exe, prefix: [] };
        return cli;
      }
    } catch {
      // Fall through to PATH lookup.
    }
  }

  cli = { command: "supabase", prefix: [] };
  return cli;
}

export function runSupabase(args, options = {}) {
  const resolved = resolveSupabaseCli();
  return execFileSync(
    resolved.command,
    [...resolved.prefix, ...args],
    {
      encoding: "utf8",
      windowsHide: true,
      ...options,
    },
  );
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function readLocalSupabaseEnv() {
  if (cached) return cached;

  const output = runSupabase(["status", "-o", "env"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const values = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) values.set(match[1], unquote(match[2]));
  }

  const apiUrl = values.get("API_URL");
  const anonKey = values.get("ANON_KEY");
  const serviceRoleKey = values.get("SERVICE_ROLE_KEY");

  if (!apiUrl || !anonKey || !serviceRoleKey) {
    throw new Error(
      "Local Supabase is not running or did not expose API_URL, ANON_KEY and SERVICE_ROLE_KEY. Start it with `supabase start`.",
    );
  }

  const parsed = new URL(apiUrl);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname)) {
    throw new Error(
      `Refusing to run the admin E2E lane against non-local Supabase host "${parsed.hostname}".`,
    );
  }

  cached = { apiUrl, anonKey, serviceRoleKey };
  return cached;
}
