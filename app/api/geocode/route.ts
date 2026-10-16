import { NextResponse, type NextRequest } from "next/server";
import { geocode } from "@/lib/geocode";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 120) {
    return NextResponse.json({ status: "error", message: "Type 2–120 characters." }, { status: 400 });
  }
  try {
    const r = await geocode(q);
    if (r.status === "busy") return NextResponse.json(r, { status: 429, headers: { "Retry-After": "1" } });
    return NextResponse.json({ status: "ok", results: r.results }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("geocode failed", e);
    return NextResponse.json({ status: "error", message: "Search failed. Try again." }, { status: 502 });
  }
}
