"use client";

import type { GeocodeResult, PlaceSuggestion } from "./types";

export type GeocodeResponse =
  | { status: "ok"; results: PlaceSuggestion[] }
  | { status: "busy" }
  | { status: "error"; message: string };

export type PlaceResponse =
  | { status: "ok"; result: GeocodeResult }
  | { status: "error"; message: string };

export async function searchPlaces(q: string, lang: string, signal?: AbortSignal): Promise<GeocodeResponse> {
  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}&lang=${encodeURIComponent(lang)}`, { signal });
    if (res.status === 429) return { status: "busy" };
    const body = (await res.json()) as GeocodeResponse;
    if (!res.ok && body.status !== "error") return { status: "error", message: "Search failed" };
    return body;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return { status: "error", message: navigator.onLine ? "Search failed. Try again." : "You're offline." };
  }
}

export async function lookupPlace(placeId: string, signal?: AbortSignal): Promise<PlaceResponse> {
  try {
    const res = await fetch(`/api/geocode?placeId=${encodeURIComponent(placeId)}`, { signal });
    const body = (await res.json()) as PlaceResponse;
    if (!res.ok && body.status !== "error") return { status: "error", message: "Search failed" };
    return body;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return { status: "error", message: navigator.onLine ? "Search failed. Try again." : "You're offline." };
  }
}
