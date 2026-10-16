"use client";

import Link from "next/link";
import { forwardRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { IS_MOCK } from "@/lib/config";

export function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <span className={`font-display leading-none text-marigold ${small ? "text-xl" : "text-2xl"}`}>
      Pandal <span className="text-ivory">Hop</span>
    </span>
  );
}

function AccountMenu() {
  const { user, signOut } = useAuth();
  const [menu, setMenu] = useState(false);
  if (!user) return null;
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setMenu((m) => !m)}
        className="grid h-12 w-12 place-items-center rounded-full border-2 border-marigold/60 bg-indigo-2 text-base font-bold"
        aria-label="Account"
        aria-expanded={menu}
      >
        {(user.name ?? "You").slice(0, 1).toUpperCase()}
      </button>
      {menu && (
        <div className="absolute right-0 top-14 z-[950] w-48 rounded-2xl bg-paper p-1 text-ink shadow-xl">
          <p className="truncate px-3 py-2 text-sm text-ink-2">{user.name ?? "Signed in"}</p>
          <button
            onClick={() => {
              setMenu(false);
              void signOut();
            }}
            className="h-12 w-full rounded-xl px-3 text-left text-base font-medium hover:bg-ivory-2"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Night-indigo header with hanging string lights and an alpana edge.
 * - Phone (default): wordmark row, then the search (children) on its own row.
 * - Wide (`compact`): one row — wordmark · centred search · actions · account.
 */
export const AppHeader = forwardRef<
  HTMLElement,
  { children?: React.ReactNode; compact?: boolean; actions?: React.ReactNode }
>(function AppHeader({ children, compact = false, actions }, ref) {
  const title = (
    <h1 className="flex shrink-0 items-baseline gap-2">
      <Link href="/" aria-label="Pandal Hop home" className="rounded-md">
        <Wordmark small={compact} />
      </Link>
      {IS_MOCK && (
        <span className="rounded-full bg-marigold/20 px-2 py-0.5 text-xs font-semibold text-marigold-soft" data-testid="demo-badge">
          Demo data
        </span>
      )}
    </h1>
  );

  return (
    <header
      ref={ref}
      className="relative z-[600] shrink-0 bg-indigo text-ivory"
      style={{ paddingTop: "var(--safe-t)", paddingLeft: "var(--safe-l)", paddingRight: "var(--safe-r)" }}
    >
      <div className="string-lights pointer-events-none absolute inset-x-0 top-[var(--safe-t)] h-[18px]" aria-hidden />
      {compact ? (
        <div className="relative flex items-center gap-3 px-3 py-2 lg:gap-6 lg:px-6 lg:py-3">
          {title}
          {children && <div className="mx-auto min-w-0 max-w-2xl flex-1">{children}</div>}
          {actions && <div className="hidden shrink-0 items-center gap-2 lg:flex">{actions}</div>}
          <AccountMenu />
        </div>
      ) : (
        <div className="relative px-3 pb-3 pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            {title}
            <AccountMenu />
          </div>
          {children && <div className="min-w-0">{children}</div>}
        </div>
      )}
      <div className="festive-edge" aria-hidden />
    </header>
  );
});
