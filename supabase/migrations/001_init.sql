-- Pandal Hop — initial schema
-- Run in the Supabase SQL editor (or `supabase db push`). Idempotent where practical.

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.item_status as enum ('active', 'needs_review');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.crowd_level as enum ('low', 'medium', 'high', 'very_high');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.pandals (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  description text check (char_length(description) <= 1000),
  address text check (char_length(address) <= 200),
  city text check (char_length(city) <= 80),
  tags text[] not null default '{}' check (cardinality(tags) <= 8),
  location extensions.geography(Point, 4326) not null,
  status public.item_status not null default 'active',
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists pandals_location_gix on public.pandals using gist (location);
-- Bounding-box queries run on geometry; index the cast so they stay indexed.
create index if not exists pandals_location_geom_gix on public.pandals using gist ((location::extensions.geometry));
create index if not exists pandals_created_by_idx on public.pandals (created_by, created_at desc);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  pandal_id uuid not null references public.pandals (id) on delete cascade,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  storage_path text not null unique check (char_length(storage_path) <= 300),
  status public.item_status not null default 'active',
  created_at timestamptz not null default now()
);
create index if not exists photos_pandal_idx on public.photos (pandal_id, created_at);
create index if not exists photos_user_idx on public.photos (user_id, created_at desc);

