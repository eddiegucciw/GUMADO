#!/usr/bin/env bash
# Runs GUMADO's database test-suite against a throwaway PostgreSQL database.
#
#   ./scripts/test-db.sh                  # uses PG* env vars / local socket
#   PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres ./scripts/test-db.sh
#
# Quick local Postgres:  docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
set -euo pipefail
cd "$(dirname "$0")/.."

DB="${TEST_DB:-gumado_test}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 --set=client_min_messages=warning)

echo "▸ Creating fresh database $DB"
dropdb --if-exists "$DB" >/dev/null 2>&1 || true
createdb "$DB"

echo "▸ Loading Supabase platform stub"
"${PSQL[@]}" -d "$DB" -f db/harness/supabase_stub.sql

echo "▸ Applying migrations"
for f in supabase/migrations/*.sql; do
  echo "   $(basename "$f")"
  "${PSQL[@]}" -d "$DB" -f "$f"
done

"${PSQL[@]}" -d "$DB" -f db/harness/test_helpers.sql

pass=0; failed=0
for t in db/tests/*.sql; do
  name=$(basename "$t")
  if out=$(psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$t" 2>&1); then
    n=$(grep -c 'ok - ' <<<"$out" || true)
    pass=$((pass + n))
    printf '✔ %-38s %3d assertions\n' "$name" "$n"
  else
    failed=$((failed + 1))
    printf '✘ %s\n' "$name"
    grep -E 'ok - |ERROR|not ok' <<<"$out" | sed 's/^/    /' | tail -15
  fi
done

# Concurrency tests need several real connections.
if [[ -x scripts/test-db-concurrency.sh ]]; then
  if scripts/test-db-concurrency.sh "$DB"; then pass=$((pass + 2)); else failed=$((failed + 1)); fi
fi

echo
if (( failed > 0 )); then
  echo "✘ $failed test file(s) failed ($pass assertions passed)"; exit 1
fi
echo "✔ All database tests passed ($pass assertions)"
