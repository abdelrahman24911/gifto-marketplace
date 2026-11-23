#!/usr/bin/env bash
# C1 rehearsal — proves the correction script against disposable databases.
#
# Usage:
#   GIFTO_C1_REHEARSAL_DISPOSABLE=yes \
#   PGHOST=/tmp/gifto-b1-pg PGPORT=54399 PGUSER=postgres PGPASSWORD=dummy \
#   PGDATABASE=gifto_c1_rehearsal scripts/rehearse-c1.sh
#
# The GIFTO_C1_REHEARSAL_DISPOSABLE=yes guard is deliberate: this script
# drops and recreates databases and must never run against a real one.
# It needs psql on PATH and a running disposable Postgres cluster.
# Nothing here touches a hosted database, and no seed data leaves the
# disposable cluster. The batch-1 cluster (/tmp/gifto-b1-pg) works fine.
#
# What it proves, in order:
#   A. Migrations 1–27 + fixtures, C1 applies (guards for the absent
#      migration-30 tables exercised), postconditions hold.
#   B. C1 re-run is a no-op; C1 after 28–35 is a no-op.
#   C. Migrations 36–67 then apply cleanly on the corrected rows, and
#      both targets stay open under the proof constraint.
#   D. Negative: a tampered total makes C1 abort with nothing changed.
#   E. Negative: C1 after migration 36 aborts (pre-36 guard).
#   F. Round-trip: C1 -> rollback (pre-36) restores paid -> C1 applies again.
#   G. Skip path: no targets at all -> NOTICE, no-op, exit 0.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGDATABASE="${PGDATABASE:-gifto_c1_rehearsal}"
WORKDIR="${REHEARSE_C1_WORKDIR:-$(mktemp -d /tmp/gifto-c1-rehearsal.XXXXXX)}"

if [ "${GIFTO_C1_REHEARSAL_DISPOSABLE:-}" != "yes" ]; then
  echo "rehearse-c1: refusing to run without GIFTO_C1_REHEARSAL_DISPOSABLE=yes (disposable database only)." >&2
  exit 2
fi
if [ -z "${PGPASSWORD:-}" ]; then
  echo "rehearse-c1: PGPASSWORD must be set (disposable database only)." >&2
  exit 2
fi

# Rollback SQL must never be executed as a forward migration.
if find "$ROOT/supabase/migrations" -maxdepth 1 -type f -iname '*rollback*' | grep -q .; then
  echo "rehearse-c1: rollback SQL found in supabase/migrations; move it to supabase/rollbacks/." >&2
  exit 2
fi

mkdir -p "$WORKDIR"
echo "rehearse-c1: workdir $WORKDIR"

fail() { echo "rehearse-c1 FAIL: $*" >&2; exit 1; }
ok() { echo "rehearse-c1 ok: $*"; }

# assert_eq <label> <expected> <actual>
assert_eq() {
  if [ "$2" != "$3" ]; then fail "$1 (expected '$2', got '$3')"; fi
  ok "$1"
}

# fresh_db <name> — drop + create + auth emulation + storage stub.
fresh_db() {
  local db="$1"
  psql -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists \"$db\"" > /dev/null
  psql -d postgres -v ON_ERROR_STOP=1 -c "create database \"$db\"" > /dev/null
  PGDATABASE="$db" psql -v ON_ERROR_STOP=1 -f "$ROOT/scripts/auth-emulation.sql" > /dev/null
  PGDATABASE="$db" psql -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/storage_stub.sql" > /dev/null
  ok "fresh database $db"
}

# apply_migrations <db> <first> <last> — inclusive numeric range.
apply_migrations() {
  local db="$1" first="$2" last="$3" f num
  for f in "$ROOT"/supabase/migrations/*.sql; do
    num="${f##*/}"
    num="${num:0:14}"
    num="$((10#$num))"
    if [ "$num" -ge "$first" ] && [ "$num" -le "$last" ]; then
      PGDATABASE="$db" psql -v ON_ERROR_STOP=1 -f "$f" > "$WORKDIR/migrate-$db-$num.log" 2>&1 \
        || { tail -20 "$WORKDIR/migrate-$db-$num.log" >&2; fail "migration $num failed on $db"; }
    fi
  done
  ok "migrations $first-$last applied on $db"
}

# q <db> <sql> — single-value query.
q() { PGDATABASE="$1" psql -tAc "$2"; }

# run_c1 <db> <outfile> — returns 0 on success, 1 on abort (output kept).
run_c1() {
  PGDATABASE="$1" psql -v ON_ERROR_STOP=1 \
    -f "$ROOT/supabase/corrections/20261123_c1_synthetic_settlement_correction.sql" \
    > "$2" 2>&1
}

# run_rollback <db> <outfile>
run_rollback() {
  PGDATABASE="$1" psql -v ON_ERROR_STOP=1 \
    -f "$ROOT/supabase/corrections/20261123_c1_rollback_pre36_only.sql" \
    > "$2" 2>&1
}

