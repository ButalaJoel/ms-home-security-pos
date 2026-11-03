/*
 * Service worker for MS Home Security POS.
 * - Makes the app installable ("Add to Home Screen").
 * - Opens fast: the app shell and hashed assets are cached.
 * - Never caches /api requests: sales, stock and money always come live
 *   from the server.
 * Bump VERSION to force every phone to drop old cached files.
 */
const VERSION = "v2";
const CACHE = `ms-pos-${VERSION}`;
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/ms-home-security-logo.png"];

// Save the app shell AND the build files it references (the hashed
// /assets/*.js and *.css), so the till opens with no internet even on a
// device that has only visited once.
async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL);
  const page = await cache.match("/");
  if (!page) return;
  const html = await page.clone().text();
  const assets = Array.from(new Set(html.match(/\/assets\/[^"'\s)]+/g) || []));
  await cache.addAll(assets);
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("ms-pos-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Pages: try the network first so updates show immediately; fall back to
  // the cached app shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(async (cache) => {
              await cache.put("/", copy.clone());
              // Keep the files the latest version of the app needs.
              const html = await copy.text();
              const assets = Array.from(new Set(html.match(/\/assets\/[^"'\s)]+/g) || []));
              await Promise.all(assets.map((asset) => cache.match(asset).then((hit) => hit || cache.add(asset).catch(() => undefined))));
            });
          }
          return response;
        })
        .catch(() => caches.match("/").then((cached) => cached || Response.error())),
    );
    return;
  }

  // Hashed build files never change: serve from cache when available.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Everything else (icons, logo): cached copy now, refresh in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
