"use client";

/**
 * In-memory stand-in for the Supabase backend, used when DATA_MOCK is on.
 * It mirrors the SQL semantics (limits +1 for truncation, 45-min crowd TTL,
 * absolute-grid clusters, quotas) so the UI can be exercised without a database.
 */
import { LIMITS } from "../config";
import { AppError } from "../errors";
import { distanceM, inBounds, boundsCenter } from "../geo";
import { buildFixtures, type FixturePandal } from "../fixtures/pandals";
import type {
  Bounds,
  Cluster,
  CrowdLevel,
  FlagReason,
  ListResult,
  NewPandal,
  PandalDetail,
  PandalSummary,
  Photo,
} from "../types";

declare global {
  interface Window {
    /** Test hooks: artificial latency (ms) and forced upload failures. */
    __mockDelay?: number;
    __mockFailUploads?: boolean;
  }
}

let pandals: FixturePandal[] | null = null;
const flags = new Map<string, Set<string>>(); // "pandal:id" -> user ids
const flagLog: { user: string; at: number }[] = [];
const listeners = new Set<() => void>();

// Mock writes survive reloads (like a real backend) via sessionStorage. Uploaded photo
// object-URLs don't survive a reload; those photos render as "Photo unavailable".
const PERSIST_KEY = "pandal-hop:mock-db";
interface Persisted {
  created: FixturePandal[];
  deleted: string[];
  extraPhotos: Record<string, FixturePandal["photos"]>;
  extraCrowd: Record<string, FixturePandal["crowd"]>;
}

function db(): FixturePandal[] {
  if (!pandals) {
    pandals = buildFixtures();
    try {
      const raw = typeof window !== "undefined" ? sessionStorage.getItem(PERSIST_KEY) : null;
      if (raw) {
        const p = JSON.parse(raw) as Persisted;
        pandals = pandals.filter((x) => !p.deleted.includes(x.id));
        for (const x of pandals) {
          x.photos.push(...(p.extraPhotos[x.id] ?? []));
          x.crowd.push(...(p.extraCrowd[x.id] ?? []));
        }
        pandals.push(...p.created);
      }
    } catch {
      /* start fresh */
    }
  }
  return pandals;
}

const deletedIds: string[] = [];
function persist() {
  try {
    const list = db();
    const fixtureIds = new Set(buildFixtureIds());
    const state: Persisted = {
      created: list.filter((p) => !fixtureIds.has(p.id)),
      deleted: [...fixtureIds].filter((id) => !list.some((p) => p.id === id)).concat(deletedIds.filter((id) => !fixtureIds.has(id))),
      extraPhotos: Object.fromEntries(
        list.filter((p) => fixtureIds.has(p.id)).map((p) => [p.id, p.photos.filter((ph) => !ph.storage_path.startsWith("fixture/"))]),
      ),
      extraCrowd: Object.fromEntries(
        list.filter((p) => fixtureIds.has(p.id)).map((p) => [p.id, p.crowd.filter((c) => !c.user_id.startsWith("u-"))]),
      ),
    };
    sessionStorage.setItem(PERSIST_KEY, JSON.stringify(state));
  } catch {
    /* non-critical */
  }
}
let fixtureIdCache: string[] | null = null;
function buildFixtureIds(): string[] {
  if (!fixtureIdCache) fixtureIdCache = buildFixtures().map((p) => p.id);
  return fixtureIdCache;
}

async function latency() {
  const ms = typeof window !== "undefined" && window.__mockDelay != null ? window.__mockDelay : 250;
  await new Promise((r) => setTimeout(r, ms));
}

const dayAgo = () => Date.now() - 24 * 3600_000;

function latestCrowd(p: FixturePandal) {
  const cutoff = Date.now() - LIMITS.crowdTtlMinutes * 60_000;
  const recent = p.crowd
    .filter((c) => new Date(c.created_at).getTime() > cutoff)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return recent ? { level: recent.level, wait_minutes: recent.wait_minutes, created_at: recent.created_at } : null;
}

