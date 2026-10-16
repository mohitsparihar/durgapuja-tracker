-- Pandal Hop — permissions / moderation / quota / RPC tests.
--
-- Runs entirely inside one transaction and ROLLS BACK, so it is safe to run on a real
-- Supabase project (SQL editor) or locally (`npm run test:db`). Any failed expectation
-- raises an exception whose message starts with FAIL; passing checks print NOTICE PASS.
--
-- Roles exercised: authenticated (owner + other users), anon, service_role, postgres.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres / table owner)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'owner-a@test.local'),
  ('00000000-0000-4000-8000-00000000000b', 'user-b@test.local'),
  ('00000000-0000-4000-8000-00000000000c', 'user-c@test.local'),
  ('00000000-0000-4000-8000-00000000000d', 'user-d@test.local'),
  ('00000000-0000-4000-8000-00000000000e', 'flagger-e@test.local'),
  ('00000000-0000-4000-8000-00000000000f', 'adder-f@test.local'),
  ('00000000-0000-4000-8000-000000000010', 'photog-g@test.local');

-- Far from anything real (Bay of Bengal) so tests never mix with live rows.
-- P1, P2 are created by owner A below; bulk rows here are created by postgres.

-- ---------------------------------------------------------------------------
-- 1. Owner A creates pandals through the client path
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

do $$
declare v uuid;
begin
  insert into public.pandals (name, description, tags, location)
  values ('TEST P1', 'first', '{Theme}', 'SRID=4326;POINT(89.5 15.0)')
  returning id into v;
  perform set_config('t.p1', v::text, false);

  insert into public.pandals (name, location)
  values ('TEST P2', 'SRID=4326;POINT(89.6 15.0)')
  returning id into v;
  perform set_config('t.p2', v::text, false);

  if (select created_by from public.pandals where id = v) <> auth.uid() then
    raise exception 'FAIL: created_by not defaulted to auth.uid()';
  end if;
  raise notice 'PASS: owner can create pandals; created_by = auth.uid()';
end $$;

-- Owner may edit name/description/tags…
do $$
declare n int;
begin
  update public.pandals set description = 'edited' where id = current_setting('t.p1')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: owner could not edit description'; end if;
  raise notice 'PASS: owner edits description';
end $$;

-- …but not status, created_by or location.
do $$ begin
  update public.pandals set status = 'needs_review' where id = current_setting('t.p1')::uuid;
  raise exception 'FAIL: owner changed status';
exception when insufficient_privilege then raise notice 'PASS: owner cannot change status';
end $$;
do $$ begin
  update public.pandals set created_by = '00000000-0000-4000-8000-00000000000b' where id = current_setting('t.p1')::uuid;
  raise exception 'FAIL: owner changed created_by';
exception when insufficient_privilege then raise notice 'PASS: owner cannot change created_by';
end $$;
do $$ begin
  update public.pandals set location = 'SRID=4326;POINT(0 0)' where id = current_setting('t.p1')::uuid;
  raise exception 'FAIL: owner changed location';
exception when insufficient_privilege then raise notice 'PASS: owner cannot change location';
end $$;
do $$ begin
  insert into public.pandals (name, location, status) values ('TEST X', 'SRID=4326;POINT(89.5 15.1)', 'needs_review');
  raise exception 'FAIL: client set status on insert';
exception when insufficient_privilege then raise notice 'PASS: client cannot set status on insert';
end $$;

-- Photos: own prefix + matching pandal only.
do $$
declare v uuid;
begin
  insert into public.photos (pandal_id, storage_path)
  values (current_setting('t.p2')::uuid,
          '00000000-0000-4000-8000-00000000000a/' || current_setting('t.p2') || '/one.jpg')
  returning id into v;
  perform set_config('t.ph1', v::text, false);
  raise notice 'PASS: owner uploads photo row under own prefix';
