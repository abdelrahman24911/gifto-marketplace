#!/usr/bin/env node
// Two-session concurrency test for mark_settlement_paid() (P0-03, FIN-001).
//
// Usage:
//   PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=... \
//     node scripts/run-settlement-concurrency.mjs
//
// What it does, all on a DISPOSABLE database (gifto_conc_test) only:
//   1. Drops/creates the database, applies scripts/auth-emulation.sql when
//      the server lacks auth.users, supabase/tests/storage_stub.sql, and
//      supabase/migrations/ in order.
//   2. Runs supabase/tests/concurrency_mark_settlement_paid.sql (setup +
//      sequential mismatch and zero-value cases; the vendor-A settlement
//      is left open and its id is printed as CONCURRENCY_SETTLEMENT_ID).
//   3. Opens TWO concurrent psql sessions as the platform admin and calls
//      mark_settlement_paid() on the SAME settlement at the same time.
//      Expected: exactly one succeeds; the other raises
//      "This settlement is already paid." (23514). No line is paid twice.
//   4. Verifies the final state: settlement paid exactly once, paid_at /
//      paid_by stamped, commission entry untouched.
//   5. Runs supabase/tests/rls_commissions_test.sql afterwards to confirm
//      no regression.
// Never point this script at a hosted or production database.
//
// Exit code: 0 only if every step passes; otherwise 1 with the failing
// step printed.
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DB = "gifto_conc_test";
const ADMIN_ID = "c3110000-0000-0000-0000-0000000000a1";

const env = {
  ...process.env,
  PGHOST: process.env.PGHOST ?? "localhost",
  PGPORT: process.env.PGPORT ?? "5432",
  PGUSER: process.env.PGUSER ?? "postgres",
  PGDATABASE: DB,
};
if (!env.PGPASSWORD) {
  console.error("run-settlement-concurrency: PGPASSWORD must be set (disposable database only).");
  process.exit(2);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: { ...env, ...(opts.env ?? {}) } });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => resolve({ code: 1, out, err: String(e) }));
    child.on("close", (code) => resolve({ code: code ?? 1, out, err }));
  });
}

async function psql(args, db = DB) {
  return run("psql", ["-v", "ON_ERROR_STOP=1", "-d", db, ...args]);
}

function fail(step, detail) {
  console.error(`FAIL: ${step}\n${detail}`);
  process.exit(1);
}

// 1. Fresh disposable database + schema.
console.log("== step 1: fresh disposable database ==");
{
  const drop = await run("dropdb", ["--if-exists", DB]);
  if (drop.code !== 0) fail("dropdb", drop.err);
  const create = await run("createdb", [DB]);
  if (create.code !== 0) fail("createdb", create.err);
  const hasAuth = await psql(["-tAc", "select to_regclass('auth.users')"]);
  if (!hasAuth.out.includes("auth.users")) {
    const em = await psql(["-f", join(ROOT, "scripts/auth-emulation.sql")]);
    if (em.code !== 0) fail("auth emulation", em.err);
  }
  const stub = await psql(["-f", join(ROOT, "supabase/tests/storage_stub.sql")]);
  if (stub.code !== 0) fail("storage stub", stub.err);
  for (const file of readdirSync(join(ROOT, "supabase/migrations")).sort()) {
    const mig = await psql(["-f", join(ROOT, "supabase/migrations", file)]);
    if (mig.code !== 0) fail(`migration ${file}`, mig.err);
  }
  console.log("PASS: migrations applied on disposable database");
}

// 2. Setup + sequential cases.
console.log("== step 2: setup + sequential mismatch / zero-value cases ==");
const setup = await psql([
  "-c", "set gifto.rls_test_disposable = 'yes';",
  "-f", join(ROOT, "supabase/tests/concurrency_mark_settlement_paid.sql"),
]);
process.stdout.write(setup.out);
if (setup.code !== 0) fail("setup / sequential cases", setup.err);
const match = (setup.out + setup.err).match(/CONCURRENCY_SETTLEMENT_ID=([0-9a-f-]{36})/);
if (!match) fail("setup", "CONCURRENCY_SETTLEMENT_ID not printed by the SQL file");
const settlementId = match[1];
console.log(`PASS: sequential cases passed; concurrency settlement ${settlementId}`);

// 3. Two concurrent calls on the same settlement.
console.log("== step 3: two concurrent mark_settlement_paid() calls ==");
const callSql = [
  "set role authenticated;",
  `set request.jwt.claim.sub = '${ADMIN_ID}';`,
  `set request.jwt.claims = '{"sub":"${ADMIN_ID}"}';`,
  // Vendor A's settlement total is 800 (1 x 10000 at 8%). The payout
  // proof (P1-05) must match the derived D-08 amount exactly.
  `select public.mark_settlement_paid('${settlementId}', 800, 'bank_transfer', 'CONC-A-800', 'Weekly commission remittance');`,
].join(" ");
const [a, b] = await Promise.all([
  run("psql", ["-v", "ON_ERROR_STOP=1", "-d", DB, "-c", callSql]),
  run("psql", ["-v", "ON_ERROR_STOP=1", "-d", DB, "-c", callSql]),
]);
const successes = [a, b].filter((r) => r.code === 0).length;
const failures = [a, b].filter((r) => r.code !== 0);
console.log(`session A: exit=${a.code} ${a.err.trim().split("\n").pop() ?? ""}`);
console.log(`session B: exit=${b.code} ${b.err.trim().split("\n").pop() ?? ""}`);
if (successes !== 1) {
  fail("concurrency", `expected exactly one success, got ${successes} (A=${a.code}, B=${b.code})`);
}
if (!failures[0].err.includes("This settlement is already paid.")) {
  fail("concurrency", `losing session did not raise 'already paid': ${failures[0].err}`);
}
console.log("PASS: exactly one session succeeded; the other raised 'This settlement is already paid.'");

// 4. Final state: paid exactly once, stamped, entry untouched.
console.log("== step 4: final state ==");
const state = await psql(["-tAc",
  `select status::text || '|' || (paid_at is not null) || '|' || (paid_by = '${ADMIN_ID}'::uuid) ` +
  `|| '|' || (paid_amount_minor = 800) || '|' || (transfer_reference = 'CONC-A-800') ` +
  `from public.settlements where id = '${settlementId}';`]);
const entry = await psql(["-tAc",
  `select count(*) from public.commission_entries ce join public.settlement_lines l ` +
  `on l.commission_entry_id = ce.id where l.settlement_id = '${settlementId}' and ce.status = 'earned';`]);
if (state.out.trim() !== "paid|true|true|true|true") fail("final state", `settlements row: ${state.out.trim()} (expected paid|true|true|true|true)`);
if (entry.out.trim() !== "1") fail("final state", `earned entries on settlement lines: ${entry.out.trim()} (expected 1)`);
console.log("PASS: settlement paid once, paid_at/paid_by stamped, payout proof recorded, commission entry still earned");

// 5. Commissions suite afterwards (no regression).
console.log("== step 5: rls_commissions_test.sql (no regression) ==");
const suite = await run("bash", ["scripts/run-rls-suites.sh", "supabase/tests/rls_commissions_test.sql"], { env: { ...env, PGDATABASE: DB } });
process.stdout.write(suite.out);
if (suite.code !== 0) fail("rls_commissions_test.sql", suite.err);

console.log("\nFIN-001 RESULT: PASS — mark_settlement_paid() is atomic under two concurrent calls.");
