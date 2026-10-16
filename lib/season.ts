import type { PlaceKind } from "./types";

/** Dussehra (Vijayadashami) in India. Listings for that year end when this day ends. */
const DUSSEHRA: Record<number, string> = {
  2026: "2026-10-20",
  2027: "2027-10-09",
  2028: "2028-09-27",
  2029: "2029-10-16",
  2030: "2030-10-06",
};

const IST = "Asia/Kolkata";
/** How long before Dussehra a new listing can appear. Next year starts fresh. */
const SEASON_DAYS = 45;

export function normalizeKind(kind: string | null | undefined): PlaceKind {
  if (kind === "ramleela" || kind === "ravan") return kind;
  return "pandal";
}

/** Calendar day in India, YYYY-MM-DD. */
export function istDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

/** The Dussehra this listing belongs to, if it was added during that season. */
export function seasonFor(created: Date): { endsOn: string } | null {
  const day = istDate(created);
  for (const endsOn of Object.values(DUSSEHRA)) {
    const start = shiftDays(endsOn, -SEASON_DAYS);
    if (day > start && day <= endsOn) return { endsOn };
  }
  return null;
}

/** True until the end of Dussehra day in India. After that, the listing is gone. */
export function placeInSeason(createdIso: string, now = new Date()): boolean {
  const season = seasonFor(new Date(createdIso));
  if (!season) return false;
  return istDate(now) <= season.endsOn;
}

export function formatDay(isoDate: string, lang: "en" | "hi" | "bn"): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const locale = lang === "hi" ? "hi-IN" : lang === "bn" ? "bn-IN" : "en-IN";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(utc);
}
