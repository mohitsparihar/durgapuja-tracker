-- Ravan Dahan is a third kind of place. Listings last only until Dussehra,
-- and visitors can say a place has closed or is not there.

alter table public.pandals drop constraint if exists pandals_kind_check;
alter table public.pandals
  add constraint pandals_kind_check check (kind in ('pandal', 'ramleela', 'ravan'));

create table if not exists public.place_notes (
  pandal_id uuid not null references public.pandals (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status text not null check (status in ('closed', 'not_there')),
  created_at timestamptz not null default now(),
  primary key (pandal_id, user_id)
);
create index if not exists place_notes_pandal_idx on public.place_notes (pandal_id);

alter table public.place_notes enable row level security;
drop policy if exists place_notes_read on public.place_notes;
create policy place_notes_read on public.place_notes for select using (true);
drop policy if exists place_notes_write on public.place_notes;
create policy place_notes_write on public.place_notes for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists place_notes_update on public.place_notes;
create policy place_notes_update on public.place_notes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists place_notes_delete on public.place_notes;
create policy place_notes_delete on public.place_notes for delete to authenticated
  using (user_id = (select auth.uid()));

grant select on public.place_notes to anon, authenticated;
grant insert (pandal_id, user_id, status), update (status), delete on public.place_notes to authenticated;

-- A listing belongs to the Dussehra it was added before, and only until that day ends in India.
create or replace function public.place_in_season(p_created timestamptz)
returns boolean
language sql stable set search_path = public as $$
  with seasons(ends_on) as (
    values
      (date '2026-10-20'),
      (date '2027-10-09'),
      (date '2028-09-27'),
      (date '2029-10-16'),
      (date '2030-10-06')
  )
  select exists (
    select 1 from seasons s
    where (p_created at time zone 'Asia/Kolkata')::date <= s.ends_on
      and (p_created at time zone 'Asia/Kolkata')::date > s.ends_on - 45
      and (now() at time zone 'Asia/Kolkata')::date <= s.ends_on
  );
$$;
grant execute on function public.place_in_season(timestamptz) to anon, authenticated;

drop function if exists public.nearby_pandals(double precision, double precision);
create or replace function public.nearby_pandals(p_lat double precision, p_lng double precision)
returns table (
  id uuid, name text, address text, city text, tags text[], status public.item_status,
  kind text,
  lat double precision, lng double precision, distance_m double precision,
  cover_path text, crowd_level public.crowd_level, crowd_wait smallint, crowd_at timestamptz,
  created_at timestamptz, closed_count int, gone_count int
)
language sql stable set search_path = public, extensions as $$
  with ref as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g
  )
  select p.id, p.name, p.address, p.city, p.tags, p.status, p.kind,
         st_y(p.location::geometry), st_x(p.location::geometry),
         st_distance(p.location, ref.g) as distance_m,
         cov.storage_path, cr.level, cr.wait_minutes, cr.created_at,
         p.created_at,
         (select count(*)::int from public.place_notes n where n.pandal_id = p.id and n.status = 'closed'),
         (select count(*)::int from public.place_notes n where n.pandal_id = p.id and n.status = 'not_there')
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
    and public.place_in_season(p.created_at)
    and (select count(*) from public.place_notes n where n.pandal_id = p.id and n.status = 'not_there') < 2
  order by distance_m, p.id
  limit 51;
$$;