# assert_targets <db> <label> <status> <paid_at-null?> — both targets.
assert_targets() {
  local db="$1" label="$2" status="$3"
  assert_eq "$label: both targets are $status" "2" \
    "$(q "$db" "select count(*) from public.settlements where id in ('2c589855-3f11-4708-a8c3-7738ffa25e80','7cadf821-22a4-409f-9617-6bfae5124b6e') and status = '$status'")"
  assert_eq "$label: totals preserved (785260)" "785260" \
    "$(q "$db" "select coalesce(sum(total_minor),0) from public.settlements where id in ('2c589855-3f11-4708-a8c3-7738ffa25e80','7cadf821-22a4-409f-9617-6bfae5124b6e')")"
}

assert_postconditions() {
  local db="$1" label="$2"
  assert_eq "$label: paid_at cleared on both" "2" \
    "$(q "$db" "select count(*) from public.settlements where id in ('2c589855-3f11-4708-a8c3-7738ffa25e80','7cadf821-22a4-409f-9617-6bfae5124b6e') and paid_at is null and paid_by is null")"
  assert_eq "$label: 11 target lines, sum 785260" "11|785260" \
    "$(q "$db" "select count(*) || '|' || coalesce(sum(amount_minor),0) from public.settlement_lines where settlement_id in ('2c589855-3f11-4708-a8c3-7738ffa25e80','7cadf821-22a4-409f-9617-6bfae5124b6e')")"
  assert_eq "$label: 11 earned commissions" "11" \
    "$(q "$db" "select count(*) from public.commission_entries ce join public.settlement_lines l on l.commission_entry_id = ce.id where l.settlement_id in ('2c589855-3f11-4708-a8c3-7738ffa25e80','7cadf821-22a4-409f-9617-6bfae5124b6e') and ce.status = 'earned'")"
  assert_eq "$label: 11 delivered suborders" "11" \
    "$(q "$db" "select count(*) from public.order_vendors ov join public.commission_entries ce on ce.order_vendor_id = ov.id join public.settlement_lines l on l.commission_entry_id = ce.id where l.settlement_id in ('2c589855-3f11-4708-a8c3-7738ffa25e80','7cadf821-22a4-409f-9617-6bfae5124b6e') and ov.status = 'delivered'")"
  assert_eq "$label: no paid settlement remains" "0" \
    "$(q "$db" "select count(*) from public.settlements where status = 'paid'")"
  assert_eq "$label: Cairo open settlement untouched" "1" \
    "$(q "$db" "select count(*) from public.settlements where id = 'd1e74ebf-7b72-4195-93ae-bb1c08c7c7b4' and status = 'open' and total_minor = 269250")"
}

# ===========================================================================
# A. Migrations 1–27 + fixtures, C1 applies (migration-30 tables absent)
# ===========================================================================
DB_A="${PGDATABASE}"
fresh_db "$DB_A"
apply_migrations "$DB_A" 1 27
PGDATABASE="$DB_A" psql -v ON_ERROR_STOP=1 -f "$ROOT/scripts/rehearse-c1-seed.sql" > "$WORKDIR/seed-a.log" 2>&1
grep -q "17 lines" "$WORKDIR/seed-a.log" || fail "seed did not create 17 lines (see $WORKDIR/seed-a.log)"
ok "fixtures seeded on $DB_A (migrations 1–27)"

run_c1 "$DB_A" "$WORKDIR/c1-a.log"
grep -q "C1 applied" "$WORKDIR/c1-a.log" || { cat "$WORKDIR/c1-a.log" >&2; fail "C1 did not apply on $DB_A"; }
grep -q '"line_count": 11' "$WORKDIR/c1-a.log" || fail "snapshot missing line_count 11 (see $WORKDIR/c1-a.log)"
grep -q '"line_sum": 785260' "$WORKDIR/c1-a.log" || fail "snapshot missing line_sum 785260"
ok "C1 applied at migration-27 state; snapshot captured"
assert_targets "$DB_A" "A" "open"
assert_postconditions "$DB_A" "A"

# ===========================================================================
# B. Idempotency: C1 re-run is a no-op; still a no-op after 28–35
# ===========================================================================
run_c1 "$DB_A" "$WORKDIR/c1-a2.log"
grep -q "C1 already applied" "$WORKDIR/c1-a2.log" || { cat "$WORKDIR/c1-a2.log" >&2; fail "C1 re-run was not a no-op"; }
ok "C1 re-run is a no-op"
assert_targets "$DB_A" "B" "open"

apply_migrations "$DB_A" 28 35
run_c1 "$DB_A" "$WORKDIR/c1-a3.log"
grep -q "C1 already applied" "$WORKDIR/c1-a3.log" || { cat "$WORKDIR/c1-a3.log" >&2; fail "C1 after 28–35 was not a no-op"; }
ok "C1 still a no-op after migrations 28–35"