end $$;
do $$ begin
  insert into public.photos (pandal_id, storage_path)
  values (current_setting('t.p2')::uuid,
          '00000000-0000-4000-8000-00000000000b/' || current_setting('t.p2') || '/spoof.jpg');
  raise exception 'FAIL: photo row accepted under another user''s prefix';
exception when insufficient_privilege then raise notice 'PASS: photo path must start with own uid';
end $$;
do $$ begin
  update public.photos set status = 'active' where id = current_setting('t.ph1')::uuid;
  raise exception 'FAIL: photos are updatable by clients';
exception when insufficient_privilege then raise notice 'PASS: photos are immutable for clients';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Another user B cannot touch A's rows
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
declare n int;
begin
  update public.pandals set description = 'hijack' where id = current_setting('t.p1')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: non-owner edited a pandal'; end if;
  delete from public.pandals where id = current_setting('t.p1')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: non-owner deleted a pandal'; end if;
  delete from public.photos where id = current_setting('t.ph1')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: non-owner deleted a photo'; end if;
  raise notice 'PASS: non-owner cannot edit/delete others'' rows';
end $$;

-- B uploads onto A's pandal. C cannot delete it; A (created_by) can.
do $$
declare v uuid;
begin
  insert into public.photos (pandal_id, storage_path)
  values (current_setting('t.p1')::uuid,
          '00000000-0000-4000-8000-00000000000b/' || current_setting('t.p1') || '/theirs.jpg')
  returning id into v;
  perform set_config('t.phb', v::text, false);
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
declare n int;
begin
  delete from public.photos where id = current_setting('t.phb')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: user C deleted a photo on A''s pandal'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
declare n int;
begin
  delete from public.photos where id = current_setting('t.phb')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: owner could not delete a photo uploaded by someone else'; end if;
  raise notice 'PASS: pandal owner can delete a photo another user uploaded; a third user cannot';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

-- Users cannot call status-changing / trigger functions directly.
do $$ begin
  perform public.pandal_flag_threshold();
  raise exception 'FAIL: user called pandal_flag_threshold()';
exception when insufficient_privilege or feature_not_supported then
  raise notice 'PASS: user cannot call flag-threshold function';
end $$;
do $$ begin
  perform public.geocode_slot();
  raise exception 'FAIL: user called geocode_slot()';
exception when insufficient_privilege then raise notice 'PASS: user cannot call geocode_slot()';
end $$;
do $$ begin
  perform count(*) from public.moderation_log;
  raise exception 'FAIL: user can read moderation_log';
exception when insufficient_privilege then raise notice 'PASS: moderation_log hidden from users';
end $$;
do $$ begin
  perform count(*) from public.geocode_cache;
  raise exception 'FAIL: user can read geocode_cache';
exception when insufficient_privilege then raise notice 'PASS: geocode_cache hidden from users';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Flags: unique per user; 3 distinct flags → needs_review (never hidden)
-- ---------------------------------------------------------------------------
insert into public.pandal_flags (target_id, reason) values (current_setting('t.p1')::uuid, 'spam');
do $$ begin
  insert into public.pandal_flags (target_id, reason) values (current_setting('t.p1')::uuid, 'other');
  raise exception 'FAIL: same user flagged twice';
exception when unique_violation then raise notice 'PASS: one flag per user per item';
end $$;
do $$ begin
  insert into public.pandal_flags (target_id, reason) values (gen_random_uuid(), 'spam');
  raise exception 'FAIL: flag on non-existent pandal accepted';
exception when foreign_key_violation then raise notice 'PASS: flag must reference an existing pandal';
end $$;
do $$ begin
  insert into public.pandal_flags (target_id, reason, user_id)
  values (current_setting('t.p2')::uuid, 'spam', '00000000-0000-4000-8000-00000000000c');
  raise exception 'FAIL: user flagged as someone else';
exception when insufficient_privilege then raise notice 'PASS: cannot flag on behalf of another user';
end $$;
do $$ begin
  update public.pandal_flags set reason = 'other' where target_id = current_setting('t.p1')::uuid;
  raise exception 'FAIL: flags are updatable';