create table if not exists public.crowd_reports (
  id bigint generated always as identity primary key,
  pandal_id uuid not null references public.pandals (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  level public.crowd_level not null,
  wait_minutes smallint check (wait_minutes between 0 and 240),
  created_at timestamptz not null default now()
);
create index if not exists crowd_reports_pandal_idx on public.crowd_reports (pandal_id, created_at desc);
create index if not exists crowd_reports_user_idx on public.crowd_reports (user_id, pandal_id, created_at desc);

-- Separate flag tables so each has a real FK with ON DELETE CASCADE.
create table if not exists public.pandal_flags (
  id bigint generated always as identity primary key,
  target_id uuid not null references public.pandals (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null check (reason in ('wrong_location', 'duplicate', 'inappropriate', 'spam', 'other')),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  unique (target_id, user_id)
);
create index if not exists pandal_flags_user_idx on public.pandal_flags (user_id, created_at desc);

create table if not exists public.photo_flags (
  id bigint generated always as identity primary key,
  target_id uuid not null references public.photos (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null check (reason in ('wrong_location', 'duplicate', 'inappropriate', 'spam', 'other')),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  unique (target_id, user_id)
);
create index if not exists photo_flags_user_idx on public.photo_flags (user_id, created_at desc);

-- Audit trail: survives deletion of flagged items so repeat abuse stays visible.
create table if not exists public.moderation_log (
  id bigint generated always as identity primary key,
  item_kind text not null check (item_kind in ('pandal', 'photo')),
  item_id uuid not null,
  owner_id uuid,
  label text,
  flag_count int not null,
  status public.item_status,
  deleted_by uuid,
  deleted_at timestamptz not null default now()
);

-- Append-only record of every creation, so deleting rows can't reset daily quotas.
create table if not exists public.submission_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  kind text not null check (kind in ('pandal', 'photo', 'flag')),
  pandal_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists submission_log_user_idx on public.submission_log (user_id, kind, created_at desc);

-- Storage objects to delete. Filled IN THE SAME TRANSACTION as the row delete (trigger),
-- so nothing is lost if the Storage call fails or a photo is added mid-delete; rows are
-- removed only after the object is gone.
create table if not exists public.storage_cleanup (
  path text primary key,
  pandal_id uuid,
  created_at timestamptz not null default now()
);
drop table if exists public.storage_orphans;

create table if not exists public.geocode_cache (
  query text primary key,
  results jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.geocode_throttle (
  id int primary key check (id = 1),
  last_at timestamptz not null default 'epoch'
);
insert into public.geocode_throttle (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Privileges: start from nothing, then grant exactly what clients need.
-- Column-level grants are what stop owners from changing status/created_by/location.
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.pandals, public.photos, public.crowd_reports,
  public.pandal_flags, public.photo_flags, public.moderation_log,
  public.geocode_cache, public.geocode_throttle, public.submission_log, public.storage_cleanup
  from anon, authenticated;

grant select on public.profiles, public.pandals, public.photos, public.crowd_reports to anon, authenticated;

grant update (display_name) on public.profiles to authenticated;

-- id is client-supplied so a retried create (lost response) can't produce a second pandal.
grant insert (id, name, description, address, city, tags, location) on public.pandals to authenticated;
grant update (name, description, address, tags) on public.pandals to authenticated;
grant delete on public.pandals to authenticated;

-- id is client-supplied so a retried upload (lost response) can't create a second row.
grant insert (id, pandal_id, storage_path) on public.photos to authenticated;
grant delete on public.photos to authenticated;

grant insert (pandal_id, level, wait_minutes) on public.crowd_reports to authenticated;

grant insert (target_id, reason, note) on public.pandal_flags, public.photo_flags to authenticated;
grant select on public.pandal_flags, public.photo_flags to authenticated;

-- moderation_log, geocode_cache, geocode_throttle, submission_log, storage_cleanup: no client access.

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.pandals enable row level security;
alter table public.photos enable row level security;
alter table public.crowd_reports enable row level security;
alter table public.pandal_flags enable row level security;
alter table public.photo_flags enable row level security;
alter table public.moderation_log enable row level security;
alter table public.geocode_cache enable row level security;
alter table public.geocode_throttle enable row level security;
alter table public.submission_log enable row level security;
alter table public.storage_cleanup enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (true);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists pandals_read on public.pandals;
create policy pandals_read on public.pandals for select using (true);
drop policy if exists pandals_insert_own on public.pandals;
create policy pandals_insert_own on public.pandals for insert to authenticated
  with check (created_by = (select auth.uid()));
drop policy if exists pandals_update_own on public.pandals;
create policy pandals_update_own on public.pandals for update to authenticated
  using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
drop policy if exists pandals_delete_own on public.pandals;
create policy pandals_delete_own on public.pandals for delete to authenticated
  using (created_by = (select auth.uid()));

drop policy if exists photos_read on public.photos;
create policy photos_read on public.photos for select using (true);
drop policy if exists photos_insert_own on public.photos;
create policy photos_insert_own on public.photos for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and split_part(storage_path, '/', 1) = (select auth.uid())::text
    and split_part(storage_path, '/', 2) = pandal_id::text
  );
drop policy if exists photos_delete_own on public.photos;
create policy photos_delete_own on public.photos for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists crowd_read on public.crowd_reports;
create policy crowd_read on public.crowd_reports for select using (true);
drop policy if exists crowd_insert_own on public.crowd_reports;
create policy crowd_insert_own on public.crowd_reports for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists pandal_flags_insert_own on public.pandal_flags;
create policy pandal_flags_insert_own on public.pandal_flags for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists pandal_flags_read_own on public.pandal_flags;
create policy pandal_flags_read_own on public.pandal_flags for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists photo_flags_insert_own on public.photo_flags;
create policy photo_flags_insert_own on public.photo_flags for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists photo_flags_read_own on public.photo_flags;
create policy photo_flags_read_own on public.photo_flags for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Profiles on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 80),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Concurrency-safe quotas. Each trigger takes a per-user advisory lock first, so two
-- simultaneous inserts are serialized and the second one counts the first.
-- Inserts without a JWT user (service_role / seed script) are not limited.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_pandal_quota()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':pandal'));
  select count(*) into n from public.submission_log
    where user_id = auth.uid() and kind = 'pandal' and created_at > now() - interval '24 hours';
  if n >= 10 then
    raise exception 'QUOTA_PANDAL' using errcode = 'P0001', hint = 'Max 10 pandals per 24 hours';
  end if;
  insert into public.submission_log (user_id, kind, pandal_id) values (auth.uid(), 'pandal', new.id);
  return new;
end $$;

create or replace function public.enforce_photo_quota()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n_day int; n_pandal int;
begin
  if auth.uid() is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':photo'));
  select count(*) into n_day from public.submission_log
    where user_id = auth.uid() and kind = 'photo' and created_at > now() - interval '24 hours';
  if n_day >= 40 then
    raise exception 'QUOTA_PHOTO' using errcode = 'P0001';
  end if;
  select count(*) into n_pandal from public.submission_log
    where user_id = auth.uid() and kind = 'photo' and pandal_id = new.pandal_id;
  if n_pandal >= 10 then
    raise exception 'QUOTA_PHOTO_PER_PANDAL' using errcode = 'P0001';
  end if;
  insert into public.submission_log (user_id, kind, pandal_id) values (auth.uid(), 'photo', new.pandal_id);
  return new;
