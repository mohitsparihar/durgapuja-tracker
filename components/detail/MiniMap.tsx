"use client";

import { Map, Marker, useApiIsLoaded } from "@vis.gl/react-google-maps";
import { GoogleMapFrame } from "@/components/maps/GoogleMapFrame";
import { pandalPinIcon } from "@/components/maps/markerIcons";
import type { LatLng } from "@/lib/types";

function Pin({ at, label }: { at: LatLng; label: string }) {
  const ready = useApiIsLoaded();
  if (!ready) return null;
  return <Marker position={at} icon={pandalPinIcon(true, false)} title={label} clickable={false} />;
}

/** Small location map for the desktop detail page. Scroll-wheel zoom stays off so the page scrolls. */
export default function MiniMap({ at, label }: { at: LatLng; label: string }) {
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
        <Pin at={at} label={label} />
      </Map>
    </GoogleMapFrame>
  );
}
