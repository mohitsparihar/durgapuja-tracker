"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { LocateIcon, MinusIcon, PlusIcon } from "@/components/icons";
import { PandalCard, PandalCardSkeleton } from "@/components/PandalCard";
import { SearchBar } from "@/components/SearchBar";
import { ErrorBanner, LocationBanner, LocationPrompt, NearMeChip, OfflineBanner } from "@/components/StateBanners";
import { useAuth } from "@/lib/auth";
import { LIMITS } from "@/lib/config";
import { nearbyPandals, pandalClusters, pandalsInBounds, subscribeCrowd } from "@/lib/data";
import { errorKey } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { boundsCenter, clusterCellDeg, distanceM } from "@/lib/geo";
import { storage, useIsSide, useOnline, useRefetchOnReturn } from "@/lib/hooks";
import { LAST_LIST_KEY, type CachedList } from "@/lib/offline";
import type { Cluster, GeocodeResult, LatLng, PandalSummary } from "@/lib/types";
import { BottomSheet, sheetHeightFor, type Snap } from "./BottomSheet";
import type { MapApi, MapView } from "./HomeMap";

const HomeMap = dynamic(() => import("./HomeMap"), {
  ssr: false,
  loading: () => <div className="skeleton h-full w-full" aria-label="Loading map" />,
});

/**
 * checking: reading the saved permission · ask: show our explainer first · pending: browser
 * prompt / GPS fix in progress · granted · denied (blocked in browser) · dismissed ("Not now").
 */
type LocState = "checking" | "ask" | "pending" | "granted" | "denied" | "dismissed";
const LOC_DISMISSED_KEY = "pandal-hop:location-dismissed";
/** Re-sort the nearby list once the visitor has walked this far. */
const FOLLOW_MOVE_M = 300;
interface RefPoint extends LatLng {
  label: string;
  kind: "gps" | "place";
}
interface ListState {
  items: PandalSummary[];
  truncated: boolean;
  loading: boolean;
  error: string | null;
  fromCache: boolean;
  /** Which reference point the items belong to (nearby list only). */
  ref?: string;
}


const EMPTY_LIST: ListState = { items: [], truncated: false, loading: false, error: null, fromCache: false };

