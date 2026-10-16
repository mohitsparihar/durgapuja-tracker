"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon } from "./icons";

/** Bottom-anchored modal sheet (centered on wide screens). Escape and backdrop close it. */
export function Modal({
  title,
  onClose,
  children,
  testId,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("button, input, select, textarea")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center" role="presentation">
      <button aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-indigo/50" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-paper shadow-2xl sm:rounded-3xl"
        style={{ paddingBottom: "calc(16px + var(--safe-b))" }}
      >
        <div className="festive-edge rounded-t-3xl" aria-hidden />
        <div className="flex items-start justify-between gap-3 px-5 pt-3">
          <h2 className="pt-2 text-xl font-bold leading-tight">{title}</h2>
          <button
            onClick={onClose}
            className="-mr-2 grid h-12 w-12 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-ivory-2"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="px-5 pt-2">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmModal({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={title} onClose={onClose} testId="confirm-modal">
      <p className="text-base text-ink-2">{body}</p>
      {err && <p className="mt-3 text-base font-medium text-vermilion-ink" role="alert">{err}</p>}
      <div className="mt-5 flex gap-2">
        <button onClick={onClose} className="h-12 flex-1 rounded-xl border-2 border-line text-base font-semibold">
          Cancel
        </button>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await onConfirm();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Something went wrong.");
              setBusy(false);
            }
          }}
          className="h-12 flex-1 rounded-xl bg-vermilion text-base font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/** Tiny polite toast. */
export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="toast"
      className="fixed inset-x-3 z-[1100] mx-auto max-w-md rounded-2xl bg-indigo px-4 py-3 text-base text-ivory shadow-xl"
      style={{ bottom: "calc(16px + var(--safe-b))" }}
    >
      {message}
    </div>
  );
}
