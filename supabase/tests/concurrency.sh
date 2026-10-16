#!/usr/bin/env bash
# Two real sessions race to insert past a quota; exactly one must win.
# Requires DATABASE_URL (a postgres/superuser connection). Creates rows for a dedicated
# test user and deletes them afterwards, so it is safe on a dev Supabase project too.
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL}"

U=00000000-0000-4000-8000-0000000000cc
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qAt)

cleanup() {
  "${PSQL[@]}" -c "delete from public.pandals where created_by = '$U'; delete from public.pandal_flags where user_id = '$U'; delete from public.photo_flags where user_id = '$U'; delete from public.submission_log where user_id = '$U'; delete from public.storage_cleanup where path like '$U/%'; delete from auth.users where id = '$U';" >/dev/null
}
trap cleanup EXIT
cleanup

"${PSQL[@]}" <<SQL >/dev/null
insert into auth.users (id, email) values ('$U', 'race@test.local');
-- 9 pandals already today → exactly one more is allowed.
insert into public.pandals (name, location, created_by)
select 'RACE ' || g, extensions.st_setsrid(extensions.st_makepoint(91 + g * 0.01, 12), 4326)::extensions.geography, '$U'
from generate_series(1, 9) g;
insert into public.submission_log (user_id, kind, pandal_id) select '$U', 'pandal', id from public.pandals where created_by = '$U';
SQL

attempt() {
  # Each session holds its transaction open for a moment so the two genuinely overlap.
  psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 <<SQL 2>&1
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"$U","role":"authenticated"}', true);
insert into public.pandals (name, location) values ('RACE $1', 'SRID=4326;POINT(91.5 12)');
select pg_sleep(1.5);
commit;
SQL
}

attempt A > /tmp/pandal-race-a.log & PA=$!
sleep 0.2
attempt B > /tmp/pandal-race-b.log & PB=$!
wait $PA || true
wait $PB || true

n=$("${PSQL[@]}" -c "select count(*) from public.pandals where created_by = '$U'")
quota_errors=$(cat /tmp/pandal-race-a.log /tmp/pandal-race-b.log | grep -c QUOTA_PANDAL || true)
rm -f /tmp/pandal-race-a.log /tmp/pandal-race-b.log

if [[ "$n" == "10" && "$quota_errors" == "1" ]]; then
  echo "  PASS: concurrent inserts past the pandal quota — exactly one succeeded (10 total)"
else
  echo "  FAIL: expected 10 pandals and 1 quota error, got $n pandals and $quota_errors errors" >&2
  exit 1
fi

# Flags: 19 already (pandal+photo); two concurrent flags of different kinds → one wins.
"${PSQL[@]}" <<SQL >/dev/null
insert into public.pandals (name, location, created_by)
select 'RACEF ' || g, extensions.st_setsrid(extensions.st_makepoint(92 + g * 0.01, 12), 4326)::extensions.geography, '$U'
from generate_series(1, 21) g;
insert into public.photos (pandal_id, user_id, storage_path)
select id, '$U', '$U/' || id || '/race.jpg' from public.pandals where name = 'RACEF 21';
insert into public.pandal_flags (target_id, user_id, reason)
select id, '$U', 'spam' from public.pandals where name like 'RACEF %' and name not in ('RACEF 20', 'RACEF 21') order by name limit 19;
insert into public.submission_log (user_id, kind) select '$U', 'flag' from generate_series(1, 19);
SQL

flag() {
  psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 <<SQL 2>&1
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"$U","role":"authenticated"}', true);
$1
select pg_sleep(1.5);
commit;
SQL
}
flag "insert into public.pandal_flags (target_id, reason) select id, 'spam' from public.pandals where name = 'RACEF 20';" > /tmp/pandal-race-a.log & PA=$!
sleep 0.2
flag "insert into public.photo_flags (target_id, reason) select id, 'spam' from public.photos where storage_path like '$U/%/race.jpg';" > /tmp/pandal-race-b.log & PB=$!
wait $PA || true
wait $PB || true

n=$("${PSQL[@]}" -c "select (select count(*) from public.pandal_flags where user_id = '$U') + (select count(*) from public.photo_flags where user_id = '$U')")
quota_errors=$(cat /tmp/pandal-race-a.log /tmp/pandal-race-b.log | grep -c QUOTA_FLAG || true)
rm -f /tmp/pandal-race-a.log /tmp/pandal-race-b.log
if [[ "$n" == "20" && "$quota_errors" == "1" ]]; then
  echo "  PASS: concurrent pandal+photo flags past the combined quota — exactly one succeeded (20 total)"
else
  echo "  FAIL: expected 20 flags and 1 quota error, got $n flags and $quota_errors errors" >&2
  exit 1
fi