export default function HomeClient() {
  const router = useRouter();
  const { requireUser } = useAuth();
  const { t } = useI18n();
  const online = useOnline();
  const side = useIsSide();

  const mapApi = useRef<MapApi | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [headerH, setHeaderH] = useState(120);

  const [view, setView] = useState<MapView | null>(null);
  const [ref, setRef] = useState<RefPoint | null>(null);
  const [userPoint, setUserPoint] = useState<LatLng | null>(null);
  const [loc, setLoc] = useState<LocState>("checking");
  const [markers, setMarkers] = useState<PandalSummary[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [area, setArea] = useState<ListState>({ ...EMPTY_LIST, loading: true });
  const [nearby, setNearby] = useState<ListState>(EMPTY_LIST);
  const [selected, setSelected] = useState<PandalSummary | null>(null);
  const [snap, setSnap] = useState<Snap>("peek");
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);
  useRefetchOnReturn(refetch);

  // Header height feeds the sheet's full-height snap.
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderH(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Realtime crowd updates only *trigger* a refetch (events aren't guaranteed delivery).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = subscribeCrowd(() => {
      clearTimeout(t);
      t = setTimeout(refetch, 800);
    });
    return () => {
      clearTimeout(t);
      off();
    };
  }, [refetch]);

  // ---- Geolocation -------------------------------------------------------
  // Bumped whenever the visitor picks a place / area, so a late GPS fix can't override it.
  const choiceSeq = useRef(0);
  const locate = useCallback((fly: boolean) => {
    const seqAtStart = choiceSeq.current;
    if (!("geolocation" in navigator)) {
      setLoc("denied");
      return;
    }
    setLoc((l) => (l === "granted" ? l : "pending"));
    // The browser's `timeout` only starts after the user answers the prompt; if they
    // ignore it, fall back to the all-India + search flow instead of waiting forever.
    // No answer isn't a refusal: fall back to "dismissed" (search + Near-me chip), not "blocked".
    const fallback = setTimeout(() => setLoc((l) => (l === "pending" ? "dismissed" : l)), 12_000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(fallback);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPoint(p);
        setLoc("granted");
        storage.remove(LOC_DISMISSED_KEY);
        if (choiceSeq.current !== seqAtStart) return;
        setRef({ ...p, label: "you", kind: "gps" });
        if (fly) mapApi.current?.flyTo(p, 14);
      },
      (err) => {
        clearTimeout(fallback);
        // Only a real refusal means "blocked"; no GPS fix / timeout just falls back to search.
        setLoc((l) => (l === "granted" ? l : err.code === err.PERMISSION_DENIED ? "denied" : "dismissed"));
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  const onReady = useCallback((api: MapApi) => {
    mapApi.current = api;
  }, []);

  // First load: if location was already allowed, go straight to nearby pandals. Otherwise
  // explain why first (our card), and only then trigger the browser's permission prompt.
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLoc("denied");
      return;
    }
    let status: PermissionStatus | null = null;
    const apply = (state: PermissionState | "unknown") => {
      if (state === "granted") locate(true);
      else if (state === "denied") setLoc("denied");
      else setLoc(storage.get<boolean>(LOC_DISMISSED_KEY) ? "dismissed" : "ask");
    };
    const onChange = () => status && apply(status.state);
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((s) => {
          status = s;
          s.addEventListener("change", onChange);
          apply(s.state);
        })
        .catch(() => apply("unknown")); // e.g. older Safari: just ask
    } else {
      apply("unknown");
    }
    return () => status?.removeEventListener("change", onChange);
  }, [locate]);

  // While location is on, follow the visitor: move the blue dot, and re-sort the nearby list
  // after they've walked ~300 m (pandal-hopping), unless they chose a place to look at.
  // Read the current reference point from a ref so the watch callback stays pure
  // (no side effects inside a state updater, which React may call twice).
  const refNow = useRef<RefPoint | null>(null);
  useEffect(() => {
    refNow.current = ref;
  }, [ref]);
  useEffect(() => {
    if (loc !== "granted" || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPoint(p);
        const r = refNow.current;
        if (r?.kind === "gps" && distanceM(r, p) >= FOLLOW_MOVE_M) {
          setRef({ ...p, label: "you", kind: "gps" });
        }
      },
      () => {
        /* keep the last known position */
      },
      { enableHighAccuracy: false, maximumAge: 30_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [loc]);

  const [askedViaCard, setAskedViaCard] = useState(false);
  const allowLocation = () => {
    setAskedViaCard(true);
    locate(true);
  };
  const showLocationCard = loc === "ask" || (loc === "pending" && askedViaCard);
  const dismissLocation = () => {
    storage.set(LOC_DISMISSED_KEY, true);
    setLoc("dismissed");
  };

  // ---- Map data: markers at zoom >= 10, otherwise clusters ------------------
  const mapReq = useRef(0);
  useEffect(() => {
    if (!view) return;
    const id = ++mapReq.current;
    const timer = setTimeout(async () => {
      if (view.zoom >= LIMITS.markerMinZoom) {
        setArea((a) => ({ ...a, loading: true, error: null }));
        try {
          const r = await pandalsInBounds(view.bounds);
          if (id !== mapReq.current) return;
          setMarkers(r.items);
          setClusters([]);
          setArea({ items: r.items, truncated: r.truncated, loading: false, error: null, fromCache: false });
        } catch (e) {
          if (id !== mapReq.current) return;
          setArea((a) => ({ ...a, loading: false, error: t(errorKey(e)) }));
        }
      } else {
        try {
          const c = await pandalClusters(view.bounds, clusterCellDeg(view.bounds));
          if (id !== mapReq.current) return;
          setClusters(c);
          setMarkers([]);
          setArea({ ...EMPTY_LIST });
        } catch (e) {
          if (id !== mapReq.current) return;
          setArea({ ...EMPTY_LIST, error: t(errorKey(e)) });
        }
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- request counter, not a DOM ref; bumping it is the point
      mapReq.current++; // invalidate any response still in flight for the old view
    };
  }, [view, tick]);

  // ---- Nearby list around the reference point -------------------------------
  const nearReq = useRef(0);
  const refKey = ref ? `${ref.lat},${ref.lng}` : "";
  useEffect(() => {
    if (!ref) return;
    const id = ++nearReq.current;
    // Never show the new title ("Near X") with the previous reference point's items.
    setNearby((n) => (n.ref === refKey ? { ...n, loading: true, error: null } : { ...EMPTY_LIST, loading: true, ref: refKey }));
    nearbyPandals(ref.lat, ref.lng)
      .then((r) => {
        if (id !== nearReq.current) return;
        setNearby({ items: r.items, truncated: r.truncated, loading: false, error: null, fromCache: false, ref: refKey });
      })
      .catch((e) => {
        if (id !== nearReq.current) return;
        setNearby((n) => ({ ...n, loading: false, error: t(errorKey(e)) }));
      });
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- request counter, not a DOM ref
      nearReq.current++;
    };
  }, [ref, refKey, tick]);

  // ---- Which list are we showing? ------------------------------------------
  const zoomedOut = (view?.zoom ?? 0) < LIMITS.markerMinZoom;
  const mode: "nearby" | "area" | "zoom" | "locating" = ref
    ? "nearby"
    : loc === "pending" || loc === "checking"
      ? "locating"
      : zoomedOut
        ? "zoom"
        : "area";
  const title =
    mode === "nearby"
      ? ref!.kind === "gps"
        ? t("nearby")
        : t("nearPlace", { place: ref!.label.split(",")[0] })
      : mode === "area"
        ? t("pandalsInArea")
        : mode === "locating"
          ? t("findingNear")
          : loc === "denied"
            ? t("zoomToSee")
            : t("findNear");
  const list: ListState = mode === "nearby" ? nearby : mode === "area" ? area : EMPTY_LIST;

  // Offline fallback: keep the last good list and show it when fetches fail offline.
  const [cached, setCached] = useState<CachedList | null>(null);
  useEffect(() => setCached(storage.get<CachedList>(LAST_LIST_KEY)), []);
  useEffect(() => {
    if (!list.loading && !list.error && list.items.length > 0) {
      const c = { title, items: list.items.slice(0, 50), savedAt: new Date().toISOString() };
      storage.set(LAST_LIST_KEY, c);
      setCached(c);
    }
  }, [list, title]);
  const showCached = !online && (list.error != null || list.items.length === 0) && cached != null;
  const shown = showCached ? cached!.items : list.items;

  // Pin the selected pandal to the top if it isn't part of the current list.
  const selectedOutside = selected && !shown.some((p) => p.id === selected.id) ? selected : null;

  // "Search this area" when the map has drifted away from the nearby reference point.
  const drifted = useMemo(() => {
    if (!ref || !view || zoomedOut) return false;
    const c = boundsCenter(view.bounds);
    const span = distanceM({ lat: view.bounds.south, lng: c.lng }, { lat: view.bounds.north, lng: c.lng });
    return distanceM(ref, c) > Math.max(1500, span * 0.6);
  }, [ref, view, zoomedOut]);

  // ---- Interactions --------------------------------------------------------
  const selectFromList = useCallback(
    (p: PandalSummary) => {
      setSelected(p);
      const next: Snap = snap === "full" ? "half" : snap;
      if (snap === "full") setSnap("half");
      const bottom = side ? 0 : sheetHeightFor(next, headerH, window.innerHeight);
      mapApi.current?.flyTo(p, Math.max(mapApi.current.getZoom(), 15), bottom);
    },
    [snap, side, headerH],
  );

  const selectFromMap = useCallback((p: PandalSummary) => {
    setSelected(p);
    setSnap((s) => (s === "peek" ? "half" : s));
    setTimeout(() => {
      document.getElementById(`card-${p.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 260);
  }, []);

  const onCluster = useCallback((c: Cluster) => {
    const z = mapApi.current?.getZoom() ?? 5;
    mapApi.current?.flyTo(c, Math.min(Math.max(z + 3, LIMITS.markerMinZoom), 13));
  }, []);

  const onPlace = useCallback((r: GeocodeResult) => {
    choiceSeq.current++;
    setRef({ lat: r.lat, lng: r.lng, label: r.label, kind: "place" });
    setSelected(null);
    const next: Snap = snap === "peek" ? "half" : snap;
    if (!side && snap === "peek") setSnap("half");
    const bottom = side ? 0 : sheetHeightFor(next, headerH, window.innerHeight);
    mapApi.current?.flyTo(r, 16, bottom);
  }, [snap, side, headerH]);

  const searchThisArea = () => {
    choiceSeq.current++;
    setRef(null);
    setSelected(null);
  };

  const addPandal = () => {
    if (requireUser(t("signInAdd"), { next: "/add", onSignedIn: () => router.push("/add") }))
      router.push("/add");
  };

  const focusSearch = () => document.getElementById("place-search-input")?.focus();

  // ---- Render --------------------------------------------------------------
  const listHeader = (
    <div className="px-4 pb-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 truncate text-lg font-bold" data-testid="list-title">
          {showCached ? cached!.title : title}
        </h2>
        {!list.loading && shown.length > 0 && (
          <span className="shrink-0 text-sm text-ink-2" data-testid="list-count">
            {shown.length === 1 && !list.truncated ? t("pandalCountOne") : t("pandalCount", { n: `${shown.length}${list.truncated ? "+" : ""}` })}
          </span>
        )}
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2" data-testid="place-legend">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-vermilion" aria-hidden />
          {t("kindPandal")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ramleela" aria-hidden />
          {t("kindRamleela")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ravan" aria-hidden />
          {t("kindRavan")}
        </span>
      </p>
      {mode === "nearby" && ref?.kind === "gps" && (
        <p className="text-sm text-ink-2">{t("withinKm", { km: LIMITS.nearbyRadiusM / 1000 })}</p>
      )}
    </div>
  );

  const listBody = (
    <div className="space-y-2.5 pt-1">
      {selectedOutside && (
        <PandalCard p={selectedOutside} selected onSelect={selectFromList} />
      )}

      {list.error && !showCached && <ErrorBanner message={list.error} onRetry={refetch} />}

      {(list.loading || mode === "locating") && shown.length === 0 &&
        Array.from({ length: 3 }, (_, i) => <PandalCardSkeleton key={i} />)}

      {mode === "zoom" && !showCached && (
        <EmptyState
          title={loc === "denied" ? t("zoomToSee") : t("whereAreYou")}
          body={loc === "denied" ? t("zoomBody") : t("whereBody")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {loc !== "denied" && (
                <button
                  onClick={allowLocation}
                  className="flex h-12 items-center gap-2 rounded-xl bg-vermilion px-4 text-base font-semibold text-white"
                  data-testid="list-use-location"
                >
                  <LocateIcon /> {t("useMyLocation")}
                </button>
              )}
              <button onClick={focusSearch} className="h-12 rounded-xl bg-indigo px-4 text-base font-semibold text-ivory">
                {t("searchPlace")}
              </button>
            </div>
          }
        />
      )}

      {shown.map((p) => (
        <PandalCard key={p.id} p={p} selected={selected?.id === p.id} onSelect={selectFromList} />
      ))}

      {!list.loading && !list.error && (mode === "nearby" || mode === "area") && shown.length === 0 && (
        <EmptyState
          title={t("noPandalsYet")}
          body={
            mode === "nearby"
              ? t("nothingWithin", { km: LIMITS.nearbyRadiusM / 1000 })
              : t("nothingOnMap")
          }
          action={
            <button onClick={addPandal} className="h-12 rounded-xl bg-vermilion px-4 text-base font-semibold text-white">
              {t("addAPandal")}
            </button>
          }
        />
      )}

      {list.truncated && !showCached && (
        <p className="px-1 py-2 text-center text-sm text-ink-2" data-testid="truncation-note">
          {mode === "nearby"
            ? t("showingNearest", { n: LIMITS.nearbyLimit })
            : t("showingBounds", { n: LIMITS.boundsLimit })}
        </p>
      )}
    </div>
  );

  const controlsHidden = !side && snap === "full";
  // With the sheet half open the map is small; shrink the FAB to an icon so it covers less.
  const fabCompact = !side && snap === "half";

  return (
    <div className="fixed inset-0 bg-ivory">
      <AppHeader
        ref={headerRef}
        overlay
        compact={side}
        actions={
          <button
            onClick={addPandal}
            className="flex h-12 items-center gap-2 rounded-full bg-vermilion pl-4 pr-5 text-base font-bold text-white shadow-[0_4px_14px_rgba(215,38,61,0.45)] active:bg-vermilion-ink"
            data-testid="add-header"
          >
            <PlusIcon className="h-5 w-5" /> {t("addPandal")}
          </button>
        }
      >
        <SearchBar onPick={onPlace} />
      </AppHeader>

      <div className={`absolute inset-0 flex ${side ? "flex-row" : ""}`}>
        {side && (
          <aside
            className="z-[500] flex h-full w-[min(360px,46vw)] shrink-0 flex-col border-r border-line bg-ivory lg:w-[400px] xl:w-[440px]"
            aria-label={t("pandalList")}
            data-testid="side-panel"
            style={{ paddingLeft: "var(--safe-l)", paddingTop: headerH }}
          >
            <div className="pt-3">{listHeader}</div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3" style={{ paddingBottom: "calc(16px + var(--safe-b))" }}>
              {listBody}
            </div>
          </aside>
        )}

        <div className="relative min-w-0 flex-1" style={side ? ({ "--sheet-h": "0px" } as React.CSSProperties) : undefined}>
          <div className="absolute inset-0">
            <HomeMap
              markers={markers}
              clusters={clusters}
              selectedId={selected?.id ?? null}
              userPoint={userPoint}
              placePoint={ref?.kind === "place" ? { lat: ref.lat, lng: ref.lng } : null}
              chromeTop={headerH}
              onMarkerSelect={selectFromMap}
              onClusterSelect={onCluster}
              onView={setView}
              onReady={onReady}
            />
          </div>

          {/* First-visit location explainer, centred in the visible part of the map */}
          {showLocationCard && (
            <div
              className="pointer-events-none absolute inset-0 z-[460] grid place-items-center bg-indigo/25 p-4"
              style={{ paddingBottom: side ? undefined : "calc(var(--sheet-h) + 16px)" }}
            >
              <LocationPrompt onAllow={allowLocation} onDismiss={dismissLocation} busy={loc === "pending"} />
            </div>
          )}

          {/* Top overlays */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[450] flex flex-col items-center gap-2 p-2">
            {!online && <OfflineBanner hasCache={cached != null} />}
            {online && loc === "denied" && !ref && (
              <LocationBanner onRetry={() => locate(true)} onSearch={focusSearch} />
            )}
            {loc === "dismissed" && !ref && <NearMeChip onClick={allowLocation} />}
            {drifted && (
              <button
                onClick={searchThisArea}
                className="pointer-events-auto h-12 rounded-full bg-indigo px-5 text-base font-semibold text-ivory shadow-lg"
                data-testid="search-area"
              >
                {t("searchThisArea")}
              </button>
            )}
          </div>

          {/* Map controls + FAB float above the sheet (portrait) or map corner (side). */}
          <div
            className={`absolute right-3 z-[450] flex flex-col items-end gap-2 transition-opacity ${
              controlsHidden ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
            style={{
              bottom: side
                ? "calc(28px + var(--safe-b))"
                : "calc(var(--sheet-h) + 28px)",
              paddingRight: "var(--safe-r)",
            }}
            aria-hidden={controlsHidden}
          >
            <div className={`flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-lg ${
                fabCompact ? "hidden" : "flex"
              } [@media(max-height:420px)]:hidden`}>
              <MapButton label={t("zoomIn")} onClick={() => mapApi.current?.zoomIn()}>
                <PlusIcon />
              </MapButton>
              <span className="h-px bg-line" />
              <MapButton label={t("zoomOut")} onClick={() => mapApi.current?.zoomOut()}>
                <MinusIcon />
              </MapButton>
            </div>
            <MapButton label={t("showMyLocation")} onClick={() => locate(true)} solo>
              <LocateIcon className={`h-5 w-5 ${loc === "granted" ? "text-[#2563eb]" : ""}`} />
            </MapButton>
            <button
              onClick={addPandal}
              aria-label={t("addPandal")}
              className={`mt-1 flex h-14 items-center justify-center gap-2 rounded-full bg-vermilion text-base font-bold text-white shadow-[0_6px_20px_rgba(215,38,61,0.45)] active:bg-vermilion-ink ${side ? "lg:hidden" : ""} ${
                fabCompact ? "w-14" : "pl-4 pr-5"
              }`}
              data-testid="add-fab"
            >
              <PlusIcon className="h-6 w-6" />
              {!fabCompact && <span>{t("addPandal")}</span>}
            </button>
          </div>
        </div>
      </div>

      {!side && (
        <BottomSheet snap={snap} onSnap={setSnap} topOffset={headerH} header={listHeader}>
          {listBody}
        </BottomSheet>
      )}
    </div>
  );
}

function MapButton({
  label,
  onClick,
  children,
  solo = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  solo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-12 w-12 place-items-center bg-paper text-ink active:bg-ivory-2 ${
        solo ? "rounded-2xl border border-line shadow-lg" : ""
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-paper text-center" data-testid="empty-state">
      <div className="festive-edge" aria-hidden />
      <div className="px-5 py-5">
        <svg viewBox="0 0 120 28" className="mx-auto mb-2 h-7 w-28" aria-hidden>
          <path d="M2 6 Q30 22 60 6 T118 6" stroke="#f2a900" strokeOpacity=".5" fill="none" />
          {[14, 36, 60, 84, 106].map((x, i) => (
            <circle key={x} cx={x} cy={i % 2 ? 14 : 12} r="4" fill={i % 2 ? "#d7263d" : "#f2a900"} />
          ))}
        </svg>
        <h3 className="text-lg font-bold leading-snug">{title}</h3>
        <p className="mt-1 text-base text-ink-2">{body}</p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}
