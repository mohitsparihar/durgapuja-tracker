import type { GeocodeResult } from "./types";

/** Used when GEOCODE_MOCK=1 (or no service key) so search works without Nominatim. */
export const GEOCODE_FIXTURES: GeocodeResult[] = [
  { label: "Kolkata, West Bengal, India", lat: 22.5726, lng: 88.3639 },
  { label: "Salt Lake City, Bidhannagar, West Bengal, India", lat: 22.5867, lng: 88.4171 },
  { label: "College Street, Kolkata, West Bengal, India", lat: 22.5755, lng: 88.3631 },
  { label: "Ballygunge, Kolkata, West Bengal, India", lat: 22.5262, lng: 88.3653 },
  { label: "Behala, Kolkata, West Bengal, India", lat: 22.4986, lng: 88.3106 },
  { label: "New Delhi, Delhi, India", lat: 28.6139, lng: 77.209 },
  { label: "Chittaranjan Park, New Delhi, Delhi, India", lat: 28.5385, lng: 77.2486 },
  { label: "Kashmere Gate, Delhi, India", lat: 28.6675, lng: 77.2285 },
  { label: "Nowgong, Chhatarpur, Madhya Pradesh, India", lat: 25.0569, lng: 79.4383 },
  { label: "Chhatarpur, Madhya Pradesh, India", lat: 24.9168, lng: 79.5812 },
  { label: "Mumbai, Maharashtra, India", lat: 19.076, lng: 72.8777 },
  { label: "Bengaluru, Karnataka, India", lat: 12.9716, lng: 77.5946 },
  { label: "Guwahati, Assam, India", lat: 26.1445, lng: 91.7362 },
  { label: "Patna, Bihar, India", lat: 25.5941, lng: 85.1376 },
  { label: "Varanasi, Uttar Pradesh, India", lat: 25.3176, lng: 82.9739 },
  { label: "Bhopal, Madhya Pradesh, India", lat: 23.2599, lng: 77.4126 },
];

export function mockGeocode(q: string): GeocodeResult[] {
  const n = q.trim().toLowerCase();
  return GEOCODE_FIXTURES.filter((r) => r.label.toLowerCase().includes(n)).slice(0, 5);
}
