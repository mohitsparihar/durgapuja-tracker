"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { LocateIcon } from "@/components/icons";
import { SearchBar } from "@/components/SearchBar";
import type { LatLng } from "@/lib/types";

const PinMap = dynamic(() => import("./PinMap"), {
  ssr: false,
  loading: () => <div className="skeleton h-full w-full" aria-label="Loading map" />,
});

/**
 * Three ways to place the pin, none of which need dragging: use my location, tap the
 * map, or search a place. Dragging the pin also works for fine-tuning.
 */
export function PinPicker({ value, onChange }: { value: LatLng | null; onChange: (p: LatLng) => void }) {
  const [focusKey, setFocusKey] = useState(0);
  const [gps, setGps] = useState<"idle" | "busy" | "error">("idle");

  const set = (p: LatLng, refocus: boolean) => {
    onChange(p);
    if (refocus) setFocusKey((k) => k + 1);
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setGps("error");
      return;
    }
    setGps("busy");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps("idle");
        set({ lat: pos.coords.latitude, lng: pos.coords.longitude }, true);
      },
      () => setGps("error"),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  };

  return (
    <div data-testid="pin-picker">
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={gps === "busy"}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo px-4 py-2 text-base font-semibold leading-snug text-ivory disabled:opacity-70"
          data-testid="pin-use-location"
        >
          <LocateIcon /> {gps === "busy" ? "Finding you…" : "I'm at the pandal — use my location"}
        </button>
        <SearchBar dark={false} onPick={(r) => set(r, true)} placeholder="Or search the area" testId="pin-search" />
      </div>
      {gps === "error" && (
        <p className="mt-2 text-base text-vermilion-ink" role="alert">
          Couldn&apos;t get your location. Search the area or tap the map instead.
        </p>
      )}
      <div className="relative mt-3 h-64 overflow-hidden rounded-2xl border-2 border-line" data-testid="pin-map">
        <PinMap pinAt={value} focusKey={focusKey} onPick={(p) => set(p, false)} />
        {!value && (
          <p className="pointer-events-none absolute left-[72px] right-3 top-3 z-[450] rounded-xl bg-paper/95 px-3 py-2 text-center text-sm font-medium shadow">
            Tap the map where the pandal is
          </p>
        )}
      </div>
      <p className="mt-1.5 text-sm text-ink-2" aria-live="polite" data-testid="pin-status">
        {value
          ? `Pin set at ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}. Tap the map or drag the pin to adjust.`
          : "No pin yet."}
      </p>
    </div>
  );
}
