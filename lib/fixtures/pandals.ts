/**
 * DEV-ONLY fixtures for DATA_MOCK mode. Names and positions are generated around real
 * neighbourhoods but are NOT real pandal data — never import these into production.
 */
import type { CrowdLevel, ItemStatus } from "../types";

export interface FixturePhoto {
  id: string;
  url: string;
  storage_path: string;
  status: ItemStatus;
  user_id: string;
  created_at: string;
}

export interface FixtureCrowd {
  level: CrowdLevel;
  wait_minutes: number | null;
  created_at: string;
  user_id: string;
}

export interface FixturePandal {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string;
  lat: number;
  lng: number;
  tags: string[];
  status: ItemStatus;
  created_by: string;
  created_at: string;
  photos: FixturePhoto[];
  crowd: FixtureCrowd[];
}

export const DEMO_USER_ID = "demo-user";

// Small deterministic PRNG so fixtures are stable between reloads and test runs.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GROUPS: { city: string; lat: number; lng: number; spread: number; places: string[] }[] = [
  {
    city: "Kolkata",
    lat: 22.56,
    lng: 88.37,
    spread: 0.06,
    places: [
      "Shyambazar", "Hatibagan", "Sovabazar", "Ahiritola", "Kumartuli", "Maniktala", "Sealdah",
      "Bowbazar", "College Para", "Esplanade", "Bhowanipore", "Kalighat", "Gariahat", "Ballygunge",
      "Lake Market", "Tollygunge", "Behala", "Jadavpur", "Santoshpur", "Salt Lake BJ Block",
      "Salt Lake FD Block", "Lake Town", "Dum Dum", "Beleghata", "Park Circus", "Entally", "Chetla",
      "New Alipore", "Kasba", "Garia",
    ],
  },
  {
    city: "Delhi",
    lat: 28.6,
    lng: 77.22,
    spread: 0.1,
    places: [
      "CR Park Block B", "CR Park Mela Ground", "Kalkaji", "Greater Kailash", "Kashmere Gate",
      "Timarpur", "Mayur Vihar", "Noida Sector 26", "Noida Sector 62", "Dwarka Sector 6",
      "Dwarka Sector 11", "Karol Bagh", "Lajpat Nagar", "Saket", "Vasant Kunj", "Rohini",
    ],
  },
  {
    city: "Nowgong",
    lat: 25.06,
    lng: 79.437,
    spread: 0.012,
    places: [
      "Nowgong Bazaar", "Station Road", "Gandhi Chowk", "Civil Lines", "Chhatarpur Road",
      "Harpalpur Road", "Cantt Area", "Ward 12",
    ],
  },
];

// Sparse single points across India so low-zoom clusters must cover quiet areas too.
const SPARSE = [
  { city: "Mumbai", place: "Shivaji Park", lat: 19.027, lng: 72.838 },
  { city: "Bengaluru", place: "RT Nagar", lat: 13.021, lng: 77.595 },
  { city: "Guwahati", place: "Pan Bazaar", lat: 26.186, lng: 91.744 },
  { city: "Patna", place: "Boring Road", lat: 25.613, lng: 85.115 },
  { city: "Varanasi", place: "Bengali Tola", lat: 25.305, lng: 83.009 },
  { city: "Bhopal", place: "TT Nagar", lat: 23.236, lng: 77.401 },
];

const SUFFIXES = ["Sarbojanin Durgotsav", "Puja Committee", "Sangha", "Yubak Sangha", "Durga Puja Samiti", "Club"];
const LEVELS: CrowdLevel[] = ["low", "medium", "high", "very_high"];
const LONG_NAME =
  "Sri Sri Sarbojanin Durgotsav Committee of Upper Ballygunge Lake View Residents' Welfare Association (Est. 1952)";

