-- A place can be a Durga pandal or a Ramleela ground. Existing rows stay pandals.
alter table public.pandals
  add column if not exists kind text not null default 'pandal';

alter table public.pandals drop constraint if exists pandals_kind_check;
alter table public.pandals
  add constraint pandals_kind_check check (kind in ('pandal', 'ramleela'));

grant insert (kind), update (kind) on public.pandals to authenticated;

-- Return type gains `kind`, so the functions have to be replaced, not altered.
drop function if exists public.nearby_pandals(double precision, double precision);
create or replace function public.nearby_pandals(p_lat double precision, p_lng double precision)
returns table (
  id uuid, name text, address text, city text, tags text[], status public.item_status,
  kind text,
  lat double precision, lng double precision, distance_m double precision,
  cover_path text, crowd_level public.crowd_level, crowd_wait smallint, crowd_at timestamptz
)
language sql stable set search_path = public, extensions as $$
  with ref as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g
  )
  select p.id, p.name, p.address, p.city, p.tags, p.status, p.kind,
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
  cover_path text, crowd_level public.crowd_level, crowd_wait smallint, crowd_at timestamptz
)
language sql stable set search_path = public, extensions as $$
  with box as (
    select st_makeenvelope(p_west, p_south, p_east, p_north, 4326) as env,
           st_setsrid(st_makepoint((p_west + p_east) / 2, (p_south + p_north) / 2), 4326)::geography as center
  )
  select p.id, p.name, p.address, p.city, p.tags, p.status, p.kind,
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
  limit 301;
$$;

drop function if exists public.find_duplicates(double precision, double precision, text);
create or replace function public.find_duplicates(p_lat double precision, p_lng double precision, p_name text)
returns table (
  id uuid, name text, address text, city text, tags text[], status public.item_status,
  kind text,
  lat double precision, lng double precision, distance_m double precision,
  cover_path text, crowd_level public.crowd_level, crowd_wait smallint, crowd_at timestamptz
)
language sql stable set search_path = public, extensions as $$
  with ref as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g)
  select p.id, p.name, p.address, p.city, p.tags, p.status, p.kind,
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

create or replace function public.get_pandal(p_id uuid)
returns jsonb
language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'description', p.description, 'address', p.address,
    'city', p.city, 'tags', p.tags, 'status', p.status, 'kind', p.kind,
    'created_by', p.created_by, 'created_at', p.created_at,
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
  public.find_duplicates(double precision, double precision, text),
  public.get_pandal(uuid)
  to anon, authenticated;