end $$;

-- One lock key and one count across BOTH flag tables: the daily flag quota is combined.
create or replace function public.enforce_flag_quota()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':flag'));
  select count(*) into n from public.submission_log
    where user_id = auth.uid() and kind = 'flag' and created_at > now() - interval '24 hours';
  if n >= 20 then
    raise exception 'QUOTA_FLAG' using errcode = 'P0001';
  end if;
  insert into public.submission_log (user_id, kind) values (auth.uid(), 'flag');
  return new;
end $$;

create or replace function public.enforce_crowd_rate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':crowd:' || new.pandal_id::text));
  if exists (
    select 1 from public.crowd_reports
    where user_id = auth.uid() and pandal_id = new.pandal_id
      and created_at > now() - interval '10 minutes'
  ) then
    raise exception 'CROWD_RATE' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists pandals_quota on public.pandals;
create trigger pandals_quota before insert on public.pandals
  for each row execute function public.enforce_pandal_quota();
drop trigger if exists photos_quota on public.photos;
create trigger photos_quota before insert on public.photos
  for each row execute function public.enforce_photo_quota();
drop trigger if exists pandal_flags_quota on public.pandal_flags;
create trigger pandal_flags_quota before insert on public.pandal_flags
  for each row execute function public.enforce_flag_quota();
drop trigger if exists photo_flags_quota on public.photo_flags;
create trigger photo_flags_quota before insert on public.photo_flags
  for each row execute function public.enforce_flag_quota();
drop trigger if exists crowd_rate on public.crowd_reports;
create trigger crowd_rate before insert on public.crowd_reports
  for each row execute function public.enforce_crowd_rate();

-- ---------------------------------------------------------------------------
-- Flag threshold: the ONLY non-admin path that changes status.
-- SECURITY DEFINER (owned by postgres) so it can update status even though the
-- inserting user has no UPDATE grant on that column. It can only ever move an
-- item to needs_review. A per-target lock makes the 3rd concurrent flag count.
-- ---------------------------------------------------------------------------
create or replace function public.pandal_flag_threshold()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('flag-target:' || new.target_id::text));
  update public.pandals set status = 'needs_review'
  where id = new.target_id and status = 'active'
    and (select count(*) from public.pandal_flags f where f.target_id = new.target_id) >= 3;
  return null;
end $$;

create or replace function public.photo_flag_threshold()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('flag-target:' || new.target_id::text));
  update public.photos set status = 'needs_review'
  where id = new.target_id and status = 'active'
    and (select count(*) from public.photo_flags f where f.target_id = new.target_id) >= 3;
  return null;
end $$;

drop trigger if exists pandal_flags_threshold on public.pandal_flags;
create trigger pandal_flags_threshold after insert on public.pandal_flags
  for each row execute function public.pandal_flag_threshold();
drop trigger if exists photo_flags_threshold on public.photo_flags;
create trigger photo_flags_threshold after insert on public.photo_flags
  for each row execute function public.photo_flag_threshold();

