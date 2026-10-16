"use client";

import { AttributionControl, MapContainer, Marker, TileLayer } from "react-leaflet";
import { pinIcon } from "@/components/home/HomeMap";
import type { LatLng } from "@/lib/types";

/** Small location map for the desktop detail page. Scroll-wheel zoom off so the page scrolls. */
export default function MiniMap({ at, label }: { at: LatLng; label: string }) {
  return (
    <MapContainer
      center={[at.lat, at.lng]}
      zoom={16}
      scrollWheelZoom={false}
      attributionControl={false}
      className="h-full w-full"
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      <AttributionControl position="bottomleft" prefix={false} />
      <Marker position={[at.lat, at.lng]} icon={pinIcon(true, false)} title={label} alt={label} keyboard={false} />
    </MapContainer>
  );
}
