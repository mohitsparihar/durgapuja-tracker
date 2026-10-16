"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { reportCrowd } from "@/lib/data";
import { friendlyError } from "@/lib/errors";
import { clearPendingAction, savePendingAction } from "@/lib/pending-action";
import type { CrowdLevel, CrowdReport } from "@/lib/types";
import { CROWD_META } from "./CrowdBadge";
import { CrowdIcon } from "./icons";

const WAITS: { label: string; value: number | null }[] = [
  { label: "Skip", value: null },
  { label: "None", value: 0 },
  { label: "10 min", value: 10 },
  { label: "20 min", value: 20 },
  { label: "30 min", value: 30 },
  { label: "1 hr+", value: 60 },
];

/**
 * "How crowded is it right now?" — pick a level (and optionally a wait), then send.
 * Shows the report optimistically with a "sending…" state; reverts on failure.
 */
export function CrowdReportButtons({
  pandalId,
  initialLevel = null,
  initialWait = null,
  onOptimistic,
  onSettled,
}: {
  pandalId: string;
  /** Pre-filled when resuming after sign-in. */
  initialLevel?: CrowdLevel | null;
  initialWait?: number | null;
  onOptimistic: (r: CrowdReport | null) => void;
  onSettled: (ok: boolean, message: string) => void;
}) {
  const { requireUser } = useAuth();
  const [level, setLevel] = useState<CrowdLevel | null>(initialLevel);
  const [wait, setWait] = useState<number | null>(initialWait);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    if (!level) return;
    const u = requireUser("Sign in to report how crowded this pandal is.", {
      onSignedIn: () => clearPendingAction(), // demo sign-in stays on the page
    });
    if (!u) {
      // Real sign-in leaves the page: remember the choice and reopen it on return.
      savePendingAction({ type: "crowd", pandalId, level, wait });
      return;
    }
    setBusy(true);
    setErr(null);
    onOptimistic({ level, wait_minutes: wait, created_at: new Date().toISOString() });
    try {
      await reportCrowd(pandalId, level, wait, u.id);
      setLevel(null);
      setWait(null);
      onSettled(true, "Thanks! Your crowd report is live for the next 45 minutes.");
    } catch (e) {
      onOptimistic(null);
      const m = friendlyError(e);
      setErr(m);
      onSettled(false, m);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="crowd-report">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Crowd level">
        {(Object.keys(CROWD_META) as CrowdLevel[]).map((l) => {
          const m = CROWD_META[l];
          const on = level === l;
          return (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setLevel(on ? null : l)}
              className={`flex min-h-14 items-center gap-2 rounded-xl border-2 px-3 py-2 text-left ${
                on ? "text-white" : "border-line bg-paper text-ink"
              }`}
              style={on ? { background: m.color, borderColor: m.color } : undefined}
            >
              <CrowdIcon level={l} className="h-6 w-6 shrink-0" />
              <span>
                <span className="block text-base font-bold leading-tight">{m.label}</span>
                <span className={`block text-sm leading-tight ${on ? "text-white/90" : "text-ink-2"}`}>{m.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {level && (
        <div className="mt-3">
          <p className="mb-1.5 text-sm font-semibold text-ink-2" id="wait-label">
            Queue wait (optional)
          </p>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-labelledby="wait-label">
            {WAITS.map((w) => (
              <button
                key={w.label}
                type="button"
                role="radio"
                aria-checked={wait === w.value}
                onClick={() => setWait(w.value)}
                className={`h-12 shrink-0 rounded-full border-2 px-4 text-base font-medium ${
                  wait === w.value ? "border-indigo bg-indigo text-ivory" : "border-line bg-paper"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="mt-3 h-12 w-full rounded-xl bg-indigo text-base font-semibold text-ivory disabled:opacity-60"
            data-testid="crowd-send"
          >
            {busy ? "Sending…" : `Send “${CROWD_META[level].label}”`}
          </button>
        </div>
      )}
      {err && (
        <p className="mt-2 text-base font-medium text-vermilion-ink" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