-- ---------------------------------------------------------------------------
-- Deletion audit: keep a record when a flagged item is deleted (by anyone).
-- BEFORE DELETE so the flags still exist when we count them.
-- ---------------------------------------------------------------------------
create or replace function public.log_flagged_pandal_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  select count(*) into n from public.pandal_flags where target_id = old.id;
  if n > 0 or old.status = 'needs_review' then
    insert into public.moderation_log (item_kind, item_id, owner_id, label, flag_count, status, deleted_by)
    values ('pandal', old.id, old.created_by, old.name, n, old.status, auth.uid());
  end if;
  return old;
end $$;

create or replace function public.log_flagged_photo_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  select count(*) into n from public.photo_flags where target_id = old.id;
  if n > 0 or old.status = 'needs_review' then
    insert into public.moderation_log (item_kind, item_id, owner_id, label, flag_count, status, deleted_by)
    values ('photo', old.id, old.user_id, old.storage_path, n, old.status, auth.uid());
  end if;
  return old;
end $$;

-- When a photo row disappears because its pandal was deleted (cascade), queue its Storage
-- object for removal. During the cascade the parent row is already gone, which is how we
-- tell it apart from an owner deleting their own photo (the client removes that object).
create or replace function public.queue_photo_object_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.pandals where id = old.pandal_id) then
    insert into public.storage_cleanup (path, pandal_id) values (old.storage_path, old.pandal_id)
    on conflict (path) do nothing;
  end if;
  return old;
end $$;

drop trigger if exists photos_cleanup_queue on public.photos;
create trigger photos_cleanup_queue after delete on public.photos
  for each row execute function public.queue_photo_object_cleanup();

drop trigger if exists pandals_delete_audit on public.pandals;
create trigger pandals_delete_audit before delete on public.pandals
  for each row execute function public.log_flagged_pandal_delete();
drop trigger if exists photos_delete_audit on public.photos;
create trigger photos_delete_audit before delete on public.photos
  for each row execute function public.log_flagged_photo_delete();

-- Trigger functions can't be called directly, but be explicit anyway.
revoke execute on function
  public.handle_new_user(), public.enforce_pandal_quota(), public.enforce_photo_quota(),
  public.enforce_flag_quota(), public.enforce_crowd_rate(), public.pandal_flag_threshold(),
  public.photo_flag_threshold(), public.log_flagged_pandal_delete(), public.log_flagged_photo_delete(),
  public.queue_photo_object_cleanup()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Read RPCs (SECURITY INVOKER: they run under the caller's RLS)
-- ---------------------------------------------------------------------------

-- Shared row shape for list/marker queries.
drop function if exists public.nearby_pandals(double precision, double precision);
create or replace function public.nearby_pandals(p_lat double precision, p_lng double precision)
returns table (
  id uuid, name text, address text, city text, tags text[], status public.item_status,
  lat double precision, lng double precision, distance_m double precision,
  cover_path text, crowd_level public.crowd_level, crowd_wait smallint, crowd_at timestamptz
)
language sql stable set search_path = public, extensions as $$
  with ref as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g
  )
  select p.id, p.name, p.address, p.city, p.tags, p.status,
         st_y(p.location::geometry), st_x(p.location::geometry),
         st_distance(p.location, ref.g) as distance_m,
         cov.storage_path, cr.level, cr.wait_minutes, cr.created_at
  from public.pandals p
  cross join ref
  left join lateral (
    select ph.storage_path from public.photos ph
    where ph.pandal_id = p.id and ph.status = 'active'
    order by ph.created_at, ph.id limit 1
  ) cov on true
  left join lateral (
    select c.level, c.wait_minutes, c.created_at from public.crowd_reports c
    where c.pandal_id = p.id and c.created_at > now() - interval '45 minutes'
    order by c.created_at desc limit 1
  ) cr on true
  where st_dwithin(p.location, ref.g, 25000)
  order by distance_m, p.id
  limit 51;  -- 50 + 1 so the client can tell the list was truncated