/** A festive placeholder "photo": layered gradient + glowing light strings. */
function photoSvg(rand: () => number, label: string): string {
  const h1 = Math.floor(rand() * 360);
  const h2 = (h1 + 40 + Math.floor(rand() * 80)) % 360;
  const dots = Array.from({ length: 28 }, (_, i) => {
    const x = (i * 800) / 27;
    const y = 90 + Math.sin(i / 2.2) * 26 + rand() * 6;
    const c = rand() > 0.5 ? "#F2A900" : "#FFE7A3";
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="6" fill="${c}" opacity="0.95"/><circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="16" fill="${c}" opacity="0.18"/>`;
  }).join("");
  const arch = `<path d="M180 600 V330 Q400 140 620 330 V600" fill="hsl(${h2} 70% 30%)" opacity="0.85"/><path d="M250 600 V360 Q400 230 550 360 V600" fill="hsl(${h1} 80% 18%)"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${h1} 60% 18%)"/><stop offset="1" stop-color="hsl(${h2} 70% 38%)"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/>${arch}${dots}<text x="24" y="572" font-family="sans-serif" font-size="22" fill="#FBF5E9" opacity="0.7">${label.replace(/[<&>]/g, "")}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildFixtures(now = Date.now()): FixturePandal[] {
  const rand = mulberry32(1932);
  const out: FixturePandal[] = [];
  const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

  const push = (city: string, place: string, lat: number, lng: number) => {
    const i = out.length;
    const id = `fx-${String(i + 1).padStart(3, "0")}`;
    const name = `${place} ${SUFFIXES[i % SUFFIXES.length]}`;
    const tags = [...new Set([0, 1].map(() => ["Traditional", "Theme", "Eco-friendly", "Heritage", "Lighting", "Family-friendly", "Community"][Math.floor(rand() * 7)]))];
    const photoCount = Math.floor(rand() * 5); // 0..4
    const photos: FixturePhoto[] = Array.from({ length: photoCount }, (_, k) => ({
      id: `${id}-ph${k + 1}`,
      url: photoSvg(rand, place),
      storage_path: `fixture/${id}/${k + 1}.svg`,
      status: "active",
      user_id: `u-${(i + k) % 9}`,
      created_at: iso(600 - k * 60),
    }));
    const crowd: FixtureCrowd[] =
      rand() < 0.65
        ? [
            {
              level: LEVELS[Math.floor(rand() * 4)],
              wait_minutes: rand() < 0.6 ? [5, 10, 20, 30, 45, 60][Math.floor(rand() * 6)] : null,
              created_at: iso(Math.floor(rand() * 80) + 1), // some older than 45 min → expired
              user_id: `u-${i % 7}`,
            },
          ]
        : [];
    out.push({
      id,
      name,
      description:
        rand() < 0.7
          ? `${name} is a much-loved neighbourhood puja in ${place}. Expect dhunuchi naach in the evenings, bhog on Ashtami, and a lit-up lane leading to the mandap.`
          : null,
      address: `${place}, ${city}`,
      city,
      lat,
      lng,
      tags,
      status: "active",
      created_by: `u-${i % 9}`,
      created_at: iso(3000 - i * 10),
      photos,
      crowd,
    });
  };

  for (const g of GROUPS) {
    for (const place of g.places) {
      push(g.city, place, g.lat + (rand() - 0.5) * g.spread * 2, g.lng + (rand() - 0.5) * g.spread * 2);
    }
  }
  for (const s of SPARSE) push(s.city, s.place, s.lat, s.lng);

  // Edge cases the UI must handle.
  const ballygunge = out.find((p) => p.name.startsWith("Ballygunge"))!;
  ballygunge.name = LONG_NAME;
  ballygunge.crowd = [{ level: "very_high", wait_minutes: 60, created_at: iso(4), user_id: "u-1" }];

  const underReview = out.find((p) => p.name.startsWith("Sealdah"))!;
  underReview.status = "needs_review";

  const withFlaggedPhoto = out.find((p) => p.photos.length >= 2)!;
  withFlaggedPhoto.photos[0].status = "needs_review";

  const mine = out.find((p) => p.city === "Nowgong")!;
  mine.created_by = DEMO_USER_ID;

  return out;
}
