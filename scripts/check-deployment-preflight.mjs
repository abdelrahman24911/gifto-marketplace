import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const envFiles = [".env.local", ".env"];
const fileEnv = {};
const timeoutMs = 10_000;
const appImageLimitBytes = 5 * 1024 * 1024;
const requiredMimeTypes = ["image/jpeg", "image/png", "image/webp"];
const checks = [];
const jsonOutput = process.argv.includes("--json");

async function loadEnvFile(file) {
  let raw;
  try {
    raw = await readFile(join(root, file), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(
      /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/,
    );
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fileEnv[match[1]] = value;
  }
}

for (const file of envFiles) {
  await loadEnvFile(file);
}

const processEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([, value]) => value !== undefined && value !== "",
  ),
);
const env = { ...fileEnv, ...processEnv };

function record(status, name, detail) {
  checks.push({ status, name, detail });
}

function envValue(name) {
  const value = env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeSupabaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use http or https.");
  }
  if (url.protocol === "http:" && !/^(localhost|127\.0\.0\.1)$/.test(url.hostname)) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must use https outside localhost.",
    );
  }
  return url.toString().replace(/\/$/, "");
}

function safeError(text) {
  if (!text) return "no response body";
  try {
    const parsed = JSON.parse(text);
    const parts = [parsed.code, parsed.message, parsed.hint].filter(
      (value) => typeof value === "string" && value.trim(),
    );
    if (parts.length > 0) return parts.join(": ").slice(0, 400);
  } catch {
    return text.replace(/\s+/g, " ").slice(0, 400);
  }
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  return { response, text };
}

const supabaseUrlValue = envValue("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = envValue("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrlValue) {
  record("fail", "environment", "NEXT_PUBLIC_SUPABASE_URL is missing.");
}

if (!serviceRoleKey) {
  record(
    "fail",
    "environment",
    "SUPABASE_SERVICE_ROLE_KEY is missing; preflight needs read-only service access.",
  );
}

let supabaseUrl = null;
if (supabaseUrlValue) {
  try {
    supabaseUrl = normalizeSupabaseUrl(supabaseUrlValue);
  } catch (error) {
    record(
      "fail",
      "environment",
      error instanceof Error ? error.message : String(error),
    );
  }
}