$$;

drop function if exists public.pandals_in_bounds(double precision, double precision, double precision, double precision);
create or replace function public.pandals_in_bounds(
  p_south double precision, p_west double precision, p_north double precision, p_east double precision
)
returns table (
  id uuid, name text, address text, city text, tags text[], status public.item_status,
  lat double precision, lng double precision, distance_m double precision,
  cover_path text, crowd_level public.crowd_level, crowd_wait smallint, crowd_at timestamptz
)
language sql stable set search_path = public, extensions as $$
  with box as (
    select st_makeenvelope(p_west, p_south, p_east, p_north, 4326) as env,
           st_setsrid(st_makepoint((p_west + p_east) / 2, (p_south + p_north) / 2), 4326)::geography as center
  )
  select p.id, p.name, p.address, p.city, p.tags, p.status,
         st_y(p.location::geometry), st_x(p.location::geometry),
         st_distance(p.location, box.center) as distance_m,
         cov.storage_path, cr.level, cr.wait_minutes, cr.created_at
  from public.pandals p
  cross join box
  left join lateral (
    select ph.storage_path from public.photos ph
    where ph.pandal_id = p.id and ph.status = 'active'
    order by ph.created_at, ph.id limit 1
  ) cov on true
  left join lateral (
    select c.level, c.wait_minutes, c.created_at from public.crowd_reports c
    where c.pandal_id = p.id and c.created_at > now() - interval '45 minutes'
    order by c.created_at desc limit 1
  ) cr on true
  where (p.location::geometry) && box.env
  order by distance_m, p.id
  limit 301;  -- 300 + 1 truncation probe
$$;

-- Grid clusters. The cell size is floored server-side so a viewport never has more
-- than ~13 cells per side, and EVERY occupied cell is returned (no LIMIT), so quiet
-- areas are never dropped. Grid is anchored at 0,0 so bubbles don't jump when panning.
drop function if exists public.pandal_clusters(double precision, double precision, double precision, double precision, double precision);
create or replace function public.pandal_clusters(
  p_south double precision, p_west double precision, p_north double precision, p_east double precision,
  p_cell_deg double precision
)
returns table (lat double precision, lng double precision, count bigint)
language sql stable set search_path = public, extensions as $$
  with params as (
    select greatest(
      coalesce(p_cell_deg, 0),
      greatest(p_north - p_south, p_east - p_west) / 12.0,
      0.0001
    ) as cell,
    st_makeenvelope(p_west, p_south, p_east, p_north, 4326) as env
  ),
  pts as (
    select st_x(p.location::geometry) as x, st_y(p.location::geometry) as y
    from public.pandals p, params
    where (p.location::geometry) && params.env
  )
  select avg(y), avg(x), count(*)
  from pts, params
  group by floor(x / params.cell), floor(y / params.cell);
$$;

drop function if exists public.find_duplicates(double precision, double precision, text);
create or replace function public.find_duplicates(p_lat double precision, p_lng double precision, p_name text)
returns table (
  id uuid, name text, address text, city text, tags text[], status public.item_status,
  lat double precision, lng double precision, distance_m double precision,
  cover_path text, crowd_level public.crowd_level, crowd_wait smallint, crowd_at timestamptz
)
language sql stable set search_path = public, extensions as $$
  with ref as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g)
  select p.id, p.name, p.address, p.city, p.tags, p.status,
         st_y(p.location::geometry), st_x(p.location::geometry),
         st_distance(p.location, ref.g) as distance_m,
         null::text, null::public.crowd_level, null::smallint, null::timestamptz
  from public.pandals p, ref
  where st_dwithin(p.location, ref.g, 50)
     or (char_length(btrim(coalesce(p_name, ''))) > 2
         and lower(btrim(p.name)) = lower(btrim(p_name))
         and st_dwithin(p.location, ref.g, 1000))
  order by distance_m, p.id
  limit 5;
