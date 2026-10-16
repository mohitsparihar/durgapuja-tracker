"use client";

import { useI18n, type Lang } from "@/lib/i18n";

const OPTIONS: { id: Lang; label: string }[] = [
  { id: "en", label: "EN" },
  { id: "hi", label: "हि" },
  { id: "bn", label: "বা" },
];

/** English, Hindi, and Bengali. The choice is remembered on this device. */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="flex shrink-0 rounded-full bg-indigo-2 p-0.5" role="group" aria-label={t("language")}>
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setLang(o.id)}
          aria-pressed={lang === o.id}
          className={`rounded-full font-bold ${compact ? "h-8 min-w-8 px-1.5 text-xs" : "h-9 min-w-9 px-2 text-sm"} ${
            lang === o.id ? "bg-marigold text-indigo" : "text-ivory"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
