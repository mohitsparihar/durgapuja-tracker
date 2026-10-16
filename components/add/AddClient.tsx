"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertIcon } from "@/components/icons";
import { PageBar } from "@/components/PageBar";
import { useAuth } from "@/lib/auth";
import { LIMITS, TAGS } from "@/lib/config";
import { createPandal, findDuplicates, getPandal, uploadPhoto } from "@/lib/data";
import { friendlyError } from "@/lib/errors";
import { formatDistance } from "@/lib/geo";
import { compressPhoto } from "@/lib/image";
import { photoStore, type StoredPhoto } from "@/lib/photo-store";
import type { LatLng, PandalSummary } from "@/lib/types";
import { PhotoUploader, type PendingPhoto } from "./PhotoUploader";
import { PinPicker } from "./PinPicker";

interface Draft {
  name: string;
  description: string;
  address: string;
  city: string;
  tags: string[];
  pin: LatLng | null;
  ack: boolean;
  /** Client-generated id, saved before the create request so a retry reuses it. */
  pendingId: string | null;
  /** Set once the pandal row is confirmed to exist. */
  createdId: string | null;
}

const EMPTY: Draft = { name: "", description: "", address: "", city: "", tags: [], pin: null, ack: false, pendingId: null, createdId: null };
const DRAFT_KEY = "pandal-hop:add-draft";

function loadDraft(): Draft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) } : EMPTY;
  } catch {
    return EMPTY;
  }
}
function saveDraft(d: Draft | null) {
  try {
    if (d) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* non-critical */
  }
}

