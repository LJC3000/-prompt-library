// Prompt Library Service Worker — self-unregister: no caching needed
// Images are proxied via /api/image with Cache-Control headers.
// Old SW instances may have cached stale 504 responses, so we unregister.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.map((k) => caches.delete(k)))
      ),
      // Self-unregister — modern browsers handle image caching via HTTP cache headers
      self.registration.unregister(),
    ])
  );
});
