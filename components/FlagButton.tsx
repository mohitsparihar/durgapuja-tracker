"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { flagItem } from "@/lib/data";
import { friendlyError } from "@/lib/errors";
import { clearPendingAction, savePendingAction } from "@/lib/pending-action";
import type { FlagReason } from "@/lib/types";
import { FlagIcon } from "./icons";
import { Modal } from "./Modal";

const REASONS: { value: FlagReason; label: string; kinds: ("pandal" | "photo")[] }[] = [
  { value: "wrong_location", label: "Wrong location", kinds: ["pandal"] },
  { value: "duplicate", label: "Duplicate of another pandal", kinds: ["pandal", "photo"] },
  { value: "inappropriate", label: "Inappropriate or offensive", kinds: ["pandal", "photo"] },
  { value: "spam", label: "Spam or not a pandal", kinds: ["pandal", "photo"] },
  { value: "other", label: "Something else", kinds: ["pandal", "photo"] },
];

/** "Report" — sign-in gated; three distinct reports mark an item for review (never hide it). */
export function FlagButton({
  kind,
  targetId,
  pandalId,
  resume,
  onDone,
  compact = false,
}: {
  kind: "pandal" | "photo";
  targetId: string;
  pandalId: string;
  /** Set when returning from sign-in mid-report: reopen with this reason pre-selected. */
  resume?: { reason: FlagReason | null };
  onDone: (msg: string) => void;
  compact?: boolean;
}) {
  const { user, requireUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<FlagReason | null>(null);

  const resumedOnce = useRef(false);
  useEffect(() => {
    if (resume && user && !resumedOnce.current) {
      resumedOnce.current = true;
      setReason(resume.reason);
      setOpen(true);
    }
  }, [resume, user]);

  const signInFor = (msg: string, r: FlagReason | null) => {
    const u = requireUser(msg, {
      onSignedIn: () => {
        clearPendingAction();
        setOpen(true);
      },
    });
    if (!u) savePendingAction({ type: "flag", pandalId, kind, targetId, reason: r });
    return u;
  };
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = () => {
    const what = kind === "pandal" ? "this pandal" : "this photo";
    if (signInFor(`Sign in to report ${what}.`, null)) setOpen(true);
  };

  const submit = async () => {
    if (!reason) return;
    const u = signInFor("Sign in to send a report.", reason);
    if (!u) return;
    setBusy(true);
    setErr(null);
    try {
      await flagItem(kind, targetId, reason, u.id);
      setOpen(false);
      setReason(null);
      onDone("Thanks — we'll take a look.");
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={start}
        aria-label={kind === "pandal" ? "Report this pandal" : "Report this photo"}
        data-testid={`flag-${kind}`}
        className={
          compact
            ? "grid h-12 w-12 place-items-center rounded-full bg-indigo/70 text-ivory"
            : "flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-line px-4 text-base font-semibold text-ink-2"
        }
      >
        <FlagIcon />
        {!compact && "Report"}
      </button>
      {open && (
        <Modal title={kind === "pandal" ? "Report this pandal" : "Report this photo"} onClose={() => setOpen(false)} testId="flag-modal">
          <p className="text-base text-ink-2">Reports are reviewed. Nothing is removed automatically.</p>
          <fieldset className="mt-3 space-y-2">
            <legend className="sr-only">Reason</legend>
            {REASONS.filter((r) => r.kinds.includes(kind)).map((r) => (
              <label
                key={r.value}
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 text-base ${
                  reason === r.value ? "border-indigo bg-ivory-2 font-semibold" : "border-line"
                }`}
              >
                <input
                  type="radio"
                  name="flag-reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="h-5 w-5 accent-indigo"
                />
                {r.label}
              </label>
            ))}
          </fieldset>
          {err && <p className="mt-3 text-base font-medium text-vermilion-ink" role="alert">{err}</p>}
          <button
            disabled={!reason || busy}
            onClick={submit}
            className="mt-4 h-12 w-full rounded-xl bg-indigo text-base font-semibold text-ivory disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send report"}
          </button>
        </Modal>
      )}
    </>
  );
}
