"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PhotoDots } from "@/components/detail/PhotoDots";
import { BackIcon, CloseIcon } from "@/components/icons";
import { useI18n } from "@/lib/i18n";
import type { Photo } from "@/lib/types";

/** Full-screen photo viewer. Swipe or use the arrows to move between photos. */
export function PhotoLightbox({
  photos,
  start,
  name,
  onClose,
}: {
  photos: Photo[];
  start: number;
  name: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [index, setIndex] = useState(start);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const count = photos.length;
  const photo = photos[index];

  const step = useCallback(
    (dir: -1 | 1) => {
      setIndex((i) => {
        const next = i + dir;
        if (next < 0 || next >= count) return i;
        return next;
      });
    },
    [count],
  );

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, step]);

  if (!photo) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("photoOf", { name })}
      className="fixed inset-0 z-[1000] flex flex-col bg-black text-ivory"
      data-testid="photo-lightbox"
    >
      <div className="flex h-14 shrink-0 items-center justify-between px-2" style={{ paddingTop: "var(--safe-t)" }}>
        <p className="pl-2 text-sm font-semibold" data-testid="photo-count">
          {t("photoPosition", { n: index + 1, total: count })}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="grid h-12 w-12 place-items-center rounded-full"
          aria-label={t("close")}
          data-testid="photo-close"
        >
          <CloseIcon className="h-6 w-6" />
        </button>
      </div>

      <div
        className="relative min-h-0 flex-1"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const start = drag.current;
          drag.current = null;
          if (!start || count < 2) return;
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
          step(dx < 0 ? 1 : -1);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div className="h-full overflow-hidden">
          <div
            className="flex h-full transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{
              width: `${count * 100}%`,
              transform: `translateX(-${(index * 100) / count}%)`,
            }}
          >
            {photos.map((ph) => (
              <div key={ph.id} className="h-full shrink-0" style={{ width: `${100 / count}%` }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- visitor photos are stored outside the image optimizer */}
                <img src={ph.url} alt={t("photoOf", { name })} className="h-full w-full object-contain" draggable={false} />
              </div>
            ))}
          </div>
        </div>
        {index > 0 && (
          <button
            type="button"
            onClick={() => step(-1)}
            className="absolute left-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/50"
            aria-label={t("photoPrev")}
            data-testid="photo-prev"
          >
            <BackIcon className="h-7 w-7" />
          </button>
        )}
        {index < count - 1 && (
          <button
            type="button"
            onClick={() => step(1)}
            className="absolute right-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/50"
            aria-label={t("photoNext")}
            data-testid="photo-next"
          >
            <BackIcon className="h-7 w-7 rotate-180" />
          </button>
        )}
      </div>

      {count > 1 && (
        <div className="flex h-12 shrink-0 items-center justify-center" style={{ paddingBottom: "var(--safe-b)" }}>
          <PhotoDots count={count} index={index} />
        </div>
      )}
    </div>
  );
}