function cover(p: FixturePandal): string | null {
  const ph = p.photos
    .filter((x) => x.status === "active")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  return ph?.url ?? null;
}

function summary(p: FixturePandal, distance: number | null): PandalSummary {
  return {
    id: p.id,
    name: p.name,
    address: p.address,
    city: p.city,
    lat: p.lat,
    lng: p.lng,
    tags: p.tags,
    status: p.status,
    cover_url: cover(p),
    distance_m: distance,
    crowd: latestCrowd(p),
  };
}

function byDistanceThenId(a: { d: number; p: FixturePandal }, b: { d: number; p: FixturePandal }) {
  return a.d - b.d || a.p.id.localeCompare(b.p.id);
}

export const mockStore = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  async nearby(lat: number, lng: number): Promise<ListResult> {
    await latency();
    const rows = db()
      .map((p) => ({ p, d: distanceM({ lat, lng }, p) }))
      .filter((x) => x.d <= LIMITS.nearbyRadiusM)
      .sort(byDistanceThenId)
      .slice(0, LIMITS.nearbyLimit + 1);
    return {
      items: rows.slice(0, LIMITS.nearbyLimit).map((x) => summary(x.p, x.d)),
      truncated: rows.length > LIMITS.nearbyLimit,
    };
  },

  async inBounds(b: Bounds): Promise<ListResult> {
    await latency();
    const c = boundsCenter(b);
    const rows = db()
      .filter((p) => inBounds(p, b))
      .map((p) => ({ p, d: distanceM(c, p) }))
      .sort(byDistanceThenId)
      .slice(0, LIMITS.boundsLimit + 1);
    return {
      items: rows.slice(0, LIMITS.boundsLimit).map((x) => summary(x.p, null)),
      truncated: rows.length > LIMITS.boundsLimit,
    };
  },

  async clusters(b: Bounds, cellDeg: number): Promise<Cluster[]> {
    await latency();
    const floor = Math.max(b.north - b.south, b.east - b.west) / LIMITS.clusterCellsPerSide;
    const cell = Math.max(cellDeg, floor);
    const cells = new Map<string, { lat: number; lng: number; count: number }>();
    for (const p of db()) {
      if (!inBounds(p, b)) continue;
      const key = `${Math.floor(p.lng / cell)}:${Math.floor(p.lat / cell)}`;
      const c = cells.get(key) ?? { lat: 0, lng: 0, count: 0 };
      c.lat += p.lat;
      c.lng += p.lng;
      c.count += 1;
      cells.set(key, c);
    }
    return [...cells.values()].map((c) => ({ lat: c.lat / c.count, lng: c.lng / c.count, count: c.count }));
  },

  async get(id: string): Promise<PandalDetail | null> {
    await latency();
    const p = db().find((x) => x.id === id);
    if (!p) return null;
    const photos: Photo[] = [...p.photos]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((ph) => ({ ...ph, pandal_id: p.id }));
    return {
      ...summary(p, null),
      description: p.description,
      created_by: p.created_by,
      created_at: p.created_at,
      photos,
    };
  },

  async duplicates(lat: number, lng: number, name: string): Promise<PandalSummary[]> {
    await latency();
    const n = name.trim().toLowerCase();
    return db()
      .map((p) => ({ p, d: distanceM({ lat, lng }, p) }))
      .filter((x) => x.d <= LIMITS.duplicateRadiusM || (n.length > 2 && x.p.name.toLowerCase() === n && x.d <= 1000))
      .sort(byDistanceThenId)
      .slice(0, 5)
      .map((x) => summary(x.p, x.d));
  },

  async createPandal(input: NewPandal, uid: string, id: string): Promise<string> {
    await latency();
    const existing = db().find((p) => p.id === id);
    if (existing) {
      if (existing.created_by === uid) return id; // idempotent retry
      throw new AppError("PERMISSION");
    }
    const mineToday = db().filter((p) => p.created_by === uid && new Date(p.created_at).getTime() > dayAgo());
    if (mineToday.length >= 10) throw new AppError("QUOTA_PANDAL");
    db().push({
      id,
      name: input.name.trim(),
      description: input.description.trim() || null,
      address: input.address.trim() || null,
      city: input.city.trim() || "",
      lat: input.lat,
      lng: input.lng,
      tags: input.tags,
      status: "active",
      created_by: uid,
      created_at: new Date().toISOString(),
      photos: [],
      crowd: [],
    });
    persist();
    return id;
  },

  async addPhoto(pandalId: string, file: Blob, uid: string, photoId: string): Promise<void> {
    await latency();
    if (db().some((x) => x.photos.some((ph) => ph.id === photoId))) return; // idempotent retry
    if (typeof window !== "undefined" && window.__mockFailUploads) {
      throw new Error("Failed to fetch (simulated upload failure)");
    }
    const p = db().find((x) => x.id === pandalId);
    if (!p) throw new AppError("NOT_FOUND");
    const all = db().flatMap((x) => x.photos).filter((ph) => ph.user_id === uid);
    if (all.filter((ph) => new Date(ph.created_at).getTime() > dayAgo()).length >= 40) throw new AppError("QUOTA_PHOTO");
    if (p.photos.filter((ph) => ph.user_id === uid).length >= 10) throw new AppError("QUOTA_PHOTO_PER_PANDAL");
    const id = photoId;
    p.photos.push({
      id,
      url: URL.createObjectURL(file),
      storage_path: `${uid}/${pandalId}/${id}.jpg`,
      status: "active",
      user_id: uid,
      created_at: new Date().toISOString(),
    });
    persist();
  },

  async reportCrowd(pandalId: string, level: CrowdLevel, wait: number | null, uid: string): Promise<void> {
    await latency();
    const p = db().find((x) => x.id === pandalId);
    if (!p) throw new AppError("NOT_FOUND");
    const recent = p.crowd.find((c) => c.user_id === uid && Date.now() - new Date(c.created_at).getTime() < 10 * 60_000);
    if (recent) throw new AppError("CROWD_RATE");
    p.crowd.push({ level, wait_minutes: wait, created_at: new Date().toISOString(), user_id: uid });
    persist();
    listeners.forEach((fn) => fn());
  },

  async flag(kind: "pandal" | "photo", targetId: string, _reason: FlagReason, uid: string): Promise<void> {
    await latency();
    const today = flagLog.filter((f) => f.user === uid && f.at > dayAgo());
    if (today.length >= 20) throw new AppError("QUOTA_FLAG");
    const key = `${kind}:${targetId}`;
    const set = flags.get(key) ?? new Set<string>();
    if (set.has(uid)) throw new AppError("ALREADY_FLAGGED");
    set.add(uid);
    flags.set(key, set);
    flagLog.push({ user: uid, at: Date.now() });
    if (set.size >= 3) {
      for (const p of db()) {
        if (kind === "pandal" && p.id === targetId) p.status = "needs_review";
        if (kind === "photo") p.photos.forEach((ph) => ph.id === targetId && (ph.status = "needs_review"));
      }
    }
  },

  async deletePandal(id: string, uid: string): Promise<void> {
    await latency();
    const list = db();
    const i = list.findIndex((p) => p.id === id);
    if (i < 0) return;
    if (list[i].created_by !== uid) throw new AppError("PERMISSION");
    deletedIds.push(id);
    list.splice(i, 1);
    persist();
  },

  async deletePhoto(photoId: string, uid: string): Promise<void> {
    await latency();
    for (const p of db()) {
      const i = p.photos.findIndex((ph) => ph.id === photoId);
      if (i >= 0) {
        if (p.photos[i].user_id !== uid) throw new AppError("PERMISSION");
        p.photos.splice(i, 1);
        persist();
        return;
      }
    }
  },
};
