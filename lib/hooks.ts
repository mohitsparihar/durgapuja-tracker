"use client";

import { useEffect, useState } from "react";

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/** Side-panel layout when the screen is wider than tall (phone landscape, tablets, desktop). */
export function useIsSide(): boolean {
  const [side, setSide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(orientation: landscape) and (min-width: 560px)");
    const update = () => setSide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return side;
}

/** Calls `fn` when the tab becomes visible again or the network comes back. */
export function useRefetchOnReturn(fn: () => void) {
  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && fn();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", fn);
    window.addEventListener("online", fn);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", fn);
      window.removeEventListener("online", fn);
    };
  }, [fn]);
}

export const storage = {
  get<T>(key: string): T | null {
    try {
      const v = localStorage.getItem(key);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage may be full or blocked — non-critical */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
