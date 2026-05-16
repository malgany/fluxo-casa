const CACHE_NAME = "fluxo-casa-v5";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    cacheAppShell().then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.searchParams.has("app-update-check")) {
    event.respondWith(fetch(new Request(request, { cache: "reload" })));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(networkFirstAsset(request));
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response.ok) await cache.put("/", response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match("/")) || (await cache.match("/index.html"));
  }
}

async function networkFirstAsset(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(new Request(request, { cache: "reload" }));
    if (response.ok) await cache.put(request, response.clone());

    return response;
  } catch {
    return (await cache.match(request)) || new Response("", { status: 504, statusText: "Offline" });
  }
}

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_SHELL);

  try {
    const response = await fetch("/", { cache: "reload" });
    if (!response.ok) return;

    await cache.put("/", response.clone());
    await cache.put("/index.html", response.clone());

    const html = await response.text();
    const assetUrls = Array.from(html.matchAll(/(?:src|href)="([^"]+)"/g))
      .map((match) => match[1])
      .filter((url) => url.startsWith("/") && !url.startsWith("/api/"));

    await cache.addAll([...new Set(assetUrls)]);
  } catch {
    // The initial static cache above is enough for the next successful online load to refresh assets.
  }
}
