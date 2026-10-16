import { NextResponse, type NextRequest } from "next/server";
import { lookupPlace, suggestPlaces } from "@/lib/geocode";

export const dynamic = "force-dynamic";

const PLACE_ID = /^[A-Za-z0-9_-]{8,300}$/;

export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get("placeId")?.trim() ?? "";
  if (placeId) {
    if (!PLACE_ID.test(placeId)) {
      return NextResponse.json({ status: "error", message: "Unknown place." }, { status: 400 });
    }
    try {
      const result = await lookupPlace(placeId);
      if (!result) return NextResponse.json({ status: "error", message: "Place not found." }, { status: 404 });
      return NextResponse.json({ status: "ok", result }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      console.error("place lookup failed", e);
      return NextResponse.json({ status: "error", message: "Search failed. Try again." }, { status: 502 });
    }
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 120) {
    return NextResponse.json({ status: "error", message: "Type 2–120 characters." }, { status: 400 });
  }
  try {
    const r = await suggestPlaces(q, req.nextUrl.searchParams.get("lang"));
    if (r.status === "busy") return NextResponse.json(r, { status: 429, headers: { "Retry-After": "1" } });
    return NextResponse.json({ status: "ok", results: r.results }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("place search failed", e);
    return NextResponse.json({ status: "error", message: "Search failed. Try again." }, { status: 502 });
  }
}
