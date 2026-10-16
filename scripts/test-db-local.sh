#!/usr/bin/env bash
# Runs the migration + DB tests in a throwaway PostGIS container (Docker required).
#   npm run test:db
set -euo pipefail
cd "$(dirname "$0")/.."

NAME=pandal-hop-testdb
PORT=${TEST_DB_PORT:-55432}
IMAGE=${TEST_DB_IMAGE:-postgis/postgis:15-3.4}

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "▸ starting $IMAGE on :$PORT"
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres -p "$PORT:5432" "$IMAGE" >/dev/null

export DATABASE_URL="postgresql://postgres:postgres@localhost:$PORT/postgres"
# The image restarts once after initdb, so wait for several consecutive good queries.
ok=0
for _ in $(seq 1 120); do
  if psql "$DATABASE_URL" -qAtc "select 1" >/dev/null 2>&1; then ok=$((ok + 1)); else ok=0; fi
  [[ $ok -ge 3 ]] && break
  sleep 1
done
[[ $ok -ge 3 ]] || { echo "database did not start" >&2; exit 1; }
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q)

echo "▸ supabase shim"
"${PSQL[@]}" -f supabase/tests/local-shim.sql
echo "▸ migration (applied twice to prove it is re-runnable)"
"${PSQL[@]}" -f supabase/migrations/001_init.sql
"${PSQL[@]}" -f supabase/migrations/001_init.sql
echo "▸ moderation / permissions / quota / RPC tests"
out=$("${PSQL[@]}" -f supabase/tests/moderation.sql 2>&1) || { echo "$out" | grep -E "PASS|FAIL|ERROR" ; exit 1; }
echo "$out" | grep -E "PASS|FAIL" | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
echo "▸ concurrency tests"
bash supabase/tests/concurrency.sh
echo "✓ all database tests passed"
