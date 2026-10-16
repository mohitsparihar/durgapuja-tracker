"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CrowdBadge } from "@/components/CrowdBadge";
import { CrowdReportButtons } from "@/components/CrowdReportButtons";
import { FlagButton } from "@/components/FlagButton";
import { AlertIcon, CameraIcon, DirectionsIcon, PinIcon, TrashIcon } from "@/components/icons";
import { ConfirmModal, Toast } from "@/components/Modal";
import { PageBar } from "@/components/PageBar";
import { PhotoImg } from "@/components/PhotoImg";
import { ErrorBanner } from "@/components/StateBanners";
import { useAuth } from "@/lib/auth";
import { deletePandal, deletePhoto, getPandal, subscribeCrowd } from "@/lib/data";
import { friendlyError } from "@/lib/errors";
import { directionsUrl } from "@/lib/geo";
import { useMinWidth, useRefetchOnReturn } from "@/lib/hooks";
import dynamic from "next/dynamic";
import { takePendingAction, type PendingAction } from "@/lib/pending-action";
import type { CrowdReport, PandalDetail, Photo } from "@/lib/types";

const MiniMap = dynamic(() => import("./MiniMap"), {
  ssr: false,
  loading: () => <div className="skeleton h-full w-full" aria-label="Loading map" />,
});