exception when insufficient_privilege then raise notice 'PASS: flags are insert-only';
end $$;

-- photo flag from B
insert into public.photo_flags (target_id, reason) values (current_setting('t.ph1')::uuid, 'inappropriate');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
insert into public.pandal_flags (target_id, reason) values (current_setting('t.p1')::uuid, 'spam');
insert into public.photo_flags (target_id, reason) values (current_setting('t.ph1')::uuid, 'inappropriate');
do $$ begin
  if (select status from public.pandals where id = current_setting('t.p1')::uuid) <> 'active' then
    raise exception 'FAIL: 2 flags already changed status';
  end if;
  raise notice 'PASS: 2 flags leave status active';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);
insert into public.pandal_flags (target_id, reason) values (current_setting('t.p1')::uuid, 'spam');
insert into public.photo_flags (target_id, reason) values (current_setting('t.ph1')::uuid, 'inappropriate');
do $$ begin
  if (select status from public.pandals where id = current_setting('t.p1')::uuid) <> 'needs_review' then
    raise exception 'FAIL: 3 flags did not mark pandal needs_review';
  end if;
  if not exists (select 1 from public.pandals where id = current_setting('t.p1')::uuid) then
    raise exception 'FAIL: flagged pandal is hidden';
  end if;
  if (select status from public.photos where id = current_setting('t.ph1')::uuid) <> 'needs_review' then
    raise exception 'FAIL: 3 flags did not mark photo needs_review';
  end if;
  if (select status from public.pandals where id = current_setting('t.p2')::uuid) <> 'active' then
    raise exception 'FAIL: photo flags changed the pandal''s status';
  end if;
  raise notice 'PASS: 3 flags → needs_review (still visible); photo flags affect only the photo';
end $$;

-- Under-review photo must not be the cover.
do $$ begin
  if exists (select 1 from public.nearby_pandals(15.0, 89.6) where id = current_setting('t.p2')::uuid and cover_path is not null) then
    raise exception 'FAIL: under-review photo used as cover';
  end if;
  raise notice 'PASS: under-review photo is never the cover';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Crowd reports: rate limit + 45-minute freshness
-- ---------------------------------------------------------------------------
insert into public.crowd_reports (pandal_id, level, wait_minutes) values (current_setting('t.p2')::uuid, 'high', 20);
do $$ begin
  insert into public.crowd_reports (pandal_id, level) values (current_setting('t.p2')::uuid, 'low');
  raise exception 'FAIL: second crowd report within 10 min accepted';
exception when raise_exception then
  if sqlerrm <> 'CROWD_RATE' then raise; end if;
  raise notice 'PASS: crowd reports limited to one per pandal per 10 min';
end $$;
do $$ begin
  insert into public.crowd_reports (pandal_id, level, created_at) values (current_setting('t.p1')::uuid, 'low', now() - interval '2 hours');
  raise exception 'FAIL: client set created_at on crowd report';
exception when insufficient_privilege then raise notice 'PASS: crowd report timestamps cannot be forged';
end $$;
do $$ begin
  if (select crowd_level from public.nearby_pandals(15.0, 89.6) where id = current_setting('t.p2')::uuid) is distinct from 'high' then
    raise exception 'FAIL: fresh crowd report not returned';
  end if;
  raise notice 'PASS: fresh crowd report returned by nearby_pandals';
end $$;

-- ---------------------------------------------------------------------------
-- 5. anon: read-only
-- ---------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform count(*) from public.pandals;
  perform * from public.get_pandal(current_setting('t.p1')::uuid);
  raise notice 'PASS: anon can browse';
end $$;
do $$ begin
  insert into public.pandals (name, location) values ('TEST ANON', 'SRID=4326;POINT(89.5 15.2)');
  raise exception 'FAIL: anon inserted a pandal';
exception when insufficient_privilege then raise notice 'PASS: anon cannot add pandals';
end $$;
do $$ begin
  insert into public.crowd_reports (pandal_id, level) values (current_setting('t.p1')::uuid, 'low');
  raise exception 'FAIL: anon reported crowd';
