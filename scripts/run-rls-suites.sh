#!/usr/bin/env bash
# Run all Gifto RLS suites against a disposable Postgres (P0-02, H-17).
#
# Usage:
#   PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=... PGDATABASE=gifto_rls_test \
#     scripts/run-rls-suites.sh [suite-file ...]
#
# With no arguments, runs every supabase/tests/*_test.sql file (13 suites at
# HEAD 34f30a6 + any added later — the list is discovered, never hardcoded).
#
# Requirements:
#   - A DISPOSABLE database only. The suites are destructive and refuse to run
#     unless gifto.rls_test_disposable = 'yes' is set in the psql session.
#     Never point this script at a hosted or production database.
#   - psql on PATH. Migrations are applied as $PGUSER; the storage stub and
#     the auth emulation (plain-Postgres only) are applied first.
#   - Each suite runs against a fresh schema: public is dropped and all
#     migrations re-applied before every suite, per the README recipe, because
#     some assertions use exact row counts.
#
# Exit code: non-zero if any suite fails; the failing suite name is printed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGDATABASE="${PGDATABASE:-gifto_rls_test}"

if [ -z "${PGPASSWORD:-}" ]; then
  echo "run-rls-suites: PGPASSWORD must be set (disposable database only)." >&2
  exit 2
fi

SUITES=()
if [ "$#" -gt 0 ]; then
  SUITES=("$@")
else
  # shellcheck disable=SC2207
  SUITES=($(ls "$ROOT"/supabase/tests/*_test.sql | sort))
fi

psql_flags=(-v ON_ERROR_STOP=1)

apply_schema() {
  # Auth emulation only when the server does not already provide auth.users
  # (the supabase/postgres image does; plain Postgres does not).
  if ! psql -tAc "select to_regclass('auth.users')" | grep -qx "auth.users"; then
    psql -v ON_ERROR_STOP=1 -f "$ROOT/scripts/auth-emulation.sql" > /dev/null
  fi
  psql -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/storage_stub.sql" > /dev/null
  for migration in "$ROOT"/supabase/migrations/*.sql; do
    psql -v ON_ERROR_STOP=1 -f "$migration" > /dev/null
  done
}

reset_schema() {
  psql -v ON_ERROR_STOP=1 -c "drop schema if exists public cascade; create schema public; grant usage on schema public to anon, authenticated, service_role;" > /dev/null
}

failures=0
# The per-suite reset grants usage on public to the API roles, so the roles
# must exist before the first reset. On plain Postgres the auth emulation
# creates them; on the supabase/postgres image they already exist.
if ! psql -tAc "select to_regclass('auth.users')" | grep -qx "auth.users"; then
  psql -v ON_ERROR_STOP=1 -f "$ROOT/scripts/auth-emulation.sql" > /dev/null
fi
for suite in "${SUITES[@]}"; do
  name="$(basename "$suite")"
  echo "=== RLS suite: $name ==="
  reset_schema
  apply_schema
  if psql "${psql_flags[@]}" -c "set gifto.rls_test_disposable = 'yes';" -f "$suite" > "/tmp/gifto-rls-$name.log" 2>&1; then
    echo "PASS: $name"
  else
    echo "FAIL: $name (see /tmp/gifto-rls-$name.log)" >&2
    tail -20 "/tmp/gifto-rls-$name.log" >&2
    failures=$((failures + 1))
  fi
done

echo "RLS suites run: ${#SUITES[@]}, failed: $failures"
[ "$failures" -eq 0 ]