export default function PandalDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { user, requireUser } = useAuth();
  const wide = useMinWidth(1024);
  const [p, setP] = useState<PandalDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [err, setErr] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<CrowdReport | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "pandal" } | { kind: "photo"; photo: Photo } | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [resumed, setResumed] = useState<PendingAction | null>(null);
  const req = useRef(0);

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
      setErr(friendlyError(e));
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
        <PageBar title="Pandal" />
        <div className="mx-auto max-w-xl p-5 text-center">
          <h1 className="text-xl font-bold">This pandal isn&apos;t here any more</h1>
          <p className="mt-2 text-base text-ink-2">It may have been removed by the person who added it.</p>
          <Link href="/" className="mt-5 inline-flex h-12 items-center rounded-xl bg-indigo px-5 font-semibold text-ivory">
            Back to the map
          </Link>
        </div>
      </main>
    );
  if (state === "error" || !p)
    return (
      <main className="min-h-dvh bg-ivory">
        <PageBar title="Pandal" />
        <div className="mx-auto max-w-xl p-4">
          <ErrorBanner message={err ?? "Couldn't load this pandal."} onRetry={() => void load()} />
        </div>
      </main>
    );

  const crowd = optimistic ?? p.crowd;
  const isOwner = user?.id != null && user.id === p.created_by;
  const coverPhoto = p.photos.find((ph) => ph.status === "active") ?? null;
  const addPhotos = () => {
    const next = `/add?pandal=${encodeURIComponent(p.id)}`;
    if (requireUser("Sign in to add photos of this pandal.", { next, onSignedIn: () => router.push(next) }))
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
            className="relative order-1 h-[34dvh] max-h-80 min-h-44 w-full bg-indigo-2 lg:h-[min(62vh,560px)] lg:max-h-none lg:overflow-hidden lg:rounded-3xl"
            data-testid="detail-cover"
          >
            {coverPhoto ? (
              <PhotoImg src={coverPhoto.url} alt={`Photo of ${p.name}`} className="h-full w-full object-cover" eager />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-ivory">
                <div className="festive-edge absolute inset-x-0 top-0" aria-hidden />
                <CameraIcon className="h-8 w-8 text-marigold" />
                <p className="text-base">No photos yet — be the first to share how it looks.</p>
              </div>
            )}
          </div>

          {/* Photos */}
          <section className="order-4 mt-6 px-4 lg:px-0" aria-labelledby="photos-h">
            <div className="flex items-center justify-between gap-2">
              <h2 id="photos-h" className="text-lg font-bold lg:text-xl">
                Photos <span className="font-normal text-ink-2">({p.photos.length})</span>
              </h2>
              <button
                onClick={addPhotos}
                className="flex h-12 items-center gap-2 rounded-xl border-2 border-indigo px-4 text-base font-semibold text-indigo"
                data-testid="add-photos"
              >
                <CameraIcon /> Add photos
              </button>
            </div>
            {p.photos.length > 0 ? (
              <ul className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-3" data-testid="gallery">
                {p.photos.map((ph) => (
                  <li key={ph.id} className="relative aspect-[4/3] overflow-hidden rounded-xl" data-testid="gallery-photo">
                    <PhotoImg src={ph.url} alt={`Visitor photo of ${p.name}`} className="h-full w-full object-cover" />
                    {ph.status === "needs_review" && (
                      <span className="absolute left-1.5 top-1.5 rounded-full bg-paper px-2 py-0.5 text-xs font-bold text-ink shadow">
                        Under review
                      </span>
                    )}
                    <div className="absolute bottom-1 right-1 flex gap-1">
                      {user?.id === ph.user_id && (
                        <button
                          onClick={() => setConfirm({ kind: "photo", photo: ph })}
                          className="grid h-12 w-12 place-items-center rounded-full bg-indigo/70 text-ivory"
                          aria-label="Delete your photo"
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
              <p className="mt-2 text-base text-ink-2">No photos yet.</p>
            )}
          </section>

          {/* About */}
          {(p.description || p.tags.length > 0) && (
            <section className="order-5 mt-6 px-4 lg:px-0" aria-labelledby="about-h">
              <h2 id="about-h" className="text-lg font-bold lg:text-xl">
                About
              </h2>
              {p.description && <p className="mt-1 max-w-prose whitespace-pre-line break-words text-base lg:text-lg">{p.description}</p>}
              {p.tags.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2" aria-label="Tags">
                  {p.tags.map((t) => (
                    <li key={t} className="rounded-full border border-marigold bg-marigold-soft/50 px-3 py-1 text-sm font-medium">
                      {t}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <aside
          className="contents lg:sticky lg:top-24 lg:block lg:max-h-[calc(100dvh-7rem)] lg:space-y-4 lg:overflow-y-auto lg:pb-2"
          aria-label="Pandal info"
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
                  <strong>Under review.</strong> Several visitors reported something about this pandal. Details may be
                  inaccurate until it&apos;s checked.
                </span>
              </div>
            )}

            {/* 2. Name + 3. area */}
            <h1 className="break-words text-2xl font-bold leading-tight lg:text-3xl" data-testid="detail-name">
              {p.name}
            </h1>
            {(p.address || p.city) && (
              <p className="mt-1 flex items-start gap-1.5 text-base text-ink-2" data-testid="detail-address">
                <PinIcon className="mt-0.5 h-5 w-5 shrink-0" />
                <span className="break-words">{p.address ?? p.city}</span>
              </p>
            )}

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
              <DirectionsIcon className="h-6 w-6" /> Directions
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
                How crowded is it now?
              </h2>
              {!showReport && (
                <button
                  onClick={() => setShowReport(true)}
                  className="h-12 shrink-0 rounded-xl bg-indigo px-4 text-base font-semibold text-ivory"
                  data-testid="open-crowd-report"
                >
                  I&apos;m here
                </button>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-2">Reports show for 45 minutes, so the status is always fresh.</p>
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
              <MiniMap at={p} label={p.name} />
            </div>
          )}

          <div className="order-6 px-4 lg:px-0">
            <div className="festive-dots mt-8 opacity-60 lg:mt-0" aria-hidden />
            <div className="mt-4 flex flex-wrap gap-2">
              <FlagButton kind="pandal" targetId={p.id} pandalId={p.id} resume={flagResume("pandal", p.id)} onDone={setToast} />
              {isOwner && (
                <button
                  onClick={() => setConfirm({ kind: "pandal" })}
                  className="flex h-12 items-center gap-2 rounded-xl border-2 border-vermilion px-4 text-base font-semibold text-vermilion-ink"
                  data-testid="delete-pandal"
                >
                  <TrashIcon /> Delete pandal
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>

      {confirm?.kind === "pandal" && (
        <ConfirmModal
          title="Delete this pandal?"
          body="This removes the pandal, its photos and crowd reports for everyone. This can't be undone."
          confirmLabel="Delete"
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const u = requireUser("Sign in to delete.");
            if (!u) return;
            try {
              await deletePandal(p.id, u.id);
            } catch (e) {
              throw new Error(friendlyError(e));
            }
            router.replace("/");
          }}
        />
      )}
      {confirm?.kind === "photo" && (
        <ConfirmModal
          title="Delete your photo?"
          body="It will be removed for everyone."
          confirmLabel="Delete photo"
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const u = requireUser("Sign in to delete.");
            if (!u) return;
            try {
              await deletePhoto(confirm.photo, u.id);
            } catch (e) {
              throw new Error(friendlyError(e));
            }
            setConfirm(null);
            setToast("Photo deleted.");
            await load();
          }}
        />
      )}
      {toast && <Toast message={toast} onDone={dismissToast} />}
    </main>
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
