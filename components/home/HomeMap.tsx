"use client";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { AttributionControl, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { INDIA_BOUNDS } from "@/lib/config";
import type { Bounds, Cluster, LatLng, PandalSummary } from "@/lib/types";

export interface MapView {
  bounds: Bounds;
  zoom: number;
  center: LatLng;
}

export interface MapApi {
  flyTo: (p: LatLng, zoom?: number) => void;
  fitIndia: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  getZoom: () => number;
}

// The visible pin is 34px wide, but the tap target is padded to ≥48px.
const pinHtml = (selected: boolean, review: boolean) => `
  <span style="display:flex;width:100%;height:100%;align-items:flex-end;justify-content:center">
  <svg width="${selected ? 44 : 34}" height="${selected ? 56 : 44}" viewBox="0 0 34 44" aria-hidden="true">
    ${selected ? '<ellipse cx="17" cy="41" rx="9" ry="3" fill="rgba(0,0,0,.25)"/>' : ""}
    <path d="M17 1.5C8.4 1.5 1.5 8.3 1.5 16.8 1.5 28.5 17 42 17 42s15.5-13.5 15.5-25.2C32.5 8.3 25.6 1.5 17 1.5Z"
      fill="${selected ? "#1e1b4b" : "#d7263d"}" stroke="${selected ? "#f2a900" : "#ffffff"}" stroke-width="${selected ? 3 : 2.5}"/>
    <circle cx="17" cy="16.5" r="${review ? 4.5 : 5.5}" fill="${selected ? "#f2a900" : "#ffffff"}"/>
  </svg></span>`;

const iconCache = new Map<string, L.DivIcon>();
export function pinIcon(selected: boolean, review: boolean): L.DivIcon {
  const key = `${selected}-${review}`;
  let icon = iconCache.get(key);
  if (!icon) {
    icon = L.divIcon({
      className: "pin-icon",
      html: pinHtml(selected, review),
      iconSize: selected ? [48, 58] : [48, 48],
      iconAnchor: selected ? [24, 56] : [24, 47],
    });
    iconCache.set(key, icon);
  }
  return icon;
}

function clusterIcon(count: number): L.DivIcon {
  // 48px minimum so every bubble is a comfortable tap target.
  const size = Math.round(Math.min(72, 48 + Math.log10(count) * 12));
  const label = count >= 1000 ? `${Math.floor(count / 100) / 10}k` : String(count);
  return L.divIcon({
    className: "cluster-icon",
    html: `<div class="cluster-bubble" style="width:${size}px;height:${size}px;font-size:${count >= 100 ? 15 : 17}px">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const userIcon = L.divIcon({
  className: "pin-icon",
  html: `<span style="display:block;width:22px;height:22px;border-radius:9999px;background:#2563eb;border:4px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,.25)"></span>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function toView(map: L.Map): MapView {
  const b = map.getBounds();
  const c = map.getCenter();
  return {
    bounds: {
      south: Math.max(-90, b.getSouth()),
      west: Math.max(-180, b.getWest()),
      north: Math.min(90, b.getNorth()),
      east: Math.min(180, b.getEast()),
    },
    zoom: map.getZoom(),
    center: { lat: c.lat, lng: c.lng },
  };
}

function Bridge({ onView, onReady }: { onView: (v: MapView) => void; onReady: (api: MapApi) => void }) {
  const map = useMap();
  useMapEvents({ moveend: () => onView(toView(map)) });
  useEffect(() => {
    onReady({
      flyTo: (p, zoom) => map.flyTo([p.lat, p.lng], zoom ?? map.getZoom(), { duration: 0.6 }),
      fitIndia: () => map.fitBounds(INDIA_BOUNDS),
      zoomIn: () => map.zoomIn(),
      zoomOut: () => map.zoomOut(),
      getZoom: () => map.getZoom(),
    });
    onView(toView(map));
    // Sheet/panel layout changes resize the map container.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map, onReady, onView]);
  return null;
}

export default function HomeMap({
  markers,
  clusters,
  selectedId,
  userPoint,
  onMarkerSelect,
  onClusterSelect,
  onView,
  onReady,
}: {
  markers: PandalSummary[];
  clusters: Cluster[];
  selectedId: string | null;
  userPoint: LatLng | null;
  onMarkerSelect: (p: PandalSummary) => void;
  onClusterSelect: (c: Cluster) => void;
  onView: (v: MapView) => void;
  onReady: (api: MapApi) => void;
}) {
  const clusterIcons = useMemo(() => clusters.map((c) => clusterIcon(c.count)), [clusters]);

  return (
    <MapContainer
      bounds={INDIA_BOUNDS}
      zoomControl={false}
      attributionControl={false}
      minZoom={4}
      maxZoom={19}
      worldCopyJump={false}
      className="home-map h-full w-full"
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      <AttributionControl position="bottomleft" prefix={false} />
      <Bridge onView={onView} onReady={onReady} />

      {clusters.map((c, i) => (
        <Marker
          key={`c-${c.lat.toFixed(4)}-${c.lng.toFixed(4)}-${c.count}`}
          position={[c.lat, c.lng]}
          icon={clusterIcons[i]}
          title={`${c.count} pandals here — tap to zoom in`}
          alt={`${c.count} pandals`}
          eventHandlers={{ click: () => onClusterSelect(c) }}
        />
      ))}

      {markers.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={pinIcon(p.id === selectedId, p.status === "needs_review")}
          title={p.name}
          alt={p.name}
          zIndexOffset={p.id === selectedId ? 1000 : 0}
          eventHandlers={{ click: () => onMarkerSelect(p) }}
        />
      ))}

      {userPoint && (
        <Marker position={[userPoint.lat, userPoint.lng]} icon={userIcon} interactive={false} keyboard={false} />
      )}
    </MapContainer>
  );
}