$$;

drop function if exists public.get_pandal(uuid);
create or replace function public.get_pandal(p_id uuid)
returns jsonb
language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'description', p.description, 'address', p.address,
    'city', p.city, 'tags', p.tags, 'status', p.status, 'created_by', p.created_by,
    'created_at', p.created_at,
    'lat', st_y(p.location::geometry), 'lng', st_x(p.location::geometry),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ph.id, 'storage_path', ph.storage_path, 'status', ph.status,
        'user_id', ph.user_id, 'created_at', ph.created_at
      ) order by ph.created_at, ph.id)
      from public.photos ph where ph.pandal_id = p.id
    ), '[]'::jsonb),
    'crowd', (
      select jsonb_build_object('level', c.level, 'wait_minutes', c.wait_minutes, 'created_at', c.created_at)
      from public.crowd_reports c
      where c.pandal_id = p.id and c.created_at > now() - interval '45 minutes'
      order by c.created_at desc limit 1
    )
  )
  from public.pandals p where p.id = p_id;
$$;

grant execute on function
  public.nearby_pandals(double precision, double precision),
  public.pandals_in_bounds(double precision, double precision, double precision, double precision),
  public.pandal_clusters(double precision, double precision, double precision, double precision, double precision),
  public.find_duplicates(double precision, double precision, text),
  public.get_pandal(uuid)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Geocoding: app-wide 1 req/s throttle shared by every serverless instance.
-- Only the server (service_role) may call it.
-- ---------------------------------------------------------------------------
create or replace function public.geocode_slot()
returns boolean language plpgsql security definer set search_path = '' as $$
declare t timestamptz;
begin
  select last_at into t from public.geocode_throttle where id = 1 for update;
  -- Compare instead of subtracting: subtraction fails on infinite timestamps.
  if t is not null and t > clock_timestamp() - interval '1100 milliseconds' then
    return false;
  end if;
  update public.geocode_throttle set last_at = clock_timestamp() where id = 1;
  return true;
end $$;
revoke execute on function public.geocode_slot() from public, anon, authenticated;
grant execute on function public.geocode_slot() to service_role;

-- ---------------------------------------------------------------------------
-- Realtime: crowd changes trigger client refetches.
-- ---------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'crowd_reports'
     ) then
    alter publication supabase_realtime add table public.crowd_reports;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Storage: public-read bucket, images only, 2 MB, uploads only under {uid}/{pandalId}/
-- and at most 50 objects per user per 24 h (so uploads without photo rows can't
-- bypass the photo quota).
-- ---------------------------------------------------------------------------
create or replace function public.photo_upload_allowed(object_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := string_to_array(object_name, '/');
begin
  if auth.uid() is null or array_length(parts, 1) <> 3 or parts[1] <> auth.uid()::text then
    return false;
  end if;
  if not exists (select 1 from public.pandals where id::text = parts[2]) then
    return false;
  end if;
  if to_regclass('storage.objects') is null then
    return true;
  end if;
  return (
    select count(*) < 50 from storage.objects o
    where o.bucket_id = 'pandal-photos'
      and o.name like auth.uid()::text || '/%'
      and o.created_at > now() - interval '24 hours'
  );
end $$;
revoke execute on function public.photo_upload_allowed(text) from public, anon;
grant execute on function public.photo_upload_allowed(text) to authenticated;

do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('pandal-photos', 'pandal-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

    drop policy if exists "pandal photos: upload to own folder" on storage.objects;
    create policy "pandal photos: upload to own folder" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'pandal-photos'
        and (storage.foldername(name))[1] = (select auth.uid())::text
        and public.photo_upload_allowed(name)
      );

    drop policy if exists "pandal photos: delete own" on storage.objects;
    create policy "pandal photos: delete own" on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'pandal-photos'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      );
  end if;
end $$;
