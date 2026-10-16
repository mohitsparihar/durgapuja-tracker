"use client";

/* eslint-disable @next/next/no-img-element -- local object-URL previews */
import { useRef } from "react";
import { CameraIcon, CloseIcon, RetryIcon } from "@/components/icons";
import { useI18n, type Key } from "@/lib/i18n";

export type PhotoStatus = "compressing" | "ready" | "uploading" | "done" | "failed" | "invalid";
export interface PendingPhoto {
  /** Also the photo's row id + object name, so retries are idempotent. */
  key: string;
  blob: Blob | null;
  preview: string;
  status: PhotoStatus;
  error: string | null;
}

const LABEL: Record<PhotoStatus, Key> = {
  compressing: "photoPreparing",
  ready: "photoReady",
  uploading: "photoUploading",
  done: "photoUploaded",
  failed: "photoFailed",
  invalid: "photoInvalid",
};

export function PhotoUploader({
  photos,
  max,
  onAdd,
  onRemove,
  onRetry,
  locked,
}: {
  photos: PendingPhoto[];
  max: number;
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
  locked: boolean;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const room = max - photos.filter((p) => p.status !== "invalid").length;

  return (
    <div data-testid="photo-uploader">
      {photos.length > 0 && (
        <ul className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-3">
          {photos.map((p) => (
            <li key={p.key} className="overflow-hidden rounded-xl border border-line bg-paper" data-testid="pending-photo" data-status={p.status}>
              <div className="relative aspect-[4/3] bg-indigo-2">
                {p.preview && <img src={p.preview} alt="" className="h-full w-full object-cover" />}
                {(p.status === "uploading" || p.status === "compressing") && (
                  <div className="skeleton absolute inset-0 opacity-50" aria-hidden />
                )}
                {!locked && p.status !== "uploading" && p.status !== "done" && (
                  <button
                    type="button"
                    onClick={() => onRemove(p.key)}
                    className="absolute right-1 top-1 grid h-12 w-12 place-items-center rounded-full bg-indigo/75 text-ivory"
                    aria-label={t("removeThisPhoto")}
                  >
                    <CloseIcon />
                  </button>
                )}
              </div>
              <div className="flex min-h-12 items-center justify-between gap-1 px-2 py-1">
                <span
                  className={`text-sm font-semibold ${
                    p.status === "failed" || p.status === "invalid"
                      ? "text-vermilion-ink"
                      : p.status === "done"
                        ? "text-[var(--crowd-low)]"
                        : "text-ink-2"
                  }`}
                >
                  {p.status === "done" ? "✓ " : ""}
                  {t(LABEL[p.status])}
                </span>
                {p.status === "failed" && (
                  <button
                    type="button"
                    onClick={() => onRetry(p.key)}
                    className="flex h-12 items-center gap-1 rounded-lg px-2 text-sm font-bold text-indigo underline"
                    data-testid="retry-photo"
                  >
                    <RetryIcon className="h-4 w-4" /> {t("retry")}
                  </button>
                )}
              </div>
              {p.error && <p className="px-2 pb-2 text-xs text-vermilion-ink">{t(p.error as Key)}</p>}
            </li>
          ))}
        </ul>
      )}

      {room > 0 && !locked && (
        <>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo/50 bg-paper text-base font-semibold text-indigo"
          >
            <CameraIcon /> {photos.length ? t("addMore", { n: room }) : t("takePhotos", { n: max })}
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            data-testid="photo-input"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []).slice(0, room);
              e.target.value = "";
              if (files.length) onAdd(files);
            }}
          />
        </>
      )}
      <p className="mt-1.5 text-sm text-ink-2">{t("photosShrunk")}</p>
    </div>
  );
}