if (supabaseUrl && serviceRoleKey) {
  record("ok", "environment", `Supabase target ${new URL(supabaseUrl).host}.`);

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
  };

  try {
    const table = await request(
      `${supabaseUrl}/rest/v1/auth_rate_limits?select=bucket&limit=1`,
      { headers },
    );
    if (table.response.ok) {
      record(
        "ok",
        "migration 39 table",
        "public.auth_rate_limits is reachable through the REST API.",
      );
    } else {
      record(
        "fail",
        "migration 39 table",
        `public.auth_rate_limits is missing or inaccessible (${table.response.status}): ${safeError(table.text)}`,
      );
    }
  } catch (error) {
    record(
      "fail",
      "migration 39 table",
      `Request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const openapi = await request(`${supabaseUrl}/rest/v1/`, {
      headers: { ...headers, Accept: "application/openapi+json" },
    });
    if (!openapi.response.ok) {
      record(
        "fail",
        "migration 39 RPC",
        `Could not read the PostgREST schema (${openapi.response.status}): ${safeError(openapi.text)}`,
      );
    } else {
      let schema;
      try {
        schema = JSON.parse(openapi.text);
      } catch {
        record(
          "fail",
          "migration 39 RPC",
          "PostgREST returned a schema that was not JSON.",
        );
      }
      if (schema) {
        const paths = schema.paths && typeof schema.paths === "object"
          ? Object.keys(schema.paths)
          : [];
        if (paths.includes("/rpc/consume_auth_quota")) {
          record(
            "ok",
            "migration 39 RPC",
            "public.consume_auth_quota is present in the PostgREST schema.",
          );
        } else {
          record(
            "fail",
            "migration 39 RPC",
            "public.consume_auth_quota is absent from the PostgREST schema; apply migration 39 and reload the schema cache.",
          );
        }
      }
    }
  } catch (error) {
    record(
      "fail",
      "migration 39 RPC",
      `Request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const coreTable = await request(
      `${supabaseUrl}/rest/v1/occasions?select=id&limit=1`,
      { headers },
    );
    if (coreTable.response.ok) {
      record("ok", "occasion schema", "public.occasions is reachable.");
    } else {
      record(
        "fail",
        "occasion schema",
        `public.occasions is missing or inaccessible (${coreTable.response.status}): ${safeError(coreTable.text)}`,
      );
    }
  } catch (error) {
    record(
      "fail",
      "occasion schema",
      `Request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const bucket = await request(
      `${supabaseUrl}/storage/v1/bucket/occasion-images`,
      { headers },
    );
    if (!bucket.response.ok || !bucket.text) {
      record(
        "fail",
        "occasion-images bucket",
        `Bucket metadata is missing or inaccessible (${bucket.response.status}): ${safeError(bucket.text)}`,
      );
    } else {
      let metadata;
      try {
        metadata = JSON.parse(bucket.text);
      } catch {
        record("fail", "occasion-images bucket", "Bucket metadata was not JSON.");
      }

      if (metadata) {
        if (metadata.public !== true) {
          record(
            "fail",
            "occasion-images bucket",
            "Bucket is not public; stored occasion images will not render.",
          );
        } else {
          record("ok", "occasion-images bucket", "Bucket is public.");
        }

        if (typeof metadata.file_size_limit === "number") {
          if (metadata.file_size_limit < appImageLimitBytes) {
            record(
              "fail",
              "occasion-images bucket",
              `Bucket limit ${metadata.file_size_limit} B is below the app limit ${appImageLimitBytes} B.`,
            );
          } else {
            record(
              "ok",
              "occasion-images bucket size",
              `Upload limit ${metadata.file_size_limit} B covers the app limit.`,
            );
          }
        } else {
          record(
            "warn",
            "occasion-images bucket size",
            "Bucket has no explicit file_size_limit; verify the app-level 5 MB check is enough for your Storage plan.",
          );
        }

        const allowed = Array.isArray(metadata.allowed_mime_types)
          ? metadata.allowed_mime_types
          : null;
        if (allowed) {
          const missing = requiredMimeTypes.filter(
            (type) => !allowed.includes(type),
          );
          if (missing.length > 0) {
            record(
              "fail",
              "occasion-images bucket MIME types",
              `Bucket rejects required types: ${missing.join(", ")}.`,
            );
          } else {
            record(
              "ok",
              "occasion-images bucket MIME types",
              "JPEG, PNG and WebP are allowed.",
            );
          }
        } else {
          record(
            "warn",
            "occasion-images bucket MIME types",
            "Bucket has no explicit allowed_mime_types; the app still validates images.",
          );
        }
      }
    }
  } catch (error) {
    record(
      "fail",
      "occasion-images bucket",
      `Request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  record(
    "warn",
    "Storage RLS",
    "Bucket metadata cannot prove storage.objects policies. Verify the read/upload/update/delete policies with a read-only SQL check before deploy.",
  );
}

const failures = checks.filter((check) => check.status === "fail");
const warnings = checks.filter((check) => check.status === "warn");

if (jsonOutput) {
  console.log(
    JSON.stringify(
      {
        ok: failures.length === 0,
        target: supabaseUrl,
        failures: failures.length,
        warnings: warnings.length,
        checks,
      },
      null,
      2,
    ),
  );
} else {
  for (const check of checks) {
    const label =
      check.status === "ok"
        ? "OK"
        : check.status === "warn"
          ? "WARN"
          : "FAIL";
    console.log(`[${label}] ${check.name}: ${check.detail}`);
  }
  console.log(
    failures.length === 0
      ? `Deployment preflight passed with ${warnings.length} warning(s).`
      : `Deployment preflight failed: ${failures.length} required check(s) failed.`,
  );
}

if (failures.length > 0) {
  process.exitCode = 1;
}
