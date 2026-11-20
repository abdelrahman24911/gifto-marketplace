#!/usr/bin/env node
// Two-session regression test for the H-01 parent-status race (P0-04).
//
// Usage:
//   PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=... \
//     node scripts/run-parent-status-concurrency.mjs
//
// What it does, all on a DISPOSABLE database (gifto_parent_conc_test) only:
//   1. Drops/creates the database, applies scripts/auth-emulation.sql when
//      the server lacks auth.users, supabase/tests/storage_stub.sql, and
//      supabase/migrations/ in order (including migration 31).
//   2. Runs supabase/tests/concurrency_parent_status_test.sql in setup-only
//      mode (order 1 delivered sequentially; order 2 left placed with its
//      ids printed).
//   3. Opens TWO concurrent psql sessions: owner A moves suborder A
//      placed -> confirmed -> shipped -> delivered, while owner B cancels
//      suborder B (placed -> cancelled) at the same time.
//      Expected: parent ends partially_completed — never placed/confirmed.
//   4. Verifies the audit trail: order 2 has 4 order_status_events
//      (3 for A, 1 for B).
//   5. Runs rls_orders_test.sql, rls_order_audit_test.sql and
//      rls_commissions_test.sql afterwards to confirm no regression.
// Never point this script at a hosted or production database.
//
// Exit code: 0 only if every step passes; otherwise 1 with the failing
// step printed.
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DB = "gifto_parent_conc_test";
const OWNER_A = "c2110000-0000-0000-0000-0000000000b1";
const OWNER_B = "c2110000-0000-0000-0000-0000000000b3";

const env = {
  ...process.env,
  PGHOST: process.env.PGHOST ?? "localhost",
  PGPORT: process.env.PGPORT ?? "5432",
  PGUSER: process.env.PGUSER ?? "postgres",
  PGDATABASE: DB,
};
if (!env.PGPASSWORD) {
  console.error("run-parent-status-concurrency: PGPASSWORD must be set (disposable database only).");
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

// 1. Fresh disposable database + schema (migrations 1-31).
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
  console.log("PASS: migrations 1-31 applied on disposable database");
}

// 2. Setup-only run of the regression test file.
console.log("== step 2: setup (order 1 delivered, order 2 placed) ==");
const setup = await psql([
  "-v", "concurrency_setup_only=true",
  "-c", "set gifto.rls_test_disposable = 'yes';",
  "-f", join(ROOT, "supabase/tests/concurrency_parent_status_test.sql"),
]);
process.stdout.write(setup.out);
if (setup.code !== 0) fail("setup", setup.err);
const text = setup.out + setup.err;
const orderId = (text.match(/CONCURRENCY_ORDER_ID=([0-9a-f-]{36})/) ?? [])[1];
const subA = (text.match(/CONCURRENCY_SUBORDER_A=([0-9a-f-]{36})/) ?? [])[1];
const subB = (text.match(/CONCURRENCY_SUBORDER_B=([0-9a-f-]{36})/) ?? [])[1];
if (!orderId || !subA || !subB) fail("setup", "concurrency ids not printed by the SQL file");
console.log(`PASS: setup done; order ${orderId}`);

// 3. Two concurrent transitions on different suborders of the same order.
console.log("== step 3: two concurrent suborder transitions ==");
const callA = [
  "set role authenticated;",
  `set request.jwt.claim.sub = '${OWNER_A}';`,
  `set request.jwt.claims = '{"sub":"${OWNER_A}"}';`,
  `select public.set_order_vendor_status('${subA}', 'confirmed', 'placed');`,
  `select public.set_order_vendor_status('${subA}', 'shipped', 'confirmed');`,
  `select public.set_order_vendor_status('${subA}', 'delivered', 'shipped');`,
].join(" ");
const callB = [
  "set role authenticated;",
  `set request.jwt.claim.sub = '${OWNER_B}';`,
  `set request.jwt.claims = '{"sub":"${OWNER_B}"}';`,
  `select public.set_order_vendor_status('${subB}', 'cancelled', 'placed');`,
].join(" ");
const [a, b] = await Promise.all([
  run("psql", ["-v", "ON_ERROR_STOP=1", "-d", DB, "-c", callA]),
  run("psql", ["-v", "ON_ERROR_STOP=1", "-d", DB, "-c", callB]),
]);
if (a.code !== 0) fail("concurrent transition A (deliver)", a.err);
if (b.code !== 0) fail("concurrent transition B (cancel)", b.err);
console.log("PASS: both concurrent transitions succeeded");

// 4. Parent status + audit trail.
console.log("== step 4: parent status and audit trail ==");
const state = await psql(["-tAc",
  `select status::text from public.orders where id = '${orderId}';`]);
const events = await psql(["-tAc",
  `select count(*) from public.order_status_events where order_id = '${orderId}';`]);
if (state.out.trim() !== "partially_completed") {
  fail("parent status", `parent status=${state.out.trim()} (expected partially_completed)`);
}
if (events.out.trim() !== "4") {
  fail("audit trail", `order_status_events=${events.out.trim()} (expected 4)`);
}
console.log("PASS: parent partially_completed (not placed), 4 audit events recorded");

// 5. Orders, order-audit and commissions suites afterwards (no regression).
console.log("== step 5: rls_orders / rls_order_audit / rls_commissions (no regression) ==");
for (const suite of ["rls_orders_test.sql", "rls_order_audit_test.sql", "rls_commissions_test.sql"]) {
  const r = await run("bash", ["scripts/run-rls-suites.sh", `supabase/tests/${suite}`], { env: { ...env, PGDATABASE: DB } });
  process.stdout.write(r.out);
  if (r.code !== 0) fail(suite, r.err);
}

console.log("\nH-01 RESULT: PASS — concurrent suborder transitions derive the correct parent status.");
