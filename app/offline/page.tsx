"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { CrowdBadge } from "@/components/CrowdBadge";
import { WifiOffIcon } from "@/components/icons";
import { LAST_LIST_KEY, type CachedList } from "@/lib/offline";
import { formatDistance } from "@/lib/geo";
import { storage, useOnline } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useNow } from "@/lib/time";

/** Served by the service worker when a page can't load offline. */
export default function OfflinePage() {
  const [cached, setCached] = useState<CachedList | null>(null);
  const online = useOnline();
  const { t, ago } = useI18n();
  const now = useNow();
  useEffect(() => setCached(storage.get<CachedList>(LAST_LIST_KEY)), []);

  return (
    <main className="min-h-dvh bg-ivory">
      <AppHeader />
      <div className="mx-auto max-w-xl px-4 pt-4 lg:max-w-5xl lg:pt-8" style={{ paddingBottom: "calc(24px + var(--safe-b))" }}>
        <div className="flex items-start gap-3 rounded-2xl bg-indigo p-4 text-ivory" role="status" data-testid="offline-banner">
          <WifiOffIcon className="mt-0.5 h-6 w-6 shrink-0 text-marigold" />
          <div>
            <h1 className="text-lg font-bold">{t("offlineTitle")}</h1>
            <p className="text-base text-ivory/85">
              {t("offlineStale")} {online ? t("backOnline") : t("signalReturns")}
            </p>
            {online && (
              <Link href="/" className="mt-3 inline-flex h-12 items-center rounded-xl bg-marigold px-4 font-bold text-indigo">
                {t("reloadMap")}
              </Link>
            )}
          </div>
        </div>

        {cached && cached.items.length > 0 ? (
          <>
            <h2 className="mt-5 text-lg font-bold">
              {cached.title} <span className="text-sm font-normal text-ink-2">· {t("savedAgo", { ago: ago(cached.savedAt, now) })}</span>
            </h2>
            <ul className="mt-2 grid gap-2 lg:grid-cols-2 lg:gap-3">
              {cached.items.map((p) => (
                <li key={p.id} className="rounded-2xl border border-line bg-paper p-3">
                  <p className="break-words text-[17px] font-semibold leading-snug">{p.name}</p>
                  <p className="text-sm text-ink-2">
                    {formatDistance(p.distance_m) && <strong className="text-ink">{formatDistance(p.distance_m)} · </strong>}
                    {p.address ?? p.city}
                  </p>
                  <div className="mt-1.5">
                    <CrowdBadge crowd={p.crowd} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-5 text-base text-ink-2">{t("noSaved")}</p>
        )}
      </div>
    </main>
  );
}
