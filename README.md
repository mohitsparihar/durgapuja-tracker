# Pandal Hop 🪔

Find Durga Puja / Navratri pandals near you, see **how crowded they are right now**, and share photos.
Mobile-first, works across India, built for a 5-day festival window.

- **Find fast:** map + draggable list. "Nearby" uses your location, or you can search a place.
- **Fresh crowd status:** visitors tap *Calm / Moderate / Busy / Packed*. Reports show their age and expire after 45 minutes.
- **Directions:** one tap opens Google Maps.
- **Crowd-sourced:** anyone can browse. Google sign-in is needed only to add pandals and photos, report crowds, or flag.

## Quick start (demo data, no backend)

```bash
npm install
cp .env.local.example .env.local   # keeps NEXT_PUBLIC_DATA_MOCK=1 and GEOCODE_MOCK=1
npm run dev                         # http://localhost:3000
```

Demo mode runs on ~60 generated fixture pandals (Kolkata, Delhi, Nowgong MP, and singles across India) with fixture place search. The **"Demo data"** badge in the header shows it's active. Sign-in becomes "Continue as demo visitor".

## Real mode (Supabase)

1. **Create a Supabase project** (the free tier is fine).
2. **Run the migration:** paste `supabase/migrations/001_init.sql` into **SQL Editor → Run**. It's safe to re-run. It sets up:
   - PostGIS, tables, RLS and column grants
   - quotas, flag → review triggers and the deletion audit
   - RPCs, the realtime publication and the `pandal-photos` storage bucket (images only, 2 MB)
3. **Optional sanity check:** paste `supabase/tests/moderation.sql` into the SQL editor. Every line should say `PASS`, and it rolls back, so nothing is kept.
4. **Enable Google sign-in:**
   - Turn it on in **Authentication → Providers → Google**, using a Google OAuth client.
   - Under **Authentication → URL Configuration**, add `https://<your-app>/auth/callback` (and `http://localhost:3000/auth/callback` for local use) to the redirect URLs.
5. **Configure the app:** fill `.env.local`, removing the two `*_MOCK` lines:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...        # server only
   NOMINATIM_USER_AGENT="PandalHop/1.0 (https://your-app.vercel.app)"
   NOMINATIM_EMAIL=you@example.com
   ```
6. **Seed verified pandals:** see the launch gate below.

### Deploy to Vercel
Import the repo and set the same environment variables (without the mock flags). That's it.

## Launch gate: verified data only

`supabase/demo-seed.csv` holds about 18 famous pandals with **approximate** pins, all `verified=false`. Pandals move year to year, and a wrong pin is worse than no pin.

1. Check each row's name and 2026 location, fix the `lat,lng` if needed, and set `verified=true`.
2. Run `npm run seed`. It imports **only verified rows** and skips anything already present.
   - `npm run seed -- --dev` imports every row. Use it only on a dev/test project.
3. **Don't share the app publicly until at least 5 verified pandals are live in one city.** Your own town is the easiest place to verify in person.

## How the important bits work

| Concern | Approach |
|---|---|
| Map at all-India zoom | Below zoom 10 the server returns **grid clusters**: every occupied cell, never truncated, with the cell size floored to the viewport. At zoom 10+ it returns markers (max 300, with a "+1" probe to detect truncation). |
| Nearby list | 25 km radius, the closest 50, sorted by `distance, id`. It shows a footer when more exist. |
| Crowd freshness | The server filters out reports older than 45 min, and the client timer hides them too, even without a refetch. Realtime events only *trigger a refetch*. Data also refetches on tab focus and when the connection returns. |
| Place search | Explicit submit (no autocomplete) → `/api/geocode` → shared `geocode_cache` table → **app-wide 1 req/s throttle in Postgres** (`geocode_slot()`) → Nominatim (`countrycodes=in`). |
| Moderation | 3 distinct reports → `needs_review` with a banner/label. **Nothing is auto-hidden.** Owners can't change `status` (column grants). Deleting a flagged item leaves a `moderation_log` row. |
| Spam limits (DB-enforced, race-safe) | Per account per 24 h: 10 pandals, 40 photos (10 per pandal), 20 flags across pandals + photos, and 1 crowd report per pandal per 10 min. Counted from an append-only `submission_log` (deleting doesn't reset them) under per-user advisory locks. Storage uploads are also capped (50 objects/day, own folder, existing pandal only). |
| Photos | Compressed in the browser (≤1600 px, ~300 KB JPEG). Uploaded under `{uid}/{pandalId}/` (enforced by RLS). Pending photos persist in IndexedDB, and a failed upload has per-photo retry. Creating a pandal is **idempotent** (client-generated id), so a retry never duplicates it. |
| Offline | The service worker caches **only the app shell**, never map tiles (OSM policy). Offline navigations go to `/offline`, which shows the last loaded list. |

## Admin cheatsheet (Supabase SQL editor)

```sql
-- Items waiting for review
select id, name, created_by from pandals where status = 'needs_review';
select id, pandal_id, storage_path from photos where status = 'needs_review';

-- Clear a review (or delete the row instead)
update pandals set status = 'active' where id = '...';

-- Who keeps deleting flagged content?
select owner_id, count(*) from moderation_log group by owner_id order by 2 desc;

-- Photo files still waiting to be removed from Storage after their pandal was deleted
-- (normally drained automatically; leftovers mean a Storage call failed)
select * from storage_cleanup;   -- remove them in Storage, then delete the rows
```

## Development

```bash
npm run dev         # dev server
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm run build       # production build
npm run test:db     # migration + permission/quota/RPC + concurrency tests in a throwaway
                    # postgis Docker container (needs Docker running)
```

Test hooks in demo mode (browser console):
- `window.__mockDelay = 3000` simulates a slow network.
- `window.__mockFailUploads = true` makes uploads fail, to try the retry flow.

## Project map

```
app/                    routes: / (map), /pandal/[id], /add, /offline, /auth/callback, /api/*
components/home/        map (Leaflet), bottom sheet, home screen orchestration
components/add/         add-pandal form, pin picker, photo uploader
components/detail/      pandal detail page
lib/data.ts             data-access seam (Supabase ⇄ mock store)
lib/mock/, lib/fixtures demo-mode backend + generated fixtures (DEV ONLY)
supabase/migrations/    schema, security, RPCs
supabase/tests/         SQL tests, concurrency test, local Supabase shim
```

## Post-launch ideas (v2)
Ratings, photo upvotes, a leaderboard, a route planner (labelled "approx. order", with Google Maps links split into ≤3-waypoint chunks), and phone OTP once SMS delivery (incl. India DLT) is set up.

Map data © OpenStreetMap contributors.
