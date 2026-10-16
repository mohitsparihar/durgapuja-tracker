"use client";

import { useEffect, useRef, useState } from "react";
import { IS_MOCK } from "@/lib/config";
import { useI18n } from "@/lib/i18n";
import { CloseIcon } from "./icons";

export function SignInSheet({
  reason,
  onSignIn,
  onClose,
}: {
  reason: string;
  onSignIn: () => Promise<void> | void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const firstBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center" role="presentation">
      <button aria-label={t("close")} className="absolute inset-0 bg-indigo/50" onClick={onClose} tabIndex={-1} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-title"
        className="relative w-full max-w-md rounded-t-3xl bg-paper shadow-2xl"
        style={{ paddingBottom: "calc(20px + var(--safe-b))" }}
      >
        <div className="festive-edge rounded-t-3xl" />
        <div className="px-5 pt-4">
          <div className="flex items-start justify-between gap-3">
            <h2 id="signin-title" className="text-xl font-bold leading-tight">
              {t("signInContinue")}
            </h2>
            <button
              onClick={onClose}
              className="-mr-2 -mt-1 grid h-12 w-12 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-ivory-2"
              aria-label={t("close")}
            >
              <CloseIcon />
            </button>
          </div>
          <p className="mt-1 text-base text-ink-2">{reason}</p>
          <p className="mt-1 text-sm text-ink-2">{t("browseOpen")}</p>

          <button
            ref={firstBtn}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSignIn();
              } finally {
                setBusy(false);
              }
            }}
            className="mt-5 flex h-14 w-full items-center justify-center gap-3 rounded-2xl border-2 border-ink bg-paper text-lg font-semibold text-ink active:bg-ivory-2 disabled:opacity-60"
          >
            {IS_MOCK ? (
              <span>{t("continueDemo")}</span>
            ) : (
              <>
                <GoogleG />
                <span>{busy ? t("openingGoogle") : t("continueGoogle")}</span>
              </>
            )}
          </button>
          <button onClick={onClose} className="mt-2 h-12 w-full rounded-2xl text-base font-medium text-ink-2">
            {t("notNow")}
          </button>
        </div>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="h-6 w-6" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
