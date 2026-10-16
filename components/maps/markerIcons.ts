const cache = new Map<string, google.maps.Icon>();

function svgUrl(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function icon(key: string, svg: string, w: number, h: number, ax: number, ay: number): google.maps.Icon {
  const hit = cache.get(key);
  if (hit) return hit;
  const made: google.maps.Icon = {
    url: svgUrl(svg),
    scaledSize: new google.maps.Size(w, h),
    anchor: new google.maps.Point(ax, ay),
  };
  cache.set(key, made);
  return made;
}

export function placePinIcon(kind: "pandal" | "ramleela" | "ravan", selected: boolean, review: boolean): google.maps.Icon {
  const w = selected ? 44 : 34;
  const h = selected ? 56 : 44;
  const fill = selected ? "#1e1b4b" : kind === "ramleela" ? "#0f766e" : kind === "ravan" ? "#ea580c" : "#d7263d";
  const stroke = selected
    ? kind === "ramleela"
      ? "#0f766e"
      : kind === "ravan"
        ? "#ea580c"
        : "#f2a900"
    : kind === "ravan"
      ? "#7c2d12"
      : "#ffffff";
  const sw = selected ? 3 : 2.5;
  const dot = selected ? (kind === "ramleela" ? "#5eead4" : kind === "ravan" ? "#fdba74" : "#f2a900") : "#ffffff";
  const r = review ? 4.5 : 5.5;
  const shadow = selected ? `<ellipse cx="17" cy="41" rx="9" ry="3" fill="rgba(0,0,0,.25)"/>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 34 44">${shadow}<path d="M17 1.5C8.4 1.5 1.5 8.3 1.5 16.8 1.5 28.5 17 42 17 42s15.5-13.5 15.5-25.2C32.5 8.3 25.6 1.5 17 1.5Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/><circle cx="17" cy="16.5" r="${r}" fill="${dot}"/></svg>`;
  return icon(`pin-${kind}-${selected}-${review}`, svg, w, h, w / 2, h - 2);
}

export function pandalPinIcon(selected: boolean, review: boolean): google.maps.Icon {
  return placePinIcon("pandal", selected, review);
}

export function searchPinIcon(): google.maps.Icon {
  const w = 44;
  const h = 56;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 34 44"><ellipse cx="17" cy="41" rx="9" ry="3" fill="rgba(0,0,0,.25)"/><path d="M17 1.5C8.4 1.5 1.5 8.3 1.5 16.8 1.5 28.5 17 42 17 42s15.5-13.5 15.5-25.2C32.5 8.3 25.6 1.5 17 1.5Z" fill="#2563eb" stroke="#ffffff" stroke-width="2.5"/><circle cx="17" cy="16.5" r="5.5" fill="#ffffff"/></svg>`;
  return icon("search-pin", svg, w, h, w / 2, h - 2);
}

export function userDotIcon(): google.maps.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"><circle cx="11" cy="11" r="7" fill="#2563eb" stroke="#ffffff" stroke-width="4"/><circle cx="11" cy="11" r="11" fill="rgba(37,99,235,.25)"/></svg>`;
  return icon("user", svg, 22, 22, 11, 11);
}

export function clusterPinIcon(count: number): google.maps.Icon {
  const size = Math.round(Math.min(72, 48 + Math.log10(Math.max(count, 1)) * 12));
  const label = count >= 1000 ? `${Math.floor(count / 100) / 10}k` : String(count);
  const font = count >= 100 ? 15 : 17;
  const c = size / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${c}" cy="${c}" r="${c - 4}" fill="#1e1b4b" stroke="#f2a900" stroke-width="3"/><text x="${c}" y="${c + font * 0.35}" text-anchor="middle" font-family="sans-serif" font-size="${font}" font-weight="700" fill="#fffdf8">${label}</text></svg>`;
  return icon(`cluster-${size}-${label}`, svg, size, size, c, c);
}
