/**
 * Import pandals from supabase/demo-seed.csv.
 *
 *   npm run seed            → only rows with verified=true   (production)
 *   npm run seed -- --dev   → every row, as dev fixtures       (dev/test project only)
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env.local).
 * Rows already present (same name within 200 m) are skipped, so re-running is safe.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const dev = process.argv.includes("--dev");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in .env.local).");
  process.exit(1);
}

interface Row {
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  tags: string[];
  verified: boolean;
}

function parse(csv: string): Row[] {
  const [header, ...lines] = csv.trim().split(/\r?\n/);
  const cols = header.split(",");
  return lines.filter(Boolean).map((line) => {
    const v = line.split(",");
    const get = (c: string) => (v[cols.indexOf(c)] ?? "").trim();
    return {
      name: get("name"),
      address: get("address"),
      city: get("city"),
      lat: Number(get("lat")),
      lng: Number(get("lng")),
      tags: get("tags") ? get("tags").split("|") : [],
      verified: get("verified").toLowerCase() === "true",
    };
  });
}

async function main() {
  const db = createClient(url!, key!, { auth: { persistSession: false } });
  const rows = parse(readFileSync("supabase/demo-seed.csv", "utf8"));
  const chosen = rows.filter((r) => dev || r.verified);
  console.log(`${chosen.length} of ${rows.length} rows selected (${dev ? "dev: all rows" : "verified only"}).`);
  if (!dev && chosen.length < 5) {
    console.warn("⚠ Launch gate: fewer than 5 verified pandals. Verify more rows before sharing the app.");
  }

  let added = 0;
  for (const r of chosen) {
    if (!r.name || !Number.isFinite(r.lat) || !Number.isFinite(r.lng)) {
      console.warn("skip malformed row:", r.name);
      continue;
    }
    const dupes = await db.rpc("find_duplicates", { p_lat: r.lat, p_lng: r.lng, p_name: r.name });
    if (dupes.error) throw dupes.error;
    if ((dupes.data as { name: string; distance_m: number }[]).some((d) => d.name.toLowerCase() === r.name.toLowerCase() && d.distance_m < 200)) {
      console.log("exists:", r.name);
      continue;
    }
    const { error } = await db.from("pandals").insert({
      name: r.name,
      address: r.address || null,
      city: r.city || null,
      tags: r.tags,
      location: `SRID=4326;POINT(${r.lng} ${r.lat})`,
      created_by: null,
    });
    if (error) throw error;
    added++;
    console.log("added:", r.name);
  }
  console.log(`Done. ${added} added.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
