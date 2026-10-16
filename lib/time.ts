"use client";

import { useEffect, useState } from "react";
import { LIMITS } from "./config";
import type { CrowdReport } from "./types";

export function minutesAgo(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

export function agoLabel(iso: string, now: number): string {
  const m = minutesAgo(iso, now);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)} d ago`;
}

/** A crowd report is shown only while it is younger than the TTL. */
export function freshCrowd(c: CrowdReport | null, now: number): CrowdReport | null {
  if (!c) return null;
  return minutesAgo(c.created_at, now) < LIMITS.crowdTtlMinutes ? c : null;
}

/** Re-renders every `ms` so relative times and crowd expiry stay current. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
