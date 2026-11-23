/**
 * Regression tests for scripts/check-deployment-preflight.mjs.
 *
 * Runs the preflight against a local mock Supabase (no remote calls) and
 * asserts the Storage bucket checks. Run with:
 *   node --test scripts/check-deployment-preflight.test.mjs
 * (Vitest does not pick this up — it only includes src/**\/*.test.ts.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(
  dirname(fileURLToPath(import.meta.url)),
  "check-deployment-preflight.mjs",
);

const GOOD_BUCKETS = {
  "occasion-images": {
    public: true,
    file_size_limit: 5 * 1024 * 1024,
    allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
  },
  "product-images": {
    public: true,
    file_size_limit: 5 * 1024 * 1024,
    allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "image/avif"],
  },
  "vendor-media": {
    public: true,
    file_size_limit: 5 * 1024 * 1024,
    allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "image/avif"],
  },
};

function runPreflight(buckets, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname === "/rest/v1/auth_rate_limits") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end("[]");
      } else if (url.pathname === "/rest/v1/") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ paths: { "/rpc/consume_auth_quota": {} } }));
      } else if (url.pathname === "/rest/v1/occasions") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end("[]");
      } else if (url.pathname.startsWith("/storage/v1/bucket/")) {
        const name = url.pathname.split("/").pop();
        const meta = buckets[name];
        if (!meta) {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ message: "Bucket not found" }));
        } else {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(meta));
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const child = spawn("node", [script, "--json"], {
        cwd: root,
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${port}`,
          SUPABASE_SERVICE_ROLE_KEY: "mock-service-key",
          // Pinned so the tests never depend on the ambient environment;
          // the GIFTO_ENVIRONMENT cases below override it explicitly.
          GIFTO_ENVIRONMENT: "production",
          ...extraEnv,
        },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => {
        stdout += d;
      });
      child.stderr.on("data", (d) => {
        stderr += d;
      });
      child.on("error", (error) => {
        server.close();
        reject(error);
      });
      child.on("close", (status) => {
        server.close();
        if (!stdout.trim()) {
          reject(new Error(`preflight produced no output (stderr: ${stderr})`));
          return;
        }
        resolve({ status, parsed: JSON.parse(stdout) });
      });
    });
  });
}

function bucketChecks(parsed) {
  return parsed.checks.filter((c) => c.name.includes("bucket"));
}

test("all three image buckets pass when correctly configured", async () => {
  const { status, parsed } = await runPreflight(GOOD_BUCKETS);
  const buckets = bucketChecks(parsed);
  assert.equal(status, 0);
  assert.equal(buckets.length, 9);
  assert.deepEqual(
    buckets.filter((c) => c.status !== "ok").map((c) => c.name),
    [],
  );
});

test("a bucket missing a required MIME type and a missing bucket both fail", async () => {
  const bad = structuredClone(GOOD_BUCKETS);
  bad["vendor-media"].allowed_mime_types = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];
  delete bad["product-images"];
  const { status, parsed } = await runPreflight(bad);
  const byName = Object.fromEntries(
    bucketChecks(parsed).map((c) => [c.name, c.status]),
  );
  assert.equal(status, 1);
  assert.equal(byName["vendor-media bucket MIME types"], "fail");
  assert.equal(byName["product-images bucket"], "fail");
  assert.equal(byName["occasion-images bucket"], "ok");
  assert.equal(byName["vendor-media bucket"], "ok");
});

test("GIFTO_ENVIRONMENT=demo records an ok environment check", async () => {
  const { status, parsed } = await runPreflight(GOOD_BUCKETS, {
    GIFTO_ENVIRONMENT: "demo",
  });
  assert.equal(status, 0);
  const check = parsed.checks.find((c) => c.name === "GIFTO_ENVIRONMENT");
  assert.equal(check.status, "ok");
  assert.match(check.detail, /demo/);
});

test("an unknown GIFTO_ENVIRONMENT value fails the gate", async () => {
  const { status, parsed } = await runPreflight(GOOD_BUCKETS, {
    GIFTO_ENVIRONMENT: "live",
  });
  assert.equal(status, 1);
  const check = parsed.checks.find((c) => c.name === "GIFTO_ENVIRONMENT");
  assert.equal(check.status, "fail");
  assert.match(check.detail, /production, staging, demo or development/);
});