# ===========================================================================
# C. Migrations 36–67 apply cleanly on the corrected rows
# ===========================================================================
apply_migrations "$DB_A" 36 67
assert_eq "C: proof constraint exists" "1" \
  "$(q "$DB_A" "select count(*) from pg_constraint where conname = 'settlements_payout_proof_matches'")"
assert_targets "$DB_A" "C" "open"
assert_postconditions "$DB_A" "C"
ok "migrations 36–67 apply cleanly on corrected rows"

# ===========================================================================
# D. Negative: tampered total aborts C1 with nothing changed
# ===========================================================================
DB_D="${PGDATABASE}_neg"
fresh_db "$DB_D"
apply_migrations "$DB_D" 1 35
PGDATABASE="$DB_D" psql -v ON_ERROR_STOP=1 -f "$ROOT/scripts/rehearse-c1-seed.sql" > /dev/null
PGDATABASE="$DB_D" psql -v ON_ERROR_STOP=1 -c \
  "update public.settlements set total_minor = 305761 where id = '2c589855-3f11-4708-a8c3-7738ffa25e80'" > /dev/null
if run_c1 "$DB_D" "$WORKDIR/c1-d.log"; then
  fail "C1 applied despite a tampered total"
fi
grep -q "C1 aborted" "$WORKDIR/c1-d.log" || { cat "$WORKDIR/c1-d.log" >&2; fail "C1 abort message missing"; }
ok "C1 aborted on tampered total"
assert_eq "D: both settlements still paid" "2" \
  "$(q "$DB_D" "select count(*) from public.settlements where id in ('2c589855-3f11-4708-a8c3-7738ffa25e80','7cadf821-22a4-409f-9617-6bfae5124b6e') and status = 'paid'")"
assert_eq "D: tampered total untouched" "305761" \
  "$(q "$DB_D" "select total_minor from public.settlements where id = '2c589855-3f11-4708-a8c3-7738ffa25e80'")"

# ===========================================================================
# E. Negative: C1 after migration 36 aborts (pre-36 guard)
# ===========================================================================
if run_c1 "$DB_A" "$WORKDIR/c1-e.log"; then
  fail "C1 applied after migration 36"
fi
grep -q "migration 36 is already applied" "$WORKDIR/c1-e.log" || { cat "$WORKDIR/c1-e.log" >&2; fail "pre-36 guard message missing"; }
ok "C1 aborts after migration 36 (pre-36 guard)"

# ===========================================================================
# F. Round-trip: C1 -> rollback restores paid -> C1 applies again
# ===========================================================================
DB_F="${PGDATABASE}_rt"
fresh_db "$DB_F"
apply_migrations "$DB_F" 1 35
PGDATABASE="$DB_F" psql -v ON_ERROR_STOP=1 -f "$ROOT/scripts/rehearse-c1-seed.sql" > /dev/null
run_c1 "$DB_F" "$WORKDIR/c1-f1.log"
grep -q "C1 applied" "$WORKDIR/c1-f1.log" || fail "C1 did not apply on $DB_F"
assert_targets "$DB_F" "F1" "open"
run_rollback "$DB_F" "$WORKDIR/rb-f.log"
grep -q "C1 rollback applied" "$WORKDIR/rb-f.log" || { cat "$WORKDIR/rb-f.log" >&2; fail "rollback did not restore paid"; }
assert_eq "F: both targets paid again with original values" "2" \
  "$(q "$DB_F" "select count(*) from public.settlements where id in ('2c589855-3f11-4708-a8c3-7738ffa25e80','7cadf821-22a4-409f-9617-6bfae5124b6e') and status = 'paid' and paid_at = '2026-11-11T16:00:00Z' and paid_by = '15a1e4f6-2abf-480e-acea-ec47d01dea86'")"
run_c1 "$DB_F" "$WORKDIR/c1-f2.log"
grep -q "C1 applied" "$WORKDIR/c1-f2.log" || fail "C1 did not re-apply after rollback"
assert_targets "$DB_F" "F2" "open"
ok "round-trip C1 -> rollback -> C1 works"

# ===========================================================================
# G. Skip path: no targets at all
# ===========================================================================
DB_G="${PGDATABASE}_empty"
fresh_db "$DB_G"
apply_migrations "$DB_G" 1 35
run_c1 "$DB_G" "$WORKDIR/c1-g.log"
grep -q "C1 skipped" "$WORKDIR/c1-g.log" || { cat "$WORKDIR/c1-g.log" >&2; fail "C1 skip notice missing"; }
assert_eq "G: still no settlements" "0" "$(q "$DB_G" "select count(*) from public.settlements")"
ok "C1 skips cleanly when no targets exist"

echo
echo "rehearse-c1: ALL CHECKS PASSED (workdir $WORKDIR)"
echo "rehearse-c1: databases left in place for inspection: $DB_A $DB_D $DB_F $DB_G"
