type P = { className?: string; title?: string };

function Svg({ className, title, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5"}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

export const SearchIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);
export const LocateIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </Svg>
);
export const PlusIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const MinusIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);
export const HomeIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 10.5 12 4l8 6.5" />
    <path d="M6 9.5V20h12V9.5" />
  </Svg>
);
export const BackIcon = (p: P) => (
  <Svg {...p}>
    <path d="M15 18 9 12l6-6" />
  </Svg>
);
export const CloseIcon = (p: P) => (
  <Svg {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);
export const DirectionsIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 2 2 12l10 10 10-10Z" />
    <path d="M9 13v-2a1 1 0 0 1 1-1h5" />
    <path d="m13 8 2 2-2 2" />
  </Svg>
);
export const FlagIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 21V4" />
    <path d="M5 4h11l-2 4 2 4H5" />
  </Svg>
);
export const CameraIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4Z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);
export const TrashIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
);
export const AlertIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3 2 20h20Z" />
    <path d="M12 10v4M12 17h.01" />
  </Svg>
);
export const WifiOffIcon = (p: P) => (
  <Svg {...p}>
    <path d="m2 2 20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.3-1.7M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 11 5" />
    <path d="M12 20h.01" />
  </Svg>
);
export const PinIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z" />
    <circle cx="12" cy="10" r="2.5" />
  </Svg>
);
export const RetryIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </Svg>
);
export const ClockIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

/** Crowd icons: number of figures conveys level (never colour alone). */
export function CrowdIcon({ level, className }: { level: "low" | "medium" | "high" | "very_high" | null; className?: string }) {
  const n = level === "low" ? 1 : level === "medium" ? 2 : level === "high" || level === "very_high" ? 3 : 0;
  const xs = n === 1 ? [12] : n === 2 ? [8.5, 15.5] : n === 3 ? [5.5, 12, 18.5] : [];
  return (
    <svg viewBox="0 0 24 24" className={className ?? "h-5 w-5"} aria-hidden fill="currentColor">
      {n === 0 ? (
        <path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 2a6 6 0 0 1 4.7 9.7L8.3 7.3A6 6 0 0 1 12 6Zm-4.7 2.3 8.4 8.4A6 6 0 0 1 7.3 8.3Z" opacity=".75" />
      ) : (
        xs.map((x) => (
          <g key={x}>
            <circle cx={x} cy={8} r={2.6} />
            <path d={`M${x - 3.6} 20v-4.2a3.6 3.6 0 0 1 7.2 0V20Z`} />
          </g>
        ))
      )}
      {level === "very_high" && <path d="M22 2.5v4.2M22 8.6v.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}
