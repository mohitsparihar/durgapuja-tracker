export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Mock data mode: explicit flag, or automatically when Supabase isn't configured. */
export const IS_MOCK =
  process.env.NEXT_PUBLIC_DATA_MOCK === "1" || !SUPABASE_URL || !SUPABASE_ANON_KEY;

export const PHOTO_BUCKET = "pandal-photos";

export const LIMITS = {
  nearbyRadiusM: 25_000,
  nearbyLimit: 50,
  boundsLimit: 300,
  /** Markers at zoom >= this; cluster bubbles below it. */
  markerMinZoom: 10,
  /** Clusters: at most this many cells across the longer side of the viewport. */
  clusterCellsPerSide: 12,
  crowdTtlMinutes: 45,
  duplicateRadiusM: 50,
  maxPhotosPerSubmit: 5,
  maxPhotoBytes: 2 * 1024 * 1024,
} as const;

export const INDIA_BOUNDS: [[number, number], [number, number]] = [
  [6.5, 68.0],
  [35.7, 97.4],
];

export const TAGS = [
  "Traditional",
  "Theme",
  "Eco-friendly",
  "Heritage",
  "Lighting",
  "Family-friendly",
  "Community",
  "Bonedi Bari",
] as const;
