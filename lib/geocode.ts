import "server-only";
import { mockGeocode } from "./geocode.fixtures";
import { supabaseAdmin } from "./supabase/server";
import type { GeocodeResult } from "./types";

export type GeocodeOutcome = { status: "ok"; results: GeocodeResult[]; cached: boolean } | { status: "busy" };

const CACHE_DAYS = 30;

export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
}

/** Mock only when asked for, or when the whole app runs on mock data (no Supabase URL). */
export function geocodeIsMock(): boolean {
  return process.env.GEOCODE_MOCK === "1" || !process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/**
 * Provider seam. Real mode = shared Postgres cache → app-wide throttle (geocode_slot)
 * → Nominatim. Every serverless instance shares the same DB, so the 1 req/s limit is global.
 */
export async function geocode(q: string): Promise<GeocodeOutcome> {
  const query = normalizeQuery(q);
  if (geocodeIsMock()) return { status: "ok", results: mockGeocode(query), cached: false };

  const db = supabaseAdmin();
  if (!db) {
    // Never silently fall back to fixtures in a real deployment.
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set; place search can't use the shared cache/throttle.");
  }
  const since = new Date(Date.now() - CACHE_DAYS * 86_400_000).toISOString();
  const hit = await db.from("geocode_cache").select("results").eq("query", query).gte("created_at", since).maybeSingle();
  if (hit.error) console.error("geocode cache read failed", hit.error);
  if (hit.data) return { status: "ok", results: hit.data.results as GeocodeResult[], cached: true };

  const slot = await db.rpc("geocode_slot");
  if (slot.error) throw slot.error;
  if (slot.data !== true) return { status: "busy" };

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("limit", "5");
  url.searchParams.set("q", query);
  if (process.env.NOMINATIM_EMAIL) url.searchParams.set("email", process.env.NOMINATIM_EMAIL);

  const res = await fetch(url, {
    cache: "no-store", // caching is done in geocode_cache, shared across instances
    headers: {
      "User-Agent": process.env.NOMINATIM_USER_AGENT ?? "PandalHop/1.0 (hobby project)",
      "Accept-Language": "en",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 429) return { status: "busy" };
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const raw = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  const results: GeocodeResult[] = raw.map((r) => ({
    label: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
  }));

  const saved = await db.from("geocode_cache").upsert({ query, results, created_at: new Date().toISOString() });
  if (saved.error) console.error("geocode cache write failed", saved.error);
  return { status: "ok", results, cached: false };
}
