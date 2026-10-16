"use client";

import { Map, Marker, useApiIsLoaded, useMap } from "@vis.gl/react-google-maps";
import { useEffect } from "react";
import { GoogleMapFrame, INDIA_CAMERA, INDIA_ZOOM } from "@/components/maps/GoogleMapFrame";
import { clusterPinIcon, pandalPinIcon, searchPinIcon, userDotIcon } from "@/components/maps/markerIcons";
import { INDIA_BOUNDS } from "@/lib/config";
import type { Bounds, Cluster, LatLng, PandalSummary } from "@/lib/types";

export interface MapView {
  bounds: Bounds;
  zoom: number;
  center: LatLng;
}

export interface MapApi {
  /** `bottomPad` is the sheet height the pin should sit above, in pixels. */
  flyTo: (p: LatLng, zoom?: number, bottomPad?: number) => void;
  fitIndia: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  getZoom: () => number;
}

/** Shift the camera south so the target sits in the open map, above the sheet. */
function visibleCenter(map: google.maps.Map, p: LatLng, zoom: number, bottom: number, top: number): LatLng {
  const shiftY = (bottom - top) / 2;
  const projection = map.getProjection();
  if (!projection || shiftY < 8) return p;
  const world = projection.fromLatLngToPoint(new google.maps.LatLng(p.lat, p.lng));
  if (!world) return p;
  const center = projection.fromPointToLatLng(new google.maps.Point(world.x, world.y + shiftY / 2 ** zoom));
  return center ? { lat: center.lat(), lng: center.lng() } : p;
}

function sheetPad(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sheet-h")) || 0;
}

function Bridge({
  onView,
  onReady,
  chromeTop,
}: {
  onView: (v: MapView) => void;
  onReady: (api: MapApi) => void;
  chromeTop: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const report = () => {
      const b = map.getBounds();
      const c = map.getCenter();
      const zoom = map.getZoom();
      if (!b || !c || zoom == null) return;
      onView({
        bounds: {
          south: Math.max(-90, b.getSouthWest().lat()),
          west: Math.max(-180, b.getSouthWest().lng()),
          north: Math.min(90, b.getNorthEast().lat()),
          east: Math.min(180, b.getNorthEast().lng()),
        },
        zoom,
        center: { lat: c.lat(), lng: c.lng() },
      });
    };
    const idle = map.addListener("idle", report);
    const applyPad = () => {
      const pad = { top: chromeTop, right: 0, bottom: sheetPad(), left: 0 };
      map.setOptions({ padding: pad } as google.maps.MapOptions);
    };
    applyPad();
    const obs = new MutationObserver(applyPad);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    onReady({
      flyTo: (p, zoom, bottomPad) => {
        const z = zoom ?? map.getZoom() ?? INDIA_ZOOM;
        const bottom = bottomPad ?? sheetPad();
        const shiftY = (bottom - chromeTop) / 2;
        const center = visibleCenter(map, p, z, bottom, chromeTop);
        map.moveCamera({ center, zoom: z });
        if (center === p && shiftY >= 8) {
          google.maps.event.addListenerOnce(map, "idle", () => map.panBy(0, shiftY));
        }
      },
      fitIndia: () =>
        map.fitBounds({
          south: INDIA_BOUNDS[0][0],
          west: INDIA_BOUNDS[0][1],
          north: INDIA_BOUNDS[1][0],
          east: INDIA_BOUNDS[1][1],
        }),
      zoomIn: () => map.setZoom((map.getZoom() ?? INDIA_ZOOM) + 1),
      zoomOut: () => map.setZoom((map.getZoom() ?? INDIA_ZOOM) - 1),
      getZoom: () => map.getZoom() ?? INDIA_ZOOM,
    });
    report();
    return () => {
      idle.remove();
      obs.disconnect();
    };
  }, [map, onReady, onView, chromeTop]);
  return null;
}

function Pins({
  markers,
  clusters,
  selectedId,
  userPoint,
  placePoint,
  onMarkerSelect,
  onClusterSelect,
}: {
  markers: PandalSummary[];
  clusters: Cluster[];
  selectedId: string | null;
  userPoint: LatLng | null;
  placePoint: LatLng | null;
  onMarkerSelect: (p: PandalSummary) => void;
  onClusterSelect: (c: Cluster) => void;
}) {
  const ready = useApiIsLoaded();
  if (!ready) return null;
  return (
    <>
      {clusters.map((c) => (
        <Marker
          key={`c-${c.lat.toFixed(4)}-${c.lng.toFixed(4)}-${c.count}`}
          position={{ lat: c.lat, lng: c.lng }}
          icon={clusterPinIcon(c.count)}
          title={`${c.count} pandals`}
          onClick={() => onClusterSelect(c)}
        />
      ))}
      {markers.map((p) => (
        <Marker
          key={p.id}
          position={{ lat: p.lat, lng: p.lng }}
          icon={pandalPinIcon(p.id === selectedId, p.status === "needs_review")}
          title={p.name}
          zIndex={p.id === selectedId ? 1000 : 1}
          onClick={() => onMarkerSelect(p)}
        />
      ))}
      {placePoint && (
        <Marker position={placePoint} icon={searchPinIcon()} clickable={false} zIndex={900} />
      )}
      {userPoint && (
        <Marker position={userPoint} icon={userDotIcon()} clickable={false} zIndex={500} />
      )}
    </>
  );
}

export default function HomeMap({
  markers,
  clusters,
  selectedId,
  userPoint,
  placePoint = null,
  chromeTop = 0,
  onMarkerSelect,
  onClusterSelect,
  onView,
  onReady,
}: {
  markers: PandalSummary[];
  clusters: Cluster[];
  selectedId: string | null;
  userPoint: LatLng | null;
  placePoint?: LatLng | null;
  chromeTop?: number;
  onMarkerSelect: (p: PandalSummary) => void;
  onClusterSelect: (c: Cluster) => void;
  onView: (v: MapView) => void;
  onReady: (api: MapApi) => void;
}) {
  return (
    <GoogleMapFrame>
      <Map
        defaultCenter={INDIA_CAMERA}
        defaultZoom={INDIA_ZOOM}
        gestureHandling="greedy"
        disableDefaultUI
        clickableIcons={false}
        minZoom={4}
        maxZoom={20}
        className="home-map h-full w-full"
        style={{ width: "100%", height: "100%" }}
      >
        <Bridge onView={onView} onReady={onReady} chromeTop={chromeTop} />
        <Pins
          markers={markers}
          clusters={clusters}
          selectedId={selectedId}
          userPoint={userPoint}
          placePoint={placePoint}
          onMarkerSelect={onMarkerSelect}
          onClusterSelect={onClusterSelect}
        />
      </Map>
    </GoogleMapFrame>
  );
}
