/* Pandal Hop service worker — caches ONLY the app shell.
 * Never caches map tiles (OSM tile policy forbids offline prefetching), Supabase data,
 * geocoding, or any cross-origin request. */
const VERSION = "v2";
const CACHE = `pandal-hop-shell-${VERSION}`;
const PAGES = ["/", "/offline"];
const STATIC = ["/manifest.webmanifest", "/icon.svg", "/icon-192.png"];

/** Cache a page plus the hashed JS/CSS chunks it references, so it can boot offline. */
async function cachePageWithAssets(cache, path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) return;
  const html = await res.clone().text();
  await cache.put(path, res);
  const assets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]);
  await cache.addAll([...new Set(assets)]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(STATIC);
      for (const p of PAGES) await cachePageWithAssets(cache, p);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("pandal-hop-shell-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // tiles, Supabase, Nominatim: network only
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  // Pages: network first. Offline → the cached copy of that page, otherwise REDIRECT to
  // /offline (serving its HTML under another URL would break Next's hydration).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && PAGES.includes(url.pathname)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(url.pathname);
          if (hit) return hit;
          if (url.pathname !== "/offline" && (await caches.match("/offline"))) {
            return Response.redirect(new URL("/offline", self.location.origin).href, 302);
          }
          return Response.error();
        }),
    );
    return;
  }

  // Hashed build assets are immutable: cache first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
