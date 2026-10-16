"use client";

import { Map, Marker, useApiIsLoaded } from "@vis.gl/react-google-maps";
import { GoogleMapFrame } from "@/components/maps/GoogleMapFrame";
import { placePinIcon } from "@/components/maps/markerIcons";
import type { LatLng, PlaceKind } from "@/lib/types";

function Pin({ at, label, kind }: { at: LatLng; label: string; kind: PlaceKind }) {
  const ready = useApiIsLoaded();
  if (!ready) return null;
  return <Marker position={at} icon={placePinIcon(kind, true, false)} title={label} clickable={false} />;
}

/** Small location map for the desktop detail page. Scroll-wheel zoom stays off so the page scrolls. */
export default function MiniMap({ at, label, kind }: { at: LatLng; label: string; kind: PlaceKind }) {
  return (
    <GoogleMapFrame>
      <Map
        defaultCenter={at}
        defaultZoom={16}
        gestureHandling="cooperative"
        scrollwheel={false}
        disableDefaultUI
        clickableIcons={false}
        className="h-full w-full"
        style={{ width: "100%", height: "100%" }}
      >
        <Pin at={at} label={label} kind={kind} />
      </Map>
    </GoogleMapFrame>
  );
}
