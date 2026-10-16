"use client";

import type { GeocodeResult } from "./types";

export type GeocodeResponse =
  | { status: "ok"; results: GeocodeResult[] }
  | { status: "busy" }
  | { status: "error"; message: string };

export async function searchPlaces(q: string, signal?: AbortSignal): Promise<GeocodeResponse> {
  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { signal });
    if (res.status === 429) return { status: "busy" };
    const body = (await res.json()) as GeocodeResponse;
    if (!res.ok && body.status !== "error") return { status: "error", message: "Search failed" };
    return body;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return { status: "error", message: navigator.onLine ? "Search failed. Try again." : "You're offline." };
  }
}
