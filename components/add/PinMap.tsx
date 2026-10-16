"use client";

import { Map, Marker, useApiIsLoaded, useMap } from "@vis.gl/react-google-maps";
import { useEffect } from "react";
import { GoogleMapFrame, INDIA_CAMERA, INDIA_ZOOM } from "@/components/maps/GoogleMapFrame";
import { pandalPinIcon } from "@/components/maps/markerIcons";
import type { LatLng } from "@/lib/types";

function Follow({ pinAt, focusKey }: { pinAt: LatLng | null; focusKey: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !pinAt) return;
    map.panTo(pinAt);
    if ((map.getZoom() ?? 0) < 16) map.setZoom(16);
    // Only refocus when a search or GPS fix asks for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, map]);
  return null;
}

function Pin({ at, onPick }: { at: LatLng; onPick: (p: LatLng) => void }) {
  const ready = useApiIsLoaded();
  if (!ready) return null;
  return (
    <Marker
      position={at}
      icon={pandalPinIcon(true, false)}
      draggable
      title="Pandal location — drag to adjust"
      onDragEnd={(e) => {
        const ll = e.latLng;
        if (!ll) return;
        onPick({ lat: ll.lat(), lng: ll.lng() });
      }}
    />
  );
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
    <GoogleMapFrame>
      <Map
        defaultCenter={pinAt ?? INDIA_CAMERA}
        defaultZoom={pinAt ? 16 : INDIA_ZOOM}
        gestureHandling="greedy"
        disableDefaultUI={false}
        zoomControl
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        clickableIcons={false}
        className="h-full w-full"
        style={{ width: "100%", height: "100%" }}
        onClick={(e) => {
          const ll = e.detail.latLng;
          if (ll) onPick(ll);
        }}
      >
        <Follow pinAt={pinAt} focusKey={focusKey} />
        {pinAt && <Pin at={pinAt} onPick={onPick} />}
      </Map>
    </GoogleMapFrame>
  );
}