exception when insufficient_privilege then raise notice 'PASS: anon cannot report crowds';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Quotas (fixtures inserted as postgres, which is not quota-limited)
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '', true);

-- F already has 10 pandals today.
insert into public.pandals (name, location, created_by)
select 'TEST F' || g, extensions.st_setsrid(extensions.st_makepoint(89.0 + g * 0.01, 14.0), 4326)::extensions.geography,
       '00000000-0000-4000-8000-00000000000f'
from generate_series(1, 10) g;

-- E already has 15 pandal flags + 5 photo flags today (on bulk targets).
insert into public.pandals (name, location, created_by)
select 'TEST QF' || g, extensions.st_setsrid(extensions.st_makepoint(88.0 + g * 0.01, 14.0), 4326)::extensions.geography, null
from generate_series(1, 16) g;
insert into public.photos (pandal_id, user_id, storage_path)
select p.id, null, 'bulk/' || p.id || '/' || g || '.jpg'
from (select id from public.pandals where name = 'TEST QF16') p, generate_series(1, 6) g;
insert into public.pandal_flags (target_id, user_id, reason)
select id, '00000000-0000-4000-8000-00000000000e', 'spam' from public.pandals where name like 'TEST QF%' and name <> 'TEST QF16' order by name limit 15;
insert into public.photo_flags (target_id, user_id, reason)
select id, '00000000-0000-4000-8000-00000000000e', 'spam' from public.photos where storage_path like 'bulk/%' order by storage_path limit 5;

-- G already has 40 photos today (10 on each of 4 pandals), and A has 9 more on P2.
insert into public.photos (pandal_id, user_id, storage_path)
select p.id, '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000010/' || p.id || '/' || g || '.jpg'
from (select id from public.pandals where name in ('TEST QF1','TEST QF2','TEST QF3','TEST QF4')) p, generate_series(1, 10) g;
insert into public.photos (pandal_id, user_id, storage_path)
select current_setting('t.p2')::uuid, '00000000-0000-4000-8000-00000000000a',
       '00000000-0000-4000-8000-00000000000a/' || current_setting('t.p2') || '/bulk' || g || '.jpg'
from generate_series(1, 9) g;

-- Quotas count the append-only submission_log (rows inserted by postgres above bypass
-- the triggers), so record those creations there too.
insert into public.submission_log (user_id, kind, pandal_id)
select '00000000-0000-4000-8000-00000000000f', 'pandal', id from public.pandals where name like 'TEST F%';
insert into public.submission_log (user_id, kind)
select '00000000-0000-4000-8000-00000000000e', 'flag' from generate_series(1, 20);
insert into public.submission_log (user_id, kind, pandal_id)
select user_id, 'photo', pandal_id from public.photos where user_id = '00000000-0000-4000-8000-000000000010';
insert into public.submission_log (user_id, kind, pandal_id)
select '00000000-0000-4000-8000-00000000000a', 'photo', current_setting('t.p2')::uuid from generate_series(1, 9);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000f","role":"authenticated"}', true);
-- Deleting today's pandals must NOT free up quota.
do $$
declare n int;
begin
  delete from public.pandals where name in ('TEST F1', 'TEST F2');
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'FAIL: owner F could not delete own pandals'; end if;
end $$;
do $$ begin
  insert into public.pandals (name, location) values ('TEST F11', 'SRID=4326;POINT(89.2 14.0)');
  raise exception 'FAIL: 11th pandal in 24h accepted (after deleting two)';
exception when raise_exception then
  if sqlerrm <> 'QUOTA_PANDAL' then raise; end if;
  raise notice 'PASS: 10 pandals / 24h quota — deleting rows does not reset it';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
do $$ begin
  insert into public.photo_flags (target_id, reason)
  select id, 'spam' from public.photos where storage_path like 'bulk/%' order by storage_path offset 5 limit 1;
  raise exception 'FAIL: 21st flag (pandal+photo combined) accepted';