export default function AddClient() {
  const router = useRouter();
  const params = useSearchParams();
  const existingId = params.get("pandal");
  const { user, loading: authLoading, requireUser } = useAuth();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [existing, setExisting] = useState<{ name: string } | null | "missing">(null);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [dupes, setDupes] = useState<PandalSummary[]>([]);
  // Which pin+name the duplicate check has completed for; creation is blocked until it
  // matches the current values (fail closed on errors).
  const [dupCheck, setDupCheck] = useState<{ key: string; status: "checking" | "ok" | "error" }>({ key: "", status: "checking" });
  const [dupRetry, setDupRetry] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  // Restore text/pin draft (survives the Google sign-in round trip and reloads).
  useEffect(() => {
    if (!existingId) setDraft(loadDraft());
    setHydrated(true);
  }, [existingId]);
  useEffect(() => {
    if (hydrated && !existingId) saveDraft(draft);
  }, [draft, hydrated, existingId]);

  useEffect(() => {
    if (!existingId) return;
    getPandal(existingId)
      .then((p) => setExisting(p ? { name: p.name } : "missing"))
      .catch(() => setExisting("missing"));
  }, [existingId]);

  // Selected/compressed photos persist in IndexedDB so a reload or sign-in round trip
  // doesn't lose them (and failed uploads keep their Retry).
  const photoKey = `add:${existingId ?? "new"}`;
  const [photosRestored, setPhotosRestored] = useState(false);
  const finished = useRef(false);
  useEffect(() => {
    let live = true;
    photoStore.get(photoKey).then((stored) => {
      if (!live) return;
      if (stored.length) {
        setPhotos((ps) => [
          ...stored.map((s) => ({
            key: s.key,
            blob: s.blob,
            preview: URL.createObjectURL(s.blob),
            status: s.status,
            error: s.error,
          })),
          ...ps.filter((p) => !stored.some((s) => s.key === p.key)),
        ]);
      }
      setPhotosRestored(true);
    });
    return () => {
      live = false;
    };
  }, [photoKey]);
  useEffect(() => {
    if (!photosRestored || finished.current) return;
    const keep: StoredPhoto[] = photos
      .filter((p) => p.blob && p.status !== "invalid" && p.status !== "compressing")
      .map((p) => ({
        key: p.key,
        blob: p.blob!,
        // An upload interrupted by a reload is treated as failed so it can be retried.
        status: p.status === "uploading" ? "failed" : (p.status as StoredPhoto["status"]),
        error: p.error,
      }));
    void (keep.length ? photoStore.set(photoKey, keep) : photoStore.del(photoKey));
  }, [photos, photosRestored, photoKey]);

  // Free preview URLs on unmount.
  useEffect(() => () => photosRef.current.forEach((p) => p.preview && URL.revokeObjectURL(p.preview)), []);

  // Duplicate check (debounced) once there's a pin.
  const dupKey = draft.pin ? `${draft.pin.lat},${draft.pin.lng}|${draft.name.trim().toLowerCase()}` : "";
  useEffect(() => {
    if (existingId || !draft.pin || draft.createdId) {
      setDupes([]);
      return;
    }
    const pin = draft.pin;
    const key = dupKey;
    let live = true;
    setDupCheck({ key, status: "checking" });
    const t = setTimeout(() => {
      findDuplicates(pin.lat, pin.lng, draft.name)
        .then((d) => {
          if (!live) return;
          setDupes(d);
          setDupCheck({ key, status: "ok" });
        })
        .catch(() => live && setDupCheck({ key, status: "error" }));
    }, 450);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [draft.pin, draft.name, draft.createdId, existingId, dupKey, dupRetry]);

  const update = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => ({ ...d, [k]: v, ...(k === "pin" || k === "name" ? { ack: false } : {}) }));

  const patchPhoto = (key: string, patch: Partial<PendingPhoto>) =>
    setPhotos((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const addFiles = async (files: File[]) => {
    const items: PendingPhoto[] = files.map((f) => ({
      key: crypto.randomUUID(),
      blob: null,
      preview: URL.createObjectURL(f),
      status: "compressing",
      error: null,
    }));
    setPhotos((ps) => [...ps, ...items]);
    await Promise.all(
      files.map(async (f, i) => {
        try {
          const blob = await compressPhoto(f);
          patchPhoto(items[i].key, { blob, status: "ready" });
        } catch (e) {
          patchPhoto(items[i].key, { status: "invalid", error: friendlyError(e) });
        }
      }),
    );
  };

  const removePhoto = (key: string) =>
    setPhotos((ps) => {
      const p = ps.find((x) => x.key === key);
      if (p?.preview) URL.revokeObjectURL(p.preview);
      return ps.filter((x) => x.key !== key);
    });

  const uploadOne = useCallback(async (pandalId: string, p: PendingPhoto, uid: string): Promise<boolean> => {
    if (!p.blob) return false;
    patchPhoto(p.key, { status: "uploading", error: null });
    try {
      await uploadPhoto(pandalId, p.blob, uid, p.key);
      patchPhoto(p.key, { status: "done" });
      return true;
    } catch (e) {
      patchPhoto(p.key, { status: "failed", error: friendlyError(e) });
      return false;
    }
  }, []);

  const usable = photos.filter((p) => p.status !== "invalid");
  const stillPreparing = photos.some((p) => p.status === "compressing");
  const pandalId = existingId ?? draft.createdId;
  const nameOk = draft.name.trim().length >= 2;
  const needAck = dupes.length > 0 && !draft.ack;
  const dupChecked = draft.createdId != null || (dupCheck.key === dupKey && dupCheck.status === "ok");
  const valid = existingId
    ? usable.length > 0
    : nameOk && draft.pin != null && usable.length > 0 && !needAck && dupChecked;

  const finish = (id: string) => {
    finished.current = true; // stop the persist effect from re-saving on the way out
    if (!existingId) saveDraft(null);
    void photoStore.del(photoKey);
    router.replace(`/pandal/${id}`);
  };

  const submit = async () => {
    setShowErrors(true);
    setFormError(null);
    if (!valid || stillPreparing) return;
    const u = requireUser("Sign in to add a pandal and its photos.");
    if (!u) return;
    setSubmitting(true);
    try {
      let id = pandalId;
      if (!id) {
        const newId = draft.pendingId ?? crypto.randomUUID();
        if (!draft.pendingId) {
          // Persist the id before sending, so a lost response + retry can't duplicate.
          setDraft((d) => ({ ...d, pendingId: newId }));
          saveDraft({ ...draft, pendingId: newId });
        }
        id = await createPandal(
          {
            name: draft.name,
            description: draft.description,
            address: draft.address,
            city: draft.city,
            tags: draft.tags,
            lat: draft.pin!.lat,
            lng: draft.pin!.lng,
          },
          u.id,
          newId,
        );
        setDraft((d) => ({ ...d, pendingId: newId, createdId: id }));
        saveDraft({ ...draft, pendingId: newId, createdId: id });
      }
      let allOk = true;
      for (const p of photosRef.current) {
        if (p.status === "ready" || p.status === "failed") {
          const ok = await uploadOne(id, p, u.id);
          allOk = allOk && ok;
        }
      }
      if (allOk) finish(id);
      else setFormError("Some photos didn't upload. Your details are saved — retry them, or finish without them.");
    } catch (e) {
      setFormError(friendlyError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const retryOne = async (key: string) => {
    const u = requireUser("Sign in to upload photos.");
    const p = photosRef.current.find((x) => x.key === key);
    if (!u || !p || !pandalId) {
      if (!pandalId) void submit();
      return;
    }
    const ok = await uploadOne(pandalId, p, u.id);
    if (ok && photosRef.current.every((x) => x.key === key || x.status === "done" || x.status === "invalid")) {
      finish(pandalId);
    }
  };

  // ---- Sign-in gate (browsing is open; adding needs an account) -------------
  if (!authLoading && !user) {
    return (
      <main className="min-h-dvh bg-ivory">
        <PageBar title={existingId ? "Add photos" : "Add a pandal"} />
        <div className="mx-auto max-w-xl p-5">
          <h1 className="text-xl font-bold">Sign in to add pandals and photos</h1>
          <p className="mt-2 text-base text-ink-2">Browsing is open to everyone. Adding needs a quick sign-in so the map stays spam-free.</p>
          <button
            onClick={() => requireUser("Sign in to add a pandal and its photos.")}
            className="mt-5 h-12 w-full rounded-xl bg-indigo text-base font-semibold text-ivory"
          >
            Sign in
          </button>
        </div>
      </main>
    );
  }

  if (existingId && existing === "missing") {
    return (
      <main className="min-h-dvh bg-ivory">
        <PageBar title="Add photos" />
        <div className="mx-auto max-w-xl p-5">
          <p className="text-base">This pandal no longer exists.</p>
          <Link href="/" className="mt-4 inline-flex h-12 items-center rounded-xl bg-indigo px-5 font-semibold text-ivory">
            Back to the map
          </Link>
        </div>
      </main>
    );
  }

  const locked = draft.createdId != null && !existingId;
  const fieldErr = (cond: boolean) => showErrors && cond;

  return (
    <main className="min-h-dvh bg-ivory">
      <PageBar title={existingId ? `Add photos${existing && existing !== "missing" ? ` — ${existing.name}` : ""}` : "Add a pandal"} />

      {/* Not a <form>: the place search inside the pin picker is its own form, and forms can't nest. */}
      {/* Desktop (lg): pin map on the left (sticky), details + photos on the right. */}
      <div
        className={`mx-auto px-4 pt-4 ${
          existingId
            ? "max-w-xl lg:max-w-3xl lg:pt-8"
            : "max-w-xl lg:grid lg:max-w-6xl lg:grid-cols-2 lg:items-start lg:gap-10 lg:px-6 lg:pt-8"
        }`}
        style={{ paddingBottom: "calc(120px + var(--safe-b))" }}
      >
        {!existingId && (
          <div className="space-y-6 lg:sticky lg:top-24">
            {locked && (
              <p className="rounded-xl border-2 border-[var(--crowd-low)] bg-paper px-3 py-2 text-base" role="status">
                ✓ Pandal saved. Now uploading its photos.
              </p>
            )}

            <section aria-labelledby="where-h">
              <h2 id="where-h" className="mb-2 text-lg font-bold">
                1. Where is it?
              </h2>
              {locked ? (
                <p className="text-base text-ink-2">Location saved.</p>
              ) : (
                <PinPicker value={draft.pin} onChange={(p) => update("pin", p)} />
              )}
              {fieldErr(!draft.pin) && (
                <p className="mt-1 text-base font-medium text-vermilion-ink" role="alert">
                  Set the pandal&apos;s location on the map.
                </p>
              )}
            </section>
          </div>
        )}

        <div className={`space-y-6 ${existingId ? "" : "mt-6 lg:mt-0"}`}>
        {!existingId && (
          <>
            <section aria-labelledby="what-h" className="space-y-4">
              <h2 id="what-h" className="text-lg font-bold">
                2. What is it called?
              </h2>
              <Field label="Pandal name" required error={fieldErr(!nameOk) ? "Enter the pandal's name (at least 2 letters)." : null}>
                {(id) => (
                  <input
                    id={id}
                    value={draft.name}
                    onChange={(e) => update("name", e.target.value)}
                    maxLength={120}
                    disabled={locked}
                    autoComplete="off"
                    className="h-12 w-full rounded-xl border-2 border-line bg-paper px-3 disabled:opacity-70"
                    placeholder="e.g. Shivaji Park Sarbojanin"
                  />
                )}
              </Field>

              {!locked && draft.pin && dupCheck.key === dupKey && dupCheck.status === "error" && (
                <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-vermilion bg-paper px-3 py-2" role="alert">
                  <p className="text-base">Couldn&apos;t check for pandals already at this spot.</p>
                  <button type="button" onClick={() => setDupRetry((n) => n + 1)} className="h-12 shrink-0 px-2 font-semibold text-indigo underline">
                    Retry
                  </button>
                </div>
              )}
              {dupes.length > 0 && !locked && (
                <div className="rounded-2xl border-2 border-marigold bg-marigold-soft/40 p-3" role="alert" data-testid="duplicate-warning">
                  <p className="flex items-start gap-2 text-base font-semibold">
                    <AlertIcon className="mt-0.5 h-5 w-5 shrink-0" />
                    {dupes.length === 1 ? "This pandal may already be on the map:" : "These pandals are already very close by:"}
                  </p>
                  <ul className="mt-2 space-y-2">
                    {dupes.map((d) => (
                      <li key={d.id} className="rounded-xl bg-paper p-2">
                        <p className="break-words font-semibold">{d.name}</p>
                        <p className="text-sm text-ink-2">{formatDistance(d.distance_m)} from your pin</p>
                        <Link
                          href={`/add?pandal=${encodeURIComponent(d.id)}`}
                          className="mt-1.5 flex h-12 items-center justify-center rounded-xl bg-indigo text-base font-semibold text-ivory"
                        >
                          Add photos to this one instead
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <label className="mt-3 flex min-h-12 cursor-pointer items-center gap-3 text-base">
                    <input
                      type="checkbox"
                      checked={draft.ack}
                      onChange={(e) => setDraft((d) => ({ ...d, ack: e.target.checked }))}
                      className="h-6 w-6 accent-indigo"
                      data-testid="dup-ack"
                    />
                    This is a different pandal — add anyway
                  </label>
                </div>
              )}

              <Field label="Area / address" hint="Optional — helps people find it">
                {(id) => (
                  <input
                    id={id}
                    value={draft.address}
                    onChange={(e) => update("address", e.target.value)}
                    maxLength={200}
                    disabled={locked}
                    className="h-12 w-full rounded-xl border-2 border-line bg-paper px-3 disabled:opacity-70"
                    placeholder="e.g. Near Shyambazar 5-point crossing"
                  />
                )}
              </Field>
              <Field label="City / town" hint="Optional">
                {(id) => (
                  <input
                    id={id}
                    value={draft.city}
                    onChange={(e) => update("city", e.target.value)}
                    maxLength={80}
                    disabled={locked}
                    className="h-12 w-full rounded-xl border-2 border-line bg-paper px-3 disabled:opacity-70"
                    placeholder="e.g. Nowgong"
                  />
                )}
              </Field>
              <Field label="What's special this year?" hint="Optional — theme, idol, lighting, timings">
                {(id) => (
                  <textarea
                    id={id}
                    value={draft.description}
                    onChange={(e) => update("description", e.target.value)}
                    maxLength={1000}
                    rows={3}
                    disabled={locked}
                    className="w-full rounded-xl border-2 border-line bg-paper px-3 py-2 disabled:opacity-70"
                  />
                )}
              </Field>
              <fieldset>
                <legend className="mb-1.5 text-base font-semibold">Tags <span className="font-normal text-ink-2">(optional)</span></legend>
                <div className="flex flex-wrap gap-2">
                  {TAGS.map((t) => {
                    const on = draft.tags.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={on}
                        disabled={locked}
                        onClick={() => update("tags", on ? draft.tags.filter((x) => x !== t) : [...draft.tags, t])}
                        className={`h-12 rounded-full border-2 px-4 text-base ${
                          on ? "border-marigold bg-marigold-soft font-semibold" : "border-line bg-paper"
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </section>
          </>
        )}

        <section aria-labelledby="photos-h">
          <h2 id="photos-h" className="mb-2 text-lg font-bold">
            {existingId ? "Your photos" : "3. Photos"}
          </h2>
          <PhotoUploader
            photos={photos}
            max={LIMITS.maxPhotosPerSubmit}
            onAdd={(f) => void addFiles(f)}
            onRemove={removePhoto}
            onRetry={(k) => void retryOne(k)}
            locked={submitting}
          />
          {fieldErr(usable.length === 0) && (
            <p className="mt-1 text-base font-medium text-vermilion-ink" role="alert">
              Add at least one photo so people can see how it looks.
            </p>
          )}
        </section>

        {formError && (
          <div className="rounded-xl border-2 border-vermilion bg-paper px-3 py-2 text-base" role="alert" data-testid="form-error">
            <p>{formError}</p>
            {pandalId && photos.some((p) => p.status === "failed") && (
              <button type="button" onClick={() => finish(pandalId)} className="mt-1 h-12 font-semibold text-indigo underline">
                Finish without them
              </button>
            )}
          </div>
        )}
        </div>
      </div>

      {/* Sticky submit, thumb-reachable, clear of the home indicator */}
      <div
        className="fixed inset-x-0 bottom-0 z-[600] border-t border-line bg-ivory/95 px-4 pt-3 backdrop-blur"
        style={{ paddingBottom: "calc(12px + var(--safe-b))" }}
      >
        <div className={`mx-auto max-w-xl lg:flex lg:items-center lg:justify-end lg:gap-4 ${existingId ? "lg:max-w-3xl" : "lg:max-w-6xl lg:px-2"}`}>
          {showErrors && needAck && (
            <p className="mb-2 text-sm font-medium text-vermilion-ink">Confirm it&apos;s a different pandal, or add photos to the existing one.</p>
          )}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || stillPreparing}
            className="h-14 w-full rounded-2xl bg-vermilion text-lg font-bold text-white shadow-[0_6px_18px_rgba(215,38,61,0.35)] disabled:opacity-60 lg:w-80"
            data-testid="add-submit"
          >
            {submitting
              ? "Saving…"
              : !existingId && !locked && draft.pin && !dupChecked && dupCheck.status === "checking"
                ? "Checking for nearby pandals…"
                : stillPreparing
                ? "Preparing photos…"
                : photos.some((p) => p.status === "failed")
                  ? "Retry failed uploads"
                  : existingId
                    ? "Upload photos"
                    : "Add pandal"}
          </button>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  hint,
  required,
  error,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string | null;
  children: (id: string) => React.ReactNode;
}) {
  const id = `f-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-base font-semibold">
        {label}
        {required && <span className="text-vermilion-ink"> *</span>}
        {hint && <span className="ml-1 text-sm font-normal text-ink-2">{hint}</span>}
      </label>
      {children(id)}
      {error && (
        <p className="mt-1 text-base font-medium text-vermilion-ink" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
