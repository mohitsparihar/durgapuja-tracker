"use client";

import { AlertIcon, LocateIcon, WifiOffIcon } from "./icons";

function Banner({
  icon,
  children,
  action,
  testId,
  tone = "light",
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  testId: string;
  tone?: "light" | "dark";
}) {
  return (
    <div
      role="status"
      data-testid={testId}
      className={`pointer-events-auto flex items-center gap-2 rounded-2xl px-3 py-2 shadow-lg ${
        tone === "dark" ? "bg-indigo text-ivory" : "border border-line bg-paper text-ink"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <p className="min-w-0 flex-1 text-[15px] leading-snug">{children}</p>
      {action}
    </div>
  );
}

export function OfflineBanner({ hasCache }: { hasCache: boolean }) {
  return (
    <Banner icon={<WifiOffIcon />} testId="offline-banner" tone="dark">
      You&apos;re offline{hasCache ? " — showing last loaded pandals." : ". Pandals will load when you're back online."}
    </Banner>
  );
}

/** Location is blocked in the browser: say how to fix it, offer search meanwhile. */
export function LocationBanner({ onRetry, onSearch }: { onRetry: () => void; onSearch: () => void }) {
  return (
    <Banner
      icon={<LocateIcon />}
      testId="location-banner"
      action={
        <div className="flex shrink-0 gap-1">
          <button onClick={onSearch} className="h-12 rounded-xl bg-marigold px-3 text-sm font-bold text-indigo">
            Search a place
          </button>
          <button onClick={onRetry} className="h-12 rounded-xl px-2 text-sm font-semibold text-ink-2 underline">
            Retry
          </button>
        </div>
      }
    >
      Location is blocked. Allow it from the icon next to the address bar, or search a place.
    </Banner>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Banner
      icon={<AlertIcon className="h-5 w-5 text-vermilion" />}
      testId="error-banner"
      action={
        onRetry && (
          <button onClick={onRetry} className="h-12 shrink-0 rounded-xl px-3 text-sm font-bold text-vermilion-ink underline">
            Retry
          </button>
        )
      }
    >
      {message}
    </Banner>
  );
}

/** First-visit ask: explains why before the browser's own permission prompt appears. */
export function LocationPrompt({ onAllow, onDismiss, busy }: { onAllow: () => void; onDismiss: () => void; busy: boolean }) {
  return (
    <div
      role="dialog"
      aria-labelledby="loc-prompt-title"
      data-testid="location-prompt"
      className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-3xl bg-paper text-ink shadow-2xl"
    >
      <div className="festive-edge" aria-hidden />
      <div className="p-5">
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-indigo text-marigold">
          <LocateIcon className="h-6 w-6" />
        </div>
        <h2 id="loc-prompt-title" className="text-xl font-bold leading-tight">
          See pandals near you
        </h2>
        <p className="mt-1 text-base text-ink-2">
          Share your location to list the closest pandals first, with live crowd levels. It&apos;s only used to sort
          the list — we don&apos;t save it.
        </p>
        <button
          onClick={onAllow}
          disabled={busy}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-vermilion text-base font-bold text-white disabled:opacity-70"
          data-testid="location-allow"
        >
          <LocateIcon /> {busy ? "Finding you…" : "Use my location"}
        </button>
        <button
          onClick={onDismiss}
          className="mt-1 h-12 w-full rounded-xl text-base font-semibold text-ink-2"
          data-testid="location-dismiss"
        >
          Not now — I&apos;ll search a place
        </button>
      </div>
    </div>
  );
}

/** Slim reminder after "Not now": one tap to switch to nearby pandals. */
export function NearMeChip({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      data-testid="near-me-chip"
      className="pointer-events-auto flex h-12 items-center gap-2 rounded-full bg-indigo px-5 text-base font-semibold text-ivory shadow-lg"
    >
      <LocateIcon /> Show pandals near me
    </button>
  );
}