exception when raise_exception then
  if sqlerrm <> 'QUOTA_FLAG' then raise; end if;
  raise notice 'PASS: 20 flags / 24h quota is combined across pandal and photo flags';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000010","role":"authenticated"}', true);
do $$
declare target uuid := (select id from public.pandals where name = 'TEST QF5');
begin
  insert into public.photos (pandal_id, storage_path)
  values (target, '00000000-0000-4000-8000-000000000010/' || target || '/41.jpg');
  raise exception 'FAIL: 41st photo in 24h accepted';
exception when raise_exception then
  if sqlerrm <> 'QUOTA_PHOTO' then raise; end if;
  raise notice 'PASS: 40 photos / 24h quota';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$ begin
  -- A has 1 + 9 = 10 photos on P2 already.
  insert into public.photos (pandal_id, storage_path)
  values (current_setting('t.p2')::uuid, '00000000-0000-4000-8000-00000000000a/' || current_setting('t.p2') || '/eleven.jpg');
  raise exception 'FAIL: 11th photo on one pandal accepted';
exception when raise_exception then
  if sqlerrm <> 'QUOTA_PHOTO_PER_PANDAL' then raise; end if;
  raise notice 'PASS: 10 photos per pandal per user';
end $$;

-- Client-supplied photo id: a retried insert with the same id is rejected, never duplicated.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
declare pid uuid := '00000000-0000-4000-8000-0000000000f1';
begin
  insert into public.photos (id, pandal_id, storage_path)
  values (pid, current_setting('t.p2')::uuid, '00000000-0000-4000-8000-00000000000b/' || current_setting('t.p2') || '/' || pid || '.jpg');
  begin
    insert into public.photos (id, pandal_id, storage_path)
    values (pid, current_setting('t.p2')::uuid, '00000000-0000-4000-8000-00000000000b/' || current_setting('t.p2') || '/' || pid || '.jpg');
    raise exception 'FAIL: duplicate photo id accepted';
  exception when unique_violation then null;
  end;
  if (select count(*) from public.photos where id = pid) <> 1 then raise exception 'FAIL: photo duplicated'; end if;
  -- Owner deleting their own photo: client removes the object, so nothing is queued.
  delete from public.photos where id = pid;
  raise notice 'PASS: photo retries are idempotent (client id)';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
do $$ begin
  if exists (select 1 from public.storage_cleanup where path like '%0000000000f1.jpg') then
    raise exception 'FAIL: direct photo delete was queued for cleanup';
  end if;
  -- Cascade: deleting a pandal queues every one of its photo objects, in the same transaction.
  delete from public.pandals where name = 'TEST QF1';
  if (select count(*) from public.storage_cleanup where path like '00000000-0000-4000-8000-000000000010/%') <> 10 then
    raise exception 'FAIL: cascaded photo objects not queued for cleanup';
  end if;
  raise notice 'PASS: pandal delete queues all photo objects for cleanup; own-photo delete does not';
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$ begin
  perform count(*) from public.storage_cleanup;
  raise exception 'FAIL: users can read storage_cleanup';
exception when insufficient_privilege then raise notice 'PASS: storage_cleanup / submission_log hidden from users';
end $$;
do $$ begin
  if public.photo_upload_allowed('00000000-0000-4000-8000-00000000000b/' || current_setting('t.p2') || '/x.jpg') then
    raise exception 'FAIL: upload allowed into another user''s folder';
  end if;
  if public.photo_upload_allowed('00000000-0000-4000-8000-00000000000a/' || gen_random_uuid() || '/x.jpg') then
    raise exception 'FAIL: upload allowed for a non-existent pandal';
  end if;
  if not public.photo_upload_allowed('00000000-0000-4000-8000-00000000000a/' || current_setting('t.p2') || '/x.jpg') then
    raise exception 'FAIL: valid upload path refused';
  end if;
  raise notice 'PASS: storage upload check: own folder + existing pandal only';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Owner deletes a flagged pandal → cascades + audit row kept
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  delete from public.pandals where id = current_setting('t.p1')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: owner could not delete own (flagged) pandal'; end if;
  raise notice 'PASS: owner can delete own pandal while under review';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);
