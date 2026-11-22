#!/usr/bin/env bash
# Backup/restore drill against a DISPOSABLE database (P0-02, H-17).
#
# Usage:
#   PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=... \
#     scripts/backup-drill.sh <dump-file.sql> <source-orders> <source-order_vendors> \
#       <source-commission_entries> <source-settlements>
#
# The dump file is a backup produced by the owner (e.g. `pg_dump` of the
# hosted project, or a Supabase backup export). This script:
#   1. Drops and recreates a disposable database (gifto_backup_drill).
#   2. Restores the dump into it — never into production.
#   3. Counts rows on orders, order_vendors, commission_entries, settlements
#      and compares them with the source counts given on the command line.
#   4. Prints RESTORE OK / MISMATCH and the duration.
#
# No backup dump was available in this session (no hosted access), so the
# drill itself is recorded as BLOCKED in docs/HOSTED_STATE.md until the owner
# supplies a dump or dashboard backup access. This script is the runnable
# procedure for that drill — it is not a claim that a drill has happened.
set -euo pipefail

export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGDATABASE="${PGDATABASE:-gifto_backup_drill}"

if [ "$#" -ne 5 ]; then
  echo "usage: $0 <dump-file.sql> <source-orders> <source-order_vendors> <source-commission_entries> <source-settlements>" >&2
  exit 2
fi
if [ -z "${PGPASSWORD:-}" ]; then
  echo "backup-drill: PGPASSWORD must be set (disposable database only)." >&2
  exit 2
fi

DUMP="$1"; SRC_ORDERS="$2"; SRC_SUBORDERS="$3"; SRC_COMMISSIONS="$4"; SRC_SETTLEMENTS="$5"
START="$(date +%s)"

dropdb --if-exists "$PGDATABASE"
createdb "$PGDATABASE"
psql -v ON_ERROR_STOP=1 -f "$DUMP" > /tmp/gifto-backup-drill-restore.log 2>&1

count() { psql -tAc "select count(*) from $1"; }
GOT_ORDERS="$(count orders)"
GOT_SUBORDERS="$(count order_vendors)"
GOT_COMMISSIONS="$(count commission_entries)"
GOT_SETTLEMENTS="$(count settlements)"
END="$(date +%s)"

echo "restore duration: $((END - START))s"
echo "orders:            source=$SRC_ORDERS restored=$GOT_ORDERS"
echo "order_vendors:     source=$SRC_SUBORDERS restored=$GOT_SUBORDERS"
echo "commission_entries: source=$SRC_COMMISSIONS restored=$GOT_COMMISSIONS"
echo "settlements:       source=$SRC_SETTLEMENTS restored=$GOT_SETTLEMENTS"

if [ "$GOT_ORDERS" = "$SRC_ORDERS" ] && [ "$GOT_SUBORDERS" = "$SRC_SUBORDERS" ] \
  && [ "$GOT_COMMISSIONS" = "$SRC_COMMISSIONS" ] && [ "$GOT_SETTLEMENTS" = "$SRC_SETTLEMENTS" ]; then
  echo "RESTORE OK: row counts match source."
else
  echo "RESTORE MISMATCH: restored counts differ from source — investigate before trusting the backup." >&2
  exit 1
fi
