// One service worker that runs both proxies
importScripts("uv/uv.bundle.js", "uv/uv.config.js", "uv/uv.sw.js");
importScripts("scram/scramjet.all.js");

const uv = new UVServiceWorker();
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

// Use a new version of this file straight away instead of waiting for tabs to close
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  event.respondWith((async () => {
    if (uv.route(event)) return uv.fetch(event);

    // Only touch Scramjet for its own URLs, so it never runs before the page has set it up
    const path = new URL(event.request.url).pathname;
    if (path.startsWith(SITE_BASE + "scramjet/") || path === SITE_BASE + "scram/scramjet.wasm.wasm") {
      await scramjet.loadConfig();
      if (scramjet.route(event)) return scramjet.fetch(event);
    }

    return fetch(event.request);
  })());
});
