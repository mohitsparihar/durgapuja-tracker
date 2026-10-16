"use client";

import Link from "next/link";
import { directionsUrl, formatDistance } from "@/lib/geo";
import type { PandalSummary } from "@/lib/types";
import { CrowdBadge } from "./CrowdBadge";
import { DirectionsIcon } from "./icons";
import { PhotoImg } from "./PhotoImg";

export function PandalCard({
  p,
  selected,
  onSelect,
}: {
  p: PandalSummary;
  selected: boolean;
  onSelect: (p: PandalSummary) => void;
}) {
  const dist = formatDistance(p.distance_m);
  return (
    <article
      id={`card-${p.id}`}
      data-testid="pandal-card"
      className={`overflow-hidden rounded-2xl border bg-paper shadow-sm transition-shadow ${
        selected ? "border-marigold shadow-[0_0_0_3px_var(--marigold)]" : "border-line"
      }`}
    >
      <div className="festive-dots opacity-70" />
      <button
        type="button"
        onClick={() => onSelect(p)}
        aria-pressed={selected}
        aria-label={`${p.name}${dist ? `, ${dist} away` : ""}. Show on map`}
        className="flex w-full gap-3 p-3 text-left"
      >
        <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-indigo-2">
          {p.cover_url ? (
            <PhotoImg src={p.cover_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="festive-edge h-full w-full opacity-80" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 break-words text-[17px] font-semibold leading-snug">{p.name}</h3>
          <p className="mt-0.5 truncate text-sm text-ink-2">
            {dist && <span className="font-semibold text-ink">{dist}</span>}
            {dist && (p.address || p.city) && " · "}
            {p.address ?? p.city}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <CrowdBadge crowd={p.crowd} />
            {p.status === "needs_review" && (
              <span className="rounded-full border border-ink-2 px-2 py-0.5 text-xs font-semibold text-ink-2">
                Under review
              </span>
            )}
          </div>
        </div>
      </button>
      {selected && (
        <div className="flex gap-2 px-3 pb-3">
          <Link
            href={`/pandal/${p.id}`}
            className="flex h-12 flex-1 items-center justify-center rounded-xl border-2 border-indigo text-base font-semibold text-indigo"
          >
            View details
          </Link>
          <a
            href={directionsUrl(p)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-vermilion text-base font-semibold text-white"
          >
            <DirectionsIcon /> Directions
          </a>
        </div>
      )}
    </article>
  );
}

export function PandalCardSkeleton() {
  return (
    <div className="flex gap-3 rounded-2xl border border-line bg-paper p-3" aria-hidden data-testid="card-skeleton">
      <div className="skeleton h-[72px] w-[72px] rounded-xl" />
      <div className="flex-1 space-y-2 py-1">
        <div className="skeleton h-4 w-4/5 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
        <div className="skeleton h-5 w-2/5 rounded-full" />
      </div>
    </div>
  );
}
