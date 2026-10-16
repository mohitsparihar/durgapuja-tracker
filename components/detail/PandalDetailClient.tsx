"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CrowdBadge } from "@/components/CrowdBadge";
import { CrowdReportButtons } from "@/components/CrowdReportButtons";
import { FlagButton } from "@/components/FlagButton";
import { AlertIcon, BackIcon, CameraIcon, DirectionsIcon, PinIcon, TrashIcon } from "@/components/icons";
import { ConfirmModal, Toast } from "@/components/Modal";
import { PageBar } from "@/components/PageBar";
import { Celebrate } from "@/components/detail/Celebrate";
import { EditPandal } from "@/components/detail/EditPandal";
import { PhotoDots } from "@/components/detail/PhotoDots";
import { PhotoLightbox } from "@/components/detail/PhotoLightbox";
import { PhotoImg } from "@/components/PhotoImg";
import { ErrorBanner } from "@/components/StateBanners";
import { useAuth } from "@/lib/auth";
import { takeCelebrate } from "@/lib/celebrate";
import { deletePandal, deletePhoto, getPandal, setPlaceNote, subscribeCrowd } from "@/lib/data";
import { errorKey } from "@/lib/errors";
import { useI18n, type Key } from "@/lib/i18n";
import { directionsUrl } from "@/lib/geo";
import { useMinWidth, useRefetchOnReturn } from "@/lib/hooks";
import { formatDay, istDate, seasonFor } from "@/lib/season";
import dynamic from "next/dynamic";
import { takePendingAction, type PendingAction } from "@/lib/pending-action";
import type { CrowdReport, PandalDetail, Photo, PlaceNote } from "@/lib/types";

const MiniMap = dynamic(() => import("./MiniMap"), {
  ssr: false,
  loading: () => <div className="skeleton h-full w-full" aria-label="Loading map" />,
});

