import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Resolve `next` against our origin and accept it only if it stays on this site. */
function safeNext(raw: string | null, origin: string): URL {
  const home = new URL("/", origin);
  if (!raw) return home;
  try {
    const url = new URL(raw, origin);
    return url.origin === origin ? url : home;
  } catch {
    return home;
  }
}

/** OAuth (PKCE) return point: exchange the code for a session, then go back where the user was. */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  const next = safeNext(req.nextUrl.searchParams.get("next"), origin);

  if (code) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (error) console.error("auth callback failed", error.message);
  }
  return NextResponse.redirect(next);
}
