self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Passive fetch listener to meet PWA installability requirements
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      // Offline fallback can be added here if needed
      return new Response("Offline mode active.");
    })
  );
});
