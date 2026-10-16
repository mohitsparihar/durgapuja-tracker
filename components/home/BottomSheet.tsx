"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type Snap = "peek" | "half" | "full";
const PEEK = 132;
const nextSnap: Record<Snap, Snap> = { peek: "half", half: "full", full: "peek" };

function heights(topOffset: number, vh: number) {
  const full = Math.max(PEEK + 80, vh - topOffset - 8);
  const half = Math.min(full, Math.max(PEEK + 120, Math.round(vh * 0.5)));
  return { peek: PEEK, half, full };
}

/**
 * Draggable bottom sheet with three snap points. Height (not transform) is animated so
 * the list inside is always fully scrollable within the visible part. The handle is a
 * real button so keyboard and screen-reader users can change the snap without dragging.
 */
export function BottomSheet({
  snap,
  onSnap,
  topOffset,
  header,
  children,
}: {
  snap: Snap;
  onSnap: (s: Snap) => void;
  topOffset: number;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  // Fixed first render so SSR and hydration agree; real size is measured in the effect.
  const [h, setH] = useState(() => heights(topOffset, 800));
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef<{ y0: number; h0: number; moved: boolean; vy: number; lastY: number; lastT: number } | null>(null);

  useEffect(() => {
    const onResize = () => setH(heights(topOffset, window.innerHeight));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [topOffset]);

  const height = dragH ?? h[snap];

  useLayoutEffect(() => {
    document.documentElement.style.setProperty("--sheet-h", `${height}px`);
  }, [height]);
  useEffect(() => () => document.documentElement.style.setProperty("--sheet-h", "0px"), []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { y0: e.clientY, h0: height, moved: false, vy: 0, lastY: e.clientY, lastT: performance.now() };
    // Capture immediately: a fast upward drag leaves the sheet before the first move event.
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y0;
    if (Math.abs(dy) > 6) d.moved = true;
    const now = performance.now();
    if (now > d.lastT) d.vy = (d.lastY - e.clientY) / (now - d.lastT); // px/ms, + = upward
    d.lastY = e.clientY;
    d.lastT = now;
    if (d.moved) setDragH(Math.min(h.full, Math.max(h.peek, d.h0 - dy)));
  };
  const finish = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (!d.moved || dragH == null) {
        setDragH(null);
        // Pointer capture retargets the click away from the button, so a tap on the
        // handle row is handled here; the button's onClick only serves keyboards.
        if (e.type === "pointerup") onSnap(nextSnap[snap]);
        return;
      }
      // Positive growth = sheet was pulled up. A quick fling goes to the next snap in that
      // direction; a slow release settles on the nearest snap.
      // Only movement in the last ~100ms counts as a fling; a held drag settles to nearest.
      const growth = performance.now() - d.lastT < 100 ? d.vy : 0;
      const order: Snap[] = ["peek", "half", "full"];
      let target: Snap;
      if (growth > 0.5) target = order.find((s) => h[s] > dragH) ?? "full";
      else if (growth < -0.5) target = [...order].reverse().find((s) => h[s] < dragH) ?? "peek";
      else target = order.reduce((a, s) => (Math.abs(h[s] - dragH) < Math.abs(h[a] - dragH) ? s : a), "peek" as Snap);
      setDragH(null);
      onSnap(target);
    },
    [dragH, h, onSnap, snap],
  );

  const label: Record<Snap, string> = {
    peek: "Show more of the list",
    half: "Expand list to full screen",
    full: "Collapse list to show the map",
  };

  return (
    <section
      aria-label="Pandal list"
      data-testid="bottom-sheet"
      data-snap={snap}
      className="fixed inset-x-0 bottom-0 z-[500] flex flex-col rounded-t-3xl bg-ivory shadow-[0_-8px_30px_rgba(30,27,75,0.25)]"
      style={{
        height,
        transition: dragH == null ? "height 220ms cubic-bezier(.2,.8,.2,1)" : "none",
        paddingLeft: "var(--safe-l)",
        paddingRight: "var(--safe-r)",
      }}
    >
      <div
        className="shrink-0 touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        <button
          type="button"
          onClick={(e) => e.detail === 0 && onSnap(nextSnap[snap])}
          aria-label={label[snap]}
          data-testid="sheet-handle"
          className="mx-auto -mb-3 flex h-12 w-full items-center justify-center"
        >
          <span className="h-1.5 w-12 rounded-full bg-ink-2/40" />
        </button>
        {header}
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3"
        style={{ paddingBottom: "calc(16px + var(--safe-b))" }}
        data-testid="sheet-scroll"
      >
        {children}
      </div>
    </section>
  );
}