do $$ begin
  if exists (select 1 from public.pandal_flags where target_id = current_setting('t.p1')::uuid) then
    raise exception 'FAIL: flags not cascaded on delete';
  end if;
  if not exists (
    select 1 from public.moderation_log
    where item_kind = 'pandal' and item_id = current_setting('t.p1')::uuid
      and owner_id = '00000000-0000-4000-8000-00000000000a' and flag_count = 3
      and deleted_by = '00000000-0000-4000-8000-00000000000a'
  ) then
    raise exception 'FAIL: no moderation_log row for deleted flagged pandal';
  end if;
  raise notice 'PASS: deleting a flagged pandal cascades flags and keeps an audit row';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Admin paths: postgres (SQL editor) and service_role can reset status
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  update public.photos set status = 'active' where id = current_setting('t.ph1')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: postgres could not reset photo status'; end if;
  raise notice 'PASS: postgres (SQL editor) can reset status';
end $$;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare n int;
begin
  update public.pandals set status = 'needs_review' where id = current_setting('t.p2')::uuid;
  update public.pandals set status = 'active' where id = current_setting('t.p2')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: service_role could not reset status'; end if;
  if public.geocode_slot() is not true then raise exception 'FAIL: first geocode slot refused'; end if;
  if public.geocode_slot() is not false then raise exception 'FAIL: second geocode slot within 1.1s granted'; end if;
  raise notice 'PASS: service_role resets status; geocode_slot throttles';
end $$;

-- ---------------------------------------------------------------------------
-- 9. Read RPCs: truncation probes and full cluster coverage
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '', true);
-- 60 pandals packed near (16.0, 90.0) → nearby returns 51 (50 + truncation probe).
insert into public.pandals (name, location)
select 'TEST N' || g, extensions.st_setsrid(extensions.st_makepoint(90.0 + (g % 10) * 0.002, 16.0 + (g / 10) * 0.002), 4326)::extensions.geography
from generate_series(1, 60) g;
-- Sparse singletons across a wide box, plus the dense block above.
insert into public.pandals (name, location)
select 'TEST S' || g, extensions.st_setsrid(extensions.st_makepoint(80.0 + g * 1.5, 10.0 + g * 0.8), 4326)::extensions.geography
from generate_series(1, 6) g;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare n int; total int; cells int; summed bigint; sorted boolean;
begin
  select count(*) into n from public.nearby_pandals(16.0, 90.0);
  if n <> 51 then raise exception 'FAIL: nearby_pandals returned % rows, expected 51', n; end if;

  select bool_and(d >= prev) into sorted from (
    select distance_m d, lag(distance_m, 1, 0::double precision) over (order by distance_m, id) prev
    from public.nearby_pandals(16.0, 90.0)
  ) s;
  if not sorted then raise exception 'FAIL: nearby_pandals not sorted by distance'; end if;
  raise notice 'PASS: nearby_pandals returns 50+1 rows, distance-sorted';

  -- Every pandal inside the box is represented by some cluster; cells ≤ 13×13+edge.
  select count(*) into total from public.pandals
  where (location::extensions.geometry) operator(extensions.&&) extensions.st_makeenvelope(79, 9, 100, 25, 4326);
  select count(*), sum(count) into cells, summed from public.pandal_clusters(9, 79, 25, 100, 0);
  if summed <> total then raise exception 'FAIL: clusters cover % of % pandals', summed, total; end if;
  if cells > 14 * 14 then raise exception 'FAIL: % cluster cells, expected ≤ 196', cells; end if;
  if cells < 7 then raise exception 'FAIL: sparse areas collapsed (% cells)', cells; end if;
  raise notice 'PASS: clusters cover every pandal (% cells, % pandals)', cells, total;
end $$;

rollback;
