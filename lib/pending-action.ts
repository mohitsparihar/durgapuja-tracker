"use client";

import type { CrowdLevel, FlagReason } from "./types";

/**
 * An action interrupted by sign-in. Google OAuth leaves the page, so we stash what the
 * visitor was doing and reopen it (pre-filled, not auto-submitted) when they return.
 */
export type PendingAction =
  | { type: "crowd"; pandalId: string; level: CrowdLevel | null; wait: number | null }
  | { type: "flag"; pandalId: string; kind: "pandal" | "photo"; targetId: string; reason: FlagReason | null };

const KEY = "pandal-hop:pending-action";

export function savePendingAction(a: PendingAction) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...a, at: Date.now() }));
  } catch {
    /* non-critical */
  }
}

/** Returns and clears the pending action for this pandal (if fresh, < 15 min). */
export function takePendingAction(pandalId: string): PendingAction | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as PendingAction & { at: number };
    if (a.pandalId !== pandalId) return null;
    sessionStorage.removeItem(KEY);
    return Date.now() - a.at < 15 * 60_000 ? a : null;
  } catch {
    return null;
  }
}

export function clearPendingAction() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
