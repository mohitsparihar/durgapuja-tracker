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

export function LocationBanner({ onRetry, onSearch }: { onRetry: () => void; onSearch: () => void }) {
  return (
    <Banner
      icon={<LocateIcon />}
      testId="location-banner"
      action={
        <div className="flex shrink-0 gap-1">
          <button onClick={onSearch} className="h-11 rounded-xl bg-marigold px-3 text-sm font-bold text-indigo">
            Search a place
          </button>
          <button onClick={onRetry} className="h-11 rounded-xl px-2 text-sm font-semibold text-ink-2 underline">
            Retry
          </button>
        </div>
      }
    >
      Location is off.
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
          <button onClick={onRetry} className="h-11 shrink-0 rounded-xl px-3 text-sm font-bold text-vermilion-ink underline">
            Retry
          </button>
        )
      }
    >
      {message}
    </Banner>
  );
}
