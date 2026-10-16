export type CrowdLevel = "low" | "medium" | "high" | "very_high";
export type ItemStatus = "active" | "needs_review";

export interface CrowdReport {
  level: CrowdLevel;
  wait_minutes: number | null;
  created_at: string;
}

export interface PandalSummary {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  lat: number;
  lng: number;
  tags: string[];
  status: ItemStatus;
  cover_url: string | null;
  /** Metres from the reference point, when the list is distance-sorted. */
  distance_m: number | null;
  crowd: CrowdReport | null;
}

export interface Photo {
  id: string;
  pandal_id: string;
  url: string;
  storage_path: string;
  status: ItemStatus;
  user_id: string | null;
  created_at: string;
}

export interface PandalDetail extends PandalSummary {
  description: string | null;
  created_by: string | null;
  created_at: string;
  photos: Photo[];
}

export interface Cluster {
  lat: number;
  lng: number;
  count: number;
}

export interface ListResult {
  items: PandalSummary[];
  truncated: boolean;
}

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface NewPandal {
  name: string;
  description: string;
  address: string;
  city: string;
  tags: string[];
  lat: number;
  lng: number;
}

export type FlagReason = "wrong_location" | "duplicate" | "inappropriate" | "spam" | "other";

export interface AppUser {
  id: string;
  name: string | null;
  avatar_url: string | null;
}

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}
