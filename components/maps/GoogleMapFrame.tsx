"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import { useI18n } from "@/lib/i18n";

export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

/** A readable view of India — closer than fitting the whole country into a short strip. */
export const INDIA_CAMERA = { lat: 22.8, lng: 79.5 };
export const INDIA_ZOOM = 5;

export function GoogleMapFrame({ children }: { children: React.ReactNode }) {
  const { t, lang } = useI18n();
  if (!GOOGLE_MAPS_KEY) {
    return (
      <div className="grid h-full w-full place-items-center bg-[#e9e4d8] p-6 text-center">
        <p className="max-w-xs text-base leading-snug text-ink">{t("mapKeyMissing")}</p>
      </div>
    );
  }
  return (
    <APIProvider apiKey={GOOGLE_MAPS_KEY} language={lang} region="IN">
      {children}
    </APIProvider>
  );
}
