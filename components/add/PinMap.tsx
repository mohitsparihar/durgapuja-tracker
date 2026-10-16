"use client";

import L from "leaflet";
import { useEffect } from "react";
import { AttributionControl, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { INDIA_BOUNDS } from "@/lib/config";
import type { LatLng } from "@/lib/types";

const pin = L.divIcon({
  className: "pin-icon",
  html: `<svg width="44" height="56" viewBox="0 0 34 44" aria-hidden="true"><ellipse cx="17" cy="41" rx="9" ry="3" fill="rgba(0,0,0,.25)"/><path d="M17 1.5C8.4 1.5 1.5 8.3 1.5 16.8 1.5 28.5 17 42 17 42s15.5-13.5 15.5-25.2C32.5 8.3 25.6 1.5 17 1.5Z" fill="#d7263d" stroke="#fff" stroke-width="2.5"/><circle cx="17" cy="16.5" r="5.5" fill="#fff"/></svg>`,
  iconSize: [44, 56],
  iconAnchor: [22, 54],
});

function Events({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

/** Keeps the map centred on the pin whenever it is set from outside (GPS / search). */
function Follow({ pinAt, focusKey }: { pinAt: LatLng | null; focusKey: number }) {
  const map = useMap();
  useEffect(() => {
    if (pinAt) map.setView([pinAt.lat, pinAt.lng], Math.max(map.getZoom(), 16));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only refocus on explicit requests
  }, [focusKey, map]);
  return null;
}

export default function PinMap({
  pinAt,
  focusKey,
  onPick,
}: {
  pinAt: LatLng | null;
  focusKey: number;
  onPick: (p: LatLng) => void;
}) {
  return (
    <MapContainer
      bounds={pinAt ? undefined : INDIA_BOUNDS}
      center={pinAt ? [pinAt.lat, pinAt.lng] : undefined}
      zoom={pinAt ? 16 : undefined}
      zoomControl
      attributionControl={false}
      className="h-full w-full"
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      <AttributionControl position="bottomleft" prefix={false} />
      <Events onPick={onPick} />
      <Follow pinAt={pinAt} focusKey={focusKey} />
      {pinAt && (
        <Marker
          position={[pinAt.lat, pinAt.lng]}
          icon={pin}
          draggable
          title="Pandal location — drag to adjust"
          alt="Pandal location"
          eventHandlers={{
            dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              onPick({ lat: ll.lat, lng: ll.lng });
            },
          }}
        />
      )}
    </MapContainer>
  );
}
