const CACHE_NAME = 'photobooth-shell-v1';
const SHELL_URLS = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

// Network-first, falling back to the cached app shell when offline. Camera
// capture and the Firebase sync both need a live connection anyway, so this
// isn't meant to run the booth offline — just to avoid a blank/broken tab
// and to make the app installable as a proper home-screen app.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(event.request, copy))
          .catch(() => undefined);
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./')))
  );
});
