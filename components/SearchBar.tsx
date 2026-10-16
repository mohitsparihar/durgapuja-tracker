"use client";

import { useEffect, useRef, useState } from "react";
import { lookupPlace, searchPlaces } from "@/lib/geocode-client";
import { useI18n } from "@/lib/i18n";
import type { GeocodeResult, PlaceSuggestion } from "@/lib/types";
import { CloseIcon, PinIcon, SearchIcon } from "./icons";

/**
 * Place search. Suggestions come from Google Places as the visitor types.
 * Choosing a row resolves it to a map point.
 */
export function SearchBar({
  onPick,
  placeholder,
  dark = true,
  testId = "place-search",
}: {
  onPick: (r: GeocodeResult) => void;
  placeholder?: string;
  dark?: boolean;
  testId?: string;
}) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<PlaceSuggestion[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const skipSearch = useRef(false);

  const cancel = () => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
  };

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) {
        abort.current?.abort();
        abort.current = null;
        setBusy(false);
        setResults(null);
        setMsg(null);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      abort.current?.abort();
    };
  }, []);

  const run = async (query: string) => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setBusy(true);
    setMsg(null);
    try {
      const r = await searchPlaces(query, lang, ac.signal);
      if (abort.current !== ac) return;
      if (r.status === "busy") setMsg(t("searchBusy"));
      else if (r.status === "error") setMsg(t("searchFailed"));
      else if (r.results.length === 0) {
        setResults(null);
        setMsg(t("searchNone"));
      } else setResults(r.results);
    } catch {
      /* aborted */
    } finally {
      if (abort.current === ac) setBusy(false);
    }
  };

  useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false;
      return;
    }
    const query = q.trim();
    if (query.length < 2) {
      abort.current?.abort();
      abort.current = null;
      setBusy(false);
      setResults(null);
      return;
    }
    const timer = setTimeout(() => void run(query), 350);
    return () => clearTimeout(timer);
    // run closes over lang; q and lang are the triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, lang]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (query.length < 2) {
      setMsg(t("searchMin"));
      return;
    }
    void run(query);
  };

  const finish = (r: GeocodeResult) => {
    cancel();
    setResults(null);
    setMsg(null);
    const short = r.label.split(",")[0];
    if (short !== q) skipSearch.current = true;
    setQ(short);
    (document.activeElement as HTMLElement | null)?.blur();
    onPick(r);
  };

  const pick = async (r: PlaceSuggestion) => {
    if (r.lat != null && r.lng != null) {
      finish({ label: r.label, lat: r.lat, lng: r.lng });
      return;
    }
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setBusy(true);
    setMsg(null);
    try {
      const found = await lookupPlace(r.placeId, ac.signal);
      if (abort.current !== ac) return;
      if (found.status === "error") setMsg(t("searchFailed"));
      else finish({ label: r.label, lat: found.result.lat, lng: found.result.lng });
    } catch {
      /* aborted */
    } finally {
      if (abort.current === ac) setBusy(false);
    }
  };

  return (
    <div ref={box} className="relative w-full">
      <form role="search" onSubmit={submit} className="flex h-12 w-full items-stretch gap-0" data-testid={testId}>
        <label className="sr-only" htmlFor={`${testId}-input`}>
          {t("searchPlace")}
        </label>
        <div
          className={`flex min-w-0 flex-1 items-center rounded-l-2xl border-2 pl-3 ${
            dark ? "border-transparent bg-paper" : "border-line bg-paper"
          }`}
        >
          <SearchIcon className="h-5 w-5 shrink-0 text-ink-2" />
          <input
            id={`${testId}-input`}
            value={q}
            onChange={(e) => {
              setMsg(null);
              setQ(e.target.value);
            }}
            placeholder={placeholder ?? t("searchPlaceholder")}
            enterKeyHint="search"
            autoComplete="off"
            role="combobox"
            aria-expanded={Boolean(results?.length)}
            aria-controls={`${testId}-results`}
            aria-autocomplete="list"
            className="h-full min-w-0 flex-1 bg-transparent px-2 text-ink placeholder:text-ink-2/80 focus:outline-none"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                cancel();
                setQ("");
                setResults(null);
                setMsg(null);
              }}
              className="grid h-11 w-11 shrink-0 place-items-center text-ink-2"
              aria-label={t("clearSearch")}
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={busy}
          className="min-w-[76px] rounded-r-2xl bg-marigold px-3 text-base font-bold text-indigo disabled:opacity-70"
        >
          {busy ? "…" : t("search")}
        </button>
      </form>

      {(results || msg) && (
        <div
          id={`${testId}-results`}
          className="absolute inset-x-0 top-[calc(100%+6px)] z-[900] max-h-[50vh] overflow-y-auto rounded-2xl border border-line bg-paper text-ink shadow-xl"
          role="listbox"
          aria-live="polite"
          data-testid={`${testId}-results`}
        >
          {msg && <p className="px-4 py-3 text-base text-ink-2">{msg}</p>}
          {results?.map((r) => (
            <button
              key={r.placeId}
              type="button"
              role="option"
              onClick={() => void pick(r)}
              className="flex min-h-12 w-full items-start gap-2 border-b border-line px-4 py-3 text-left text-base text-ink last:border-0 active:bg-ivory-2"
            >
              <PinIcon className="mt-0.5 h-5 w-5 shrink-0 text-vermilion" />
              <span className="break-words">{r.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