export default function PandalDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { t, lang } = useI18n();
  const { user, requireUser } = useAuth();
  const wide = useMinWidth(1024);
  const [p, setP] = useState<PandalDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [err, setErr] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<CrowdReport | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "pandal" } | { kind: "photo"; photo: Photo } | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [coverAt, setCoverAt] = useState(0);
  const [coverDrag, setCoverDrag] = useState(0);
  const [coverDragging, setCoverDragging] = useState(false);
  const coverSwipe = useRef<{ x: number; y: number; axis: "x" | "y" | null } | null>(null);
  const coverDragRef = useRef(0);
  const coverSwiped = useRef(false);
  const [resumed, setResumed] = useState<PendingAction | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const req = useRef(0);

  useEffect(() => {
    if (takeCelebrate(id)) setCelebrate(true);
  }, [id]);

  // Back from Google sign-in mid-action? Reopen it pre-filled (never auto-submit).
  useEffect(() => {
    if (!user || state !== "ready") return;
    const a = takePendingAction(id);
    if (!a) return;
    setResumed(a);
    if (a.type === "crowd") setShowReport(true);
  }, [user, state, id]);
  const flagResume = (kind: "pandal" | "photo", targetId: string) =>
    resumed?.type === "flag" && resumed.kind === kind && resumed.targetId === targetId
      ? { reason: resumed.reason }
      : undefined;

  const load = useCallback(async () => {
    const n = ++req.current;
    try {
      const d = await getPandal(id);
      if (n !== req.current) return;
      if (!d) {
        setState("missing");
        return;
      }
      setP(d);
      setState("ready");
      setErr(null);
    } catch (e) {
      if (n !== req.current) return;
      setErr(t(errorKey(e)));
      setState((s) => (s === "ready" ? s : "error"));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);
  useRefetchOnReturn(load);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = subscribeCrowd(() => {
      clearTimeout(t);
      t = setTimeout(() => void load(), 600);
    });
    return () => {
      clearTimeout(t);
      off();
    };
  }, [load]);

  const dismissToast = useCallback(() => setToast(null), []);

  if (state === "loading") return <DetailSkeleton />;
  if (state === "missing")
    return (
      <main className="min-h-dvh bg-ivory">
        <PageBar title={t("pandal")} />
        <div className="mx-auto max-w-xl p-5 text-center">
          <h1 className="text-xl font-bold">{t("missingTitle")}</h1>
          <p className="mt-2 text-base text-ink-2">{t("missingBody")}</p>
          <Link href="/" className="mt-5 inline-flex h-12 items-center rounded-xl bg-indigo px-5 font-semibold text-ivory">
            {t("backToMap")}
          </Link>
        </div>
      </main>
    );
  if (state === "error" || !p)
    return (
      <main className="min-h-dvh bg-ivory">
        <PageBar title={t("pandal")} />
        <div className="mx-auto max-w-xl p-4">
          <ErrorBanner message={err ?? t("loadFailed")} onRetry={() => void load()} />
        </div>
      </main>
    );

  const crowd = optimistic ?? p.crowd;
  const markPlace = async (place: PandalDetail, status: PlaceNote) => {
    const u = requireUser(t("signInNote"));
    if (!u) return;
    try {
      await setPlaceNote(place.id, place.my_note === status ? null : status, u.id);
      await load();
    } catch (e) {
      setErr(t(errorKey(e)));
    }
  };
  const isOwner = user?.id != null && user.id === p.created_by;
  const coverIndex = p.photos.length === 0 ? 0 : coverAt % p.photos.length;
  const coverPhoto = p.photos[coverIndex] ?? null;
  const showCoverArrows = p.photos.length > 1;
  const shiftCover = (dir: -1 | 1) => {
    setCoverAt((i) => {
      const next = i + dir;
      if (next < 0 || next >= p.photos.length) return i;
      return next;
    });
  };
  const addPhotos = () => {
    const next = `/add?pandal=${encodeURIComponent(p.id)}`;
    if (requireUser(t("signInPhotos"), { next, onSignedIn: () => router.push(next) }))
      router.push(next);
  };

  return (
    <main className="min-h-dvh bg-ivory" style={{ paddingBottom: "calc(24px + var(--safe-b))" }}>
      <PageBar title={p.name} />

      {/* Phones: one column in priority order (cover → info → crowd → photos → about → actions).
          Desktop (lg): media on the left, a sticky info panel on the right. The two column
          wrappers are `display: contents` on phones, so `order-*` interleaves their children. */}
      <div className="mx-auto flex max-w-xl flex-col lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-8 lg:px-6 lg:pt-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="contents lg:block lg:min-w-0">
          {/* 1. Cover photo */}
          <div
            className="relative order-1 h-[34dvh] max-h-80 min-h-44 w-full overflow-hidden bg-indigo-2 lg:h-[min(62vh,560px)] lg:max-h-none lg:rounded-3xl"
            data-testid="detail-cover"
          >
            {coverPhoto ? (
              <>
                <div
                  className="absolute inset-0 touch-pan-y"
                  onPointerDown={(e) => {
                    if ((e.target as HTMLElement).closest("[data-cover-arrow]")) return;
                    coverSwipe.current = { x: e.clientX, y: e.clientY, axis: null };
                  }}
                  onPointerMove={(e) => {
                    const start = coverSwipe.current;
                    if (!start || !showCoverArrows) return;
                    const dx = e.clientX - start.x;
                    const dy = e.clientY - start.y;
                    if (start.axis == null) {
                      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
                      start.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
                      if (start.axis === "x") {
                        setCoverDragging(true);
                        try {
                          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        } catch {
                          /* the pointer can already be gone */
                        }
                      }
                    }
                    if (start.axis !== "x") return;
                    let x = dx;
                    const atStart = coverIndex === 0 && x > 0;
                    const atEnd = coverIndex === p.photos.length - 1 && x < 0;
                    if (atStart || atEnd) x *= 0.35;
                    coverDragRef.current = x;
                    setCoverDrag(x);
                  }}
                  onPointerUp={() => {
                    const start = coverSwipe.current;
                    const dragged = coverDragRef.current;
                    coverSwipe.current = null;
                    coverDragRef.current = 0;
                    setCoverDrag(0);
                    setCoverDragging(false);
                    if (!start || start.axis !== "x" || !showCoverArrows) return;
                    coverSwiped.current = true;
                    if (Math.abs(dragged) < 48) return;
                    shiftCover(dragged < 0 ? 1 : -1);
                  }}
                  onPointerCancel={() => {
                    coverSwipe.current = null;
                    coverDragRef.current = 0;
                    setCoverDrag(0);
                    setCoverDragging(false);
                  }}
                >
                  <div
                    className={`flex h-full ${coverDragging ? "" : "transition-transform duration-300 ease-out motion-reduce:transition-none"}`}
                    style={{
                      width: `${p.photos.length * 100}%`,
                      transform: `translateX(calc(-${(coverIndex * 100) / p.photos.length}% + ${coverDrag}px))`,
                    }}
                  >
                    {p.photos.map((ph, i) => (
                      <button
                        key={ph.id}
                        type="button"
                        onClick={() => {
                          if (coverSwiped.current) {
                            coverSwiped.current = false;
                            return;
                          }
                          setViewer(i);
                        }}
                        className="h-full shrink-0"
                        style={{ width: `${100 / p.photos.length}%` }}
                        aria-label={t("viewPhoto")}
                        data-testid={i === coverIndex ? "open-cover" : undefined}
                      >
                        <PhotoImg
                          src={ph.url}
                          alt={t("photoOf", { name: p.name })}
                          className="h-full w-full object-cover"
                          eager={Math.abs(i - coverIndex) <= 1}
                        />
                      </button>
                    ))}
                  </div>
                </div>
                {coverIndex > 0 && (
                  <button
                    type="button"
                    data-cover-arrow
                    onClick={() => shiftCover(-1)}
                    className="absolute left-2 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-ivory shadow-md"
                    aria-label={t("photoPrev")}
                    data-testid="cover-prev"
                  >
                    <BackIcon className="h-7 w-7" />
                  </button>
                )}
                {coverIndex < p.photos.length - 1 && (
                  <button
                    type="button"
                    data-cover-arrow
                    onClick={() => shiftCover(1)}
                    className="absolute right-2 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-ivory shadow-md"
                    aria-label={t("photoNext")}
                    data-testid="cover-next"
                  >
                    <BackIcon className="h-7 w-7 rotate-180" />
                  </button>
                )}
                {showCoverArrows && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
                    <div className="rounded-full bg-black/55 px-2.5 py-1.5">
                      <PhotoDots count={p.photos.length} index={coverIndex} />
                    </div>
                    <p className="sr-only" aria-live="polite">
                      {t("photoPosition", { n: coverIndex + 1, total: p.photos.length })}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-ivory">
                <div className="festive-edge absolute inset-x-0 top-0" aria-hidden />
                <CameraIcon className="h-8 w-8 text-marigold" />
                <p className="text-base">{t("noPhotosFirst")}</p>
              </div>
            )}
          </div>

          {/* Photos */}
          <section className="order-4 mt-6 px-4 lg:px-0" aria-labelledby="photos-h">
            <div className="flex items-center justify-between gap-2">
              <h2 id="photos-h" className="text-lg font-bold lg:text-xl">
                {t("photos")} <span className="font-normal text-ink-2">({p.photos.length})</span>
              </h2>
              <button
                onClick={addPhotos}
                className="flex h-12 items-center gap-2 rounded-xl border-2 border-indigo px-4 text-base font-semibold text-indigo"
                data-testid="add-photos"
              >
                <CameraIcon /> {t("addPhotos")}
              </button>
            </div>
            {p.photos.length > 0 ? (
              <ul className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-3" data-testid="gallery">
                {p.photos.map((ph, i) => (
                  <li key={ph.id} className="relative aspect-[4/3] overflow-hidden rounded-xl" data-testid="gallery-photo">
                    <button
                      type="button"
                      onClick={() => setViewer(i)}
                      className="absolute inset-0"
                      aria-label={t("viewPhoto")}
                    >
                      <PhotoImg src={ph.url} alt={t("visitorPhoto", { name: p.name })} className="h-full w-full object-cover" />
                    </button>
                    {ph.status === "needs_review" && (
                      <span className="pointer-events-none absolute left-1.5 top-1.5 z-10 rounded-full bg-paper px-2 py-0.5 text-xs font-bold text-ink shadow">
                        {t("underReview")}
                      </span>
                    )}
                    <div className="absolute bottom-1 right-1 z-10 flex gap-1">
                      {(user?.id === ph.user_id || isOwner) && (
                        <button
                          onClick={() => setConfirm({ kind: "photo", photo: ph })}
                          className="grid h-12 w-12 place-items-center rounded-full bg-indigo/70 text-ivory"
                          aria-label={t(isOwner ? "removePhoto" : "deleteYourPhoto")}
                        >
                          <TrashIcon />
                        </button>
                      )}
                      <FlagButton kind="photo" targetId={ph.id} pandalId={p.id} resume={flagResume("photo", ph.id)} onDone={setToast} compact />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-base text-ink-2">{t("noPhotosYet")}</p>
            )}
          </section>

          {/* About */}
          {(p.description || p.tags.length > 0) && (
            <section className="order-5 mt-6 px-4 lg:px-0" aria-labelledby="about-h">
              <h2 id="about-h" className="text-lg font-bold lg:text-xl">
                {t("about")}
              </h2>
              {p.description && <p className="mt-1 max-w-prose whitespace-pre-line break-words text-base lg:text-lg">{p.description}</p>}
              {p.tags.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2" aria-label={t("tags")}>
                  {p.tags.map((tag) => (
                    <li key={tag} className="rounded-full border border-marigold bg-marigold-soft/50 px-3 py-1 text-sm font-medium">
                      {t(`tag.${tag}` as Key)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <aside
          className="contents lg:sticky lg:top-24 lg:block lg:max-h-[calc(100dvh-7rem)] lg:space-y-4 lg:overflow-y-auto lg:pb-2"
          aria-label={t("pandalInfo")}
        >
          <div className="order-2 px-4 pt-4 lg:rounded-3xl lg:border lg:border-line lg:bg-paper lg:p-5 lg:shadow-sm">
            {p.status === "needs_review" && (
              <div
                className="mb-3 flex items-start gap-2 rounded-xl border-2 border-ink-2/40 bg-paper px-3 py-2 text-base"
                role="note"
                data-testid="review-banner"
              >
                <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-ink-2" />
                <span>
                  <strong>{t("underReview")}.</strong> {t("underReviewBody")}
                </span>
              </div>
            )}

            {/* 2. Name + 3. area */}
            {p.kind === "ramleela" && (
              <p className="mb-2">
                <span className="rounded-full bg-ramleela-soft px-2 py-0.5 text-xs font-semibold text-ramleela">
                  {t("kindRamleela")}
                </span>
              </p>
            )}
            {p.kind === "ravan" && (
              <p className="mb-2">
                <span className="rounded-full bg-ravan-soft px-2 py-0.5 text-xs font-semibold text-ravan">
                  {t("kindRavan")}
                </span>
              </p>
            )}
            <h1 className="break-words text-2xl font-bold leading-tight lg:text-3xl" data-testid="detail-name">
              {p.name}
            </h1>
            {(p.address || p.city) && (
              <p className="mt-1 flex items-start gap-1.5 text-base text-ink-2" data-testid="detail-address">
                <PinIcon className="mt-0.5 h-5 w-5 shrink-0" />
                <span className="break-words">{p.address ?? p.city}</span>
              </p>
            )}
            <SeasonNote pandal={p} lang={lang} />
            {p.closed_count > 0 && <p className="mt-2 text-sm font-medium text-ink-2">{t("closedHint")}</p>}
            {p.gone_count > 0 && <p className="mt-2 text-sm font-medium text-ink-2">{t("notThereHint")}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={p.my_note === "closed"}
                onClick={() => void markPlace(p, "closed")}
                className={`h-12 rounded-xl border-2 px-4 text-base font-semibold ${
                  p.my_note === "closed" ? "border-ink bg-ink text-ivory" : "border-line bg-paper text-ink"
                }`}
                data-testid="mark-closed"
              >
                {t("markClosed")}
              </button>
              <button
                type="button"
                aria-pressed={p.my_note === "not_there"}
                onClick={() => void markPlace(p, "not_there")}
                className={`h-12 rounded-xl border-2 px-4 text-base font-semibold ${
                  p.my_note === "not_there" ? "border-vermilion bg-vermilion text-white" : "border-line bg-paper text-ink"
                }`}
                data-testid="mark-not-there"
              >
                {t("markNotThere")}
              </button>
            </div>

            {/* 4. Crowd status + age */}
            <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="detail-crowd">
              <CrowdBadge crowd={crowd} size="lg" pending={optimistic != null} />
            </div>

            {/* 5. Directions */}
            <a
              href={directionsUrl(p)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-vermilion text-lg font-bold text-white shadow-[0_6px_18px_rgba(215,38,61,0.35)] active:bg-vermilion-ink"
              data-testid="directions"
            >
              <DirectionsIcon className="h-6 w-6" /> {t("directions")}
            </a>

            {err && (
              <div className="mt-3">
                <ErrorBanner message={err} onRetry={() => void load()} />
              </div>
            )}
          </div>

          {/* Crowd reporting */}
          <section className="order-3 mx-4 mt-6 rounded-2xl border border-line bg-paper p-4 lg:mx-0 lg:mt-0 lg:rounded-3xl lg:p-5" aria-labelledby="crowd-h">
            <div className="flex items-center justify-between gap-2">
              <h2 id="crowd-h" className="text-lg font-bold">
                {t("howCrowded")}
              </h2>
              {!showReport && (
                <button
                  onClick={() => setShowReport(true)}
                  className="h-12 shrink-0 rounded-xl bg-indigo px-4 text-base font-semibold text-ivory"
                  data-testid="open-crowd-report"
                >
                  {t("imHere")}
                </button>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-2">{t("crowdFresh")}</p>
            {showReport && (
              <div className="mt-3">
                <CrowdReportButtons
                  pandalId={p.id}
                  initialLevel={resumed?.type === "crowd" ? resumed.level : null}
                  initialWait={resumed?.type === "crowd" ? resumed.wait : null}
                  onOptimistic={setOptimistic}
                  onSettled={(ok, msg) => {
                    if (ok) {
                      setShowReport(false);
                      setToast(msg);
                      void load().then(() => setOptimistic(null));
                    }
                  }}
                />
              </div>
            )}
          </section>

          {/* Desktop-only location map (not mounted on phones) */}
          {wide && (
            <div className="h-56 overflow-hidden rounded-3xl border border-line" data-testid="detail-minimap">
              <MiniMap at={p} label={p.name} kind={p.kind === "ramleela" ? "ramleela" : "pandal"} />
            </div>
          )}

          <div className="order-6 px-4 lg:px-0">
            <div className="festive-dots mt-8 opacity-60 lg:mt-0" aria-hidden />
            <div className="mt-4 flex flex-wrap gap-2">
              <FlagButton kind="pandal" targetId={p.id} pandalId={p.id} resume={flagResume("pandal", p.id)} onDone={setToast} />
              <p className="w-full text-sm text-ink-2">{t("wrongPinHint")}</p>
              {isOwner && (
                <>
                  <button
                    onClick={() => setEditing(true)}
                    className="flex h-12 items-center gap-2 rounded-xl border-2 border-indigo px-4 text-base font-semibold text-indigo"
                    data-testid="edit-pandal-open"
                  >
                    {t("editPandal")}
                  </button>
                  <button
                    onClick={() => setConfirm({ kind: "pandal" })}
                    className="flex h-12 items-center gap-2 rounded-xl border-2 border-vermilion px-4 text-base font-semibold text-vermilion-ink"
                    data-testid="delete-pandal"
                  >
                    <TrashIcon /> {t("deletePandal")}
                  </button>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>

      {editing && user && (
        <EditPandal
          pandal={p}
          userId={user.id}
          onClose={() => setEditing(false)}
          onSaved={(message) => {
            setToast(message);
            void load();
          }}
        />
      )}

      {confirm?.kind === "pandal" && (
        <ConfirmModal
          title={t("deletePandalAsk")}
          body={t("deletePandalBody")}
          confirmLabel={t("delete")}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const u = requireUser(t("signInDelete"));
            if (!u) return;
            try {
              await deletePandal(p.id, u.id);
            } catch (e) {
              throw new Error(t(errorKey(e)));
            }
            router.replace("/");
          }}
        />
      )}
      {confirm?.kind === "photo" && (
        <ConfirmModal
          title={t(isOwner ? "removePhotoAsk" : "deletePhotoAsk")}
          body={t(isOwner ? "removePhotoBody" : "deletePhotoBody")}
          confirmLabel={t(isOwner ? "removePhoto" : "deletePhoto")}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const u = requireUser(t("signInDelete"));
            if (!u) return;
            try {
              await deletePhoto(confirm.photo, u.id);
            } catch (e) {
              throw new Error(t(errorKey(e)));
            }
            setConfirm(null);
            setToast(t("photoDeleted"));
            await load();
          }}
        />
      )}
      {toast && <Toast message={toast} onDone={dismissToast} />}
      {viewer != null && (
        <PhotoLightbox photos={p.photos} start={viewer} name={p.name} onClose={() => setViewer(null)} />
      )}
      {celebrate && <Celebrate name={p.name} onDone={() => setCelebrate(false)} />}
    </main>
  );
}

function SeasonNote({ pandal, lang }: { pandal: PandalDetail; lang: "en" | "hi" | "bn" }) {
  const { t } = useI18n();
  const created = new Date(pandal.created_at);
  const season = seasonFor(created);
  if (!season) return null;
  return (
    <div className="mt-2 space-y-1 text-sm text-ink-2" data-testid="season-note">
      <p>{t("addedOn", { date: formatDay(istDate(created), lang) })}</p>
      <p>{t("untilDussehra", { date: formatDay(season.endsOn, lang) })}</p>
      {pandal.kind === "ravan" && <p>{t("ravanWhen", { date: formatDay(season.endsOn, lang) })}</p>}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <main className="min-h-dvh bg-ivory" aria-busy="true" aria-label="Loading pandal">
      <div className="h-14 bg-indigo" style={{ marginTop: "var(--safe-t)" }} />
      <div className="festive-edge" />
      <div className="mx-auto max-w-xl">
        <div className="skeleton h-[34dvh] max-h-80 min-h-44 w-full" />
        <div className="space-y-3 p-4">
          <div className="skeleton h-7 w-4/5 rounded" />
          <div className="skeleton h-4 w-1/2 rounded" />
          <div className="skeleton h-9 w-2/3 rounded-full" />
          <div className="skeleton h-14 w-full rounded-2xl" />
        </div>
      </div>
    </main>
  );
}
