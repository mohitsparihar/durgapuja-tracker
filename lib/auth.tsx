"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { IS_MOCK } from "./config";
import { DEMO_USER_ID } from "./fixtures/pandals";
import { supabaseBrowser } from "./supabase/client";
import type { AppUser } from "./types";
import { SignInSheet } from "@/components/SignInSheet";

interface AuthCtx {
  user: AppUser | null;
  loading: boolean;
  /**
   * Returns the user when signed in. Otherwise opens the sign-in sheet explaining
   * `reason` and returns null. `next` is where to land after OAuth (defaults to here);
   * `onSignedIn` runs if sign-in completes without leaving the page (demo mode).
   */
  requireUser: (reason: string, opts?: { next?: string; onSignedIn?: (u: AppUser) => void }) => AppUser | null;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);
const MOCK_KEY = "pandal-hop:demo-user";

function safeSession<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<{ reason: string; next: string } | null>(null);
  const pending = useRef<((u: AppUser) => void) | undefined>(undefined);

  useEffect(() => {
    if (IS_MOCK) {
      if (safeSession(() => sessionStorage.getItem(MOCK_KEY), null)) {
        setUser({ id: DEMO_USER_ID, name: "Demo visitor", avatar_url: null });
      }
      setLoading(false);
      return;
    }
    const sb = supabaseBrowser();
    const map = (u: { id: string; user_metadata?: Record<string, unknown> } | null): AppUser | null =>
      u
        ? {
            id: u.id,
            name: (u.user_metadata?.full_name as string) ?? (u.user_metadata?.name as string) ?? null,
            avatar_url: (u.user_metadata?.avatar_url as string) ?? null,
          }
        : null;
    sb.auth.getUser().then(({ data }) => {
      setUser(map(data.user));
      setLoading(false);
    });
    const { data } = sb.auth.onAuthStateChange((_e, session) => setUser(map(session?.user ?? null)));
    return () => data.subscription.unsubscribe();
  }, []);

  const requireUser = useCallback<AuthCtx["requireUser"]>(
    (reason, opts) => {
      if (user) return user;
      pending.current = opts?.onSignedIn;
      const here = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
      setSheet({ reason, next: opts?.next ?? here });
      return null;
    },
    [user],
  );

  const signIn = useCallback(async (next: string) => {
    if (IS_MOCK) {
      const u: AppUser = { id: DEMO_USER_ID, name: "Demo visitor", avatar_url: null };
      safeSession(() => sessionStorage.setItem(MOCK_KEY, "1"), undefined);
      setUser(u);
      setSheet(null);
      const cb = pending.current;
      pending.current = undefined;
      cb?.(u);
      return;
    }
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
    await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}` },
    });
  }, []);

  const signOut = useCallback(async () => {
    if (IS_MOCK) safeSession(() => sessionStorage.removeItem(MOCK_KEY), undefined);
    else await supabaseBrowser().auth.signOut();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, requireUser, signOut }), [user, loading, requireUser, signOut]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {sheet && (
        <SignInSheet
          reason={sheet.reason}
          onSignIn={() => signIn(sheet.next)}
          onClose={() => {
            pending.current = undefined;
            setSheet(null);
          }}
        />
      )}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