drop function if exists public.pandals_in_bounds(double precision, double precision, double precision, double precision);
create or replace function public.pandals_in_bounds(
  p_south double precision, p_west double precision, p_north double precision, p_east double precision
)
returns table (
  id uuid, name text, address text, city text, tags text[], status public.item_status,
  kind text,
  lat double precision, lng double precision, distance_m double precision,
  cover_path text, crowd_level public.crowd_level, crowd_wait smallint, crowd_at timestamptz,
  created_at timestamptz, closed_count int, gone_count int
)
language sql stable set search_path = public, extensions as $$
  with box as (
    select st_makeenvelope(p_west, p_south, p_east, p_north, 4326) as env,
           st_setsrid(st_makepoint((p_west + p_east) / 2, (p_south + p_north) / 2), 4326)::geography as center
  )
  select p.id, p.name, p.address, p.city, p.tags, p.status, p.kind,
         st_y(p.location::geometry), st_x(p.location::geometry),
         st_distance(p.location, box.center) as distance_m,
         cov.storage_path, cr.level, cr.wait_minutes, cr.created_at,
         p.created_at,
         (select count(*)::int from public.place_notes n where n.pandal_id = p.id and n.status = 'closed'),
         (select count(*)::int from public.place_notes n where n.pandal_id = p.id and n.status = 'not_there')
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
    and public.place_in_season(p.created_at)
    and (select count(*) from public.place_notes n where n.pandal_id = p.id and n.status = 'not_there') < 2
  order by distance_m, p.id
  limit 301;
$$;

drop function if exists public.find_duplicates(double precision, double precision, text);
create or replace function public.find_duplicates(p_lat double precision, p_lng double precision, p_name text)
returns table (
  id uuid, name text, address text, city text, tags text[], status public.item_status,
  kind text,
  lat double precision, lng double precision, distance_m double precision,
  cover_path text, crowd_level public.crowd_level, crowd_wait smallint, crowd_at timestamptz,
  created_at timestamptz, closed_count int, gone_count int
)
language sql stable set search_path = public, extensions as $$
  with ref as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g)
  select p.id, p.name, p.address, p.city, p.tags, p.status, p.kind,
         st_y(p.location::geometry), st_x(p.location::geometry),
         st_distance(p.location, ref.g) as distance_m,
         null::text, null::public.crowd_level, null::smallint, null::timestamptz,
         p.created_at,
         (select count(*)::int from public.place_notes n where n.pandal_id = p.id and n.status = 'closed'),
         (select count(*)::int from public.place_notes n where n.pandal_id = p.id and n.status = 'not_there')
  from public.pandals p, ref
  where public.place_in_season(p.created_at)
    and (st_dwithin(p.location, ref.g, 50)
     or (char_length(btrim(coalesce(p_name, ''))) > 2
         and lower(btrim(p.name)) = lower(btrim(p_name))
         and st_dwithin(p.location, ref.g, 1000)))
  order by distance_m, p.id
  limit 5;
$$;

create or replace function public.get_pandal(p_id uuid)
returns jsonb
language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'description', p.description, 'address', p.address,
    'city', p.city, 'tags', p.tags, 'status', p.status, 'kind', p.kind,
    'created_by', p.created_by, 'created_at', p.created_at,
    'lat', st_y(p.location::geometry), 'lng', st_x(p.location::geometry),
    'closed_count', (select count(*) from public.place_notes n where n.pandal_id = p.id and n.status = 'closed'),
    'gone_count', (select count(*) from public.place_notes n where n.pandal_id = p.id and n.status = 'not_there'),
    'my_note', (select n.status from public.place_notes n where n.pandal_id = p.id and n.user_id = auth.uid()),
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
  from public.pandals p
  where p.id = p_id and public.place_in_season(p.created_at);
$$;

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
      and public.place_in_season(p.created_at)
      and (select count(*) from public.place_notes n where n.pandal_id = p.id and n.status = 'not_there') < 2
  )
  select avg(y), avg(x), count(*)
  from pts, params
  group by floor(x / params.cell), floor(y / params.cell);
$$;

grant execute on function
  public.nearby_pandals(double precision, double precision),
  public.pandals_in_bounds(double precision, double precision, double precision, double precision),
  public.find_duplicates(double precision, double precision, text),
  public.get_pandal(uuid),
  public.pandal_clusters(double precision, double precision, double precision, double precision, double precision)
  to anon, authenticated;
