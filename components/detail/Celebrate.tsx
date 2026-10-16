"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/lib/i18n";

const COLORS = ["#d7263d", "#f2a900", "#fffdf8", "#0f766e"];

type Bit = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  spin: number;
  color: string;
};

function burst(width: number, height: number): Bit[] {
  const bits: Bit[] = [];
  const n = 90;
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;
    const speed = 6 + Math.random() * 9;
    bits.push({
      x: width * (0.35 + Math.random() * 0.3),
      y: height * 0.42,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 6 + Math.random() * 7,
      h: 3 + Math.random() * 4,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.28,
      color: COLORS[i % COLORS.length],
    });
  }
  return bits;
}

export function Celebrate({ name, onDone }: { name: string; onDone: () => void }) {
  const { t, lang } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") doneRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    const fit = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();

    const bits = burst(width, height);
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(32, now - last) / 16.67;
      last = now;
      ctx.clearRect(0, 0, width, height);
      let alive = 0;
      for (const bit of bits) {
        bit.vy += 0.18 * dt;
        bit.vx *= 0.99;
        bit.x += bit.vx * dt;
        bit.y += bit.vy * dt;
        bit.rot += bit.spin * dt;
        if (bit.y > height + 24) continue;
        alive++;
        ctx.save();
        ctx.translate(bit.x, bit.y);
        ctx.rotate(bit.rot);
        ctx.fillStyle = bit.color;
        ctx.fillRect(-bit.w / 2, -bit.h / 2, bit.w, bit.h);
        ctx.restore();
      }
      if (alive > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", fit);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-indigo/40" aria-hidden />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="celebrate-title"
        data-testid="celebrate"
        className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-indigo text-center shadow-2xl"
      >
        <div className="festive-edge" aria-hidden />
        <div className="px-6 pb-6 pt-7">
          <h2
            id="celebrate-title"
            className={`text-4xl leading-tight text-marigold ${lang === "en" ? "font-display" : "font-bold"}`}
          >
            {t("jaiMataDi")}
          </h2>
          <p className="mt-3 text-base text-ivory">{t("celebrateBody", { name })}</p>
          <button
            type="button"
            data-testid="celebrate-done"
            autoFocus
            onClick={onDone}
            className="mt-6 h-12 w-full rounded-xl bg-marigold text-base font-semibold text-indigo"
          >
            {t("celebrateSee")}
          </button>
        </div>
      </div>
    </div>
  );
}
