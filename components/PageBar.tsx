"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Wordmark } from "./AppHeader";
import { BackIcon, HomeIcon } from "./icons";

/** Compact indigo bar for inner pages: back, home, title, and language. */
export function PageBar({ title, right }: { title: string; right?: React.ReactNode }) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <header
      className="sticky top-0 z-[600] bg-indigo text-ivory"
      style={{ paddingTop: "var(--safe-t)", paddingLeft: "var(--safe-l)", paddingRight: "var(--safe-r)" }}
    >
      <div className="string-lights pointer-events-none absolute inset-x-0 top-[var(--safe-t)] h-[18px] opacity-60" aria-hidden />
      <div className="relative flex h-14 items-center gap-1 px-1 lg:mx-auto lg:h-16 lg:max-w-6xl lg:gap-3 lg:px-4">
        <button
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full active:bg-indigo-2"
          aria-label={t("back")}
        >
          <BackIcon className="h-6 w-6" />
        </button>
        <Link
          href="/"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full active:bg-indigo-2"
          aria-label={t("home")}
        >
          <HomeIcon className="h-6 w-6" />
        </Link>
        <Link href="/" className="hidden shrink-0 lg:block" aria-label={t("home")}>
          <Wordmark small />
        </Link>
        <span className="hidden h-6 w-px bg-ivory/25 lg:block" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</p>
        <LanguageSwitcher compact />
        {right}
      </div>
      <div className="festive-edge" aria-hidden />
    </header>
  );
}
