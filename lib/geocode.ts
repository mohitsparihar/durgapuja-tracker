import "server-only";
import { GEOCODE_FIXTURES, mockGeocode } from "./geocode.fixtures";
import { supabaseAdmin } from "./supabase/server";
import type { GeocodeResult, PlaceSuggestion } from "./types";

export type SuggestOutcome = { status: "ok"; results: PlaceSuggestion[] } | { status: "busy" };

const CACHE_DAYS = 30;
const PLACE_ID = /^[A-Za-z0-9_-]{8,300}$/;
/** Open Location Codes, e.g. 3C7P+QJR, which Google sometimes returns instead of a name. */
const PLUS_CODE = /^[2-9CFGHJMPQRVWX]{4,}\+/i;

function placeLabel(name?: string, address?: string): string {
  const title = name?.trim();
  const line = address?.trim();
  if (title && (!line || PLUS_CODE.test(line))) {
    const rest = line?.split(",").slice(1).map((part) => part.trim()).filter(Boolean).join(", ");
    return rest ? `${title}, ${rest}` : title;
  }
  return line || title || "";
}

export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
}

/** Mock only when asked for, or when the whole app runs on mock data (no Supabase URL). */
export function geocodeIsMock(): boolean {
  return process.env.GEOCODE_MOCK === "1" || !process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function mapsKey(): string {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
}

function languageCode(lang: string | null): string {
  if (lang === "hi" || lang === "bn") return lang;
  return "en";
}

/**
 * Place suggestions for the search box. Real mode calls Google Places Autocomplete
 * (New), biased to India. Coordinates come from {@link lookupPlace} when a row is chosen.
 */
export async function suggestPlaces(q: string, lang: string | null): Promise<SuggestOutcome> {
  const query = normalizeQuery(q);
  if (geocodeIsMock()) {
    return {
      status: "ok",
      results: mockGeocode(query).map((r) => ({
        label: r.label,
        placeId: `fixture-${r.lat.toFixed(4)}-${r.lng.toFixed(4)}`,
        lat: r.lat,
        lng: r.lng,
      })),
    };
  }

  const key = mapsKey();
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not set");

  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
    },
    body: JSON.stringify({
      input: query,
      includedRegionCodes: ["in"],
      languageCode: languageCode(lang),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 429) return { status: "busy" };
  if (!res.ok) throw new Error(`Places autocomplete ${res.status}`);
  const raw = (await res.json()) as {
    suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string } } }[];
  };
  const results: PlaceSuggestion[] = [];
  for (const s of raw.suggestions ?? []) {
    const placeId = s.placePrediction?.placeId;
    const label = s.placePrediction?.text?.text;
    if (!placeId || !label || !PLACE_ID.test(placeId)) continue;
    results.push({ label, placeId, lat: null, lng: null });
    if (results.length >= 5) break;
  }
  return { status: "ok", results };
}

/** Resolve a Places id to a point. Lat/lng may be cached for 30 days. */
export async function lookupPlace(placeId: string): Promise<GeocodeResult | null> {
  if (!PLACE_ID.test(placeId)) return null;
  if (geocodeIsMock()) {
    const hit = GEOCODE_FIXTURES.find((r) => `fixture-${r.lat.toFixed(4)}-${r.lng.toFixed(4)}` === placeId);
    return hit ?? null;
  }

  const key = mapsKey();
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not set");

  const cacheKey = `place:${placeId}`;
  const db = supabaseAdmin();
  if (db) {
    const since = new Date(Date.now() - CACHE_DAYS * 86_400_000).toISOString();
    const hit = await db.from("geocode_cache").select("results").eq("query", cacheKey).gte("created_at", since).maybeSingle();
    if (hit.error) console.error("place cache read failed", hit.error);
    const cached = hit.data?.results as GeocodeResult[] | undefined;
    if (cached?.[0]) return cached[0];
  }

  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    cache: "no-store",
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "displayName,formattedAddress,location",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Places details ${res.status}`);
  const raw = (await res.json()) as {
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
  };
  const lat = raw.location?.latitude;
  const lng = raw.location?.longitude;
  if (lat == null || lng == null) return null;
  const result: GeocodeResult = {
    label: placeLabel(raw.displayName?.text, raw.formattedAddress) || placeId,
    lat,
    lng,
  };

  if (db) {
    const saved = await db.from("geocode_cache").upsert({ query: cacheKey, results: [result], created_at: new Date().toISOString() });
    if (saved.error) console.error("place cache write failed", saved.error);
  }
  return result;
}
