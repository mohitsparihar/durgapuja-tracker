"use client";

import { useI18n, type Key } from "@/lib/i18n";
import { freshCrowd, useNow } from "@/lib/time";
import type { CrowdLevel, CrowdReport } from "@/lib/types";
import { CrowdIcon } from "./icons";

export const CROWD_META: Record<CrowdLevel, { label: Key; hint: Key; color: string }> = {
  low: { label: "crowdLow", hint: "crowdLowHint", color: "var(--crowd-low)" },
  medium: { label: "crowdMedium", hint: "crowdMediumHint", color: "var(--crowd-medium)" },
  high: { label: "crowdHigh", hint: "crowdHighHint", color: "var(--crowd-high)" },
  very_high: { label: "crowdVeryHigh", hint: "crowdVeryHighHint", color: "var(--crowd-very-high)" },
};

/**
 * Crowd status: icon + text label + report age. Colour is reinforcement only.
 * Reports older than 45 minutes disappear even without a refetch.
 */
export function CrowdBadge({
  crowd,
  size = "sm",
  pending = false,
}: {
  crowd: CrowdReport | null;
  size?: "sm" | "lg";
  pending?: boolean;
}) {
  const now = useNow(30_000);
  const { t, ago } = useI18n();
  const c = freshCrowd(crowd, now);
  const lg = size === "lg";

  if (!c) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-paper text-ink-2 ${
          lg ? "px-3 py-2 text-base" : "px-2 py-0.5 text-sm"
        }`}
        data-testid="crowd-badge"
      >
        <CrowdIcon level={null} className={lg ? "h-5 w-5" : "h-4 w-4"} />
        {t("noRecentCrowd")}
      </span>
    );
  }

  const m = CROWD_META[c.level];
  return (
    <span
      className={`inline-flex flex-wrap items-center gap-x-1.5 rounded-full font-semibold text-white ${
        lg ? "px-3.5 py-2 text-base" : "px-2.5 py-0.5 text-sm"
      }`}
      style={{ background: m.color }}
      data-testid="crowd-badge"
      data-level={c.level}
    >
      <CrowdIcon level={c.level} className={lg ? "h-5 w-5" : "h-4 w-4"} />
      <span>{t(m.label)}</span>
      {c.wait_minutes != null && (
        <span className="font-normal opacity-95">
          · {c.wait_minutes === 0 ? t("noWait") : c.wait_minutes >= 60 ? t("hrWait") : t("minWait", { n: c.wait_minutes })}
        </span>
      )}
      <span className="font-normal opacity-95">· {pending ? t("sending") : ago(c.created_at, now)}</span>
    </span>
  );
}
