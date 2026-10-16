"use client";

/* eslint-disable @next/next/no-img-element -- user photos come from Supabase Storage / data URIs */
import { useEffect, useRef, useState } from "react";

/** Lazy image with a warm blurred placeholder while loading on slow networks. */
export function PhotoImg({
  src,
  alt,
  className,
  eager = false,
}: {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // Cached/data-URI images can finish before hydration attaches onLoad; check directly.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete) {
      if (img.naturalWidth > 0) setLoaded(true);
      else setFailed(true);
    }
  }, [src]);
  return (
    <span className="relative block h-full w-full overflow-hidden bg-indigo-2">
      {!loaded && !failed && <span className="skeleton absolute inset-0 opacity-30" aria-hidden />}
      {failed ? (
        <span className="grid h-full w-full place-items-center p-2 text-center text-xs text-ivory/80">
          Photo unavailable
        </span>
      ) : (
        <img
          ref={ref}
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`${className ?? ""} transition-[filter,opacity] duration-300 ${
            loaded ? "opacity-100 blur-0" : "opacity-60 blur-sm"
          }`}
        />
      )}
    </span>
  );
}
