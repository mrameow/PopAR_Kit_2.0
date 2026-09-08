
const CACHE_NAME = 'popar-kit-cache-v39';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './words.json',
  './manifest.json',
  './icon/hello-icon-144.png',
  './icon/hello-icon-192.png',
  './icon/hello-icon-512.png',
  './fonts/Baloo2-Bold.woff2',
  './fonts/Baloo2-SemiBold.woff2',
  './mediapipe/vision_bundle.mjs',
  './mediapipe/wasm/vision_wasm_internal.js',
  './mediapipe/wasm/vision_wasm_internal.wasm',
  './models/hand_landmarker.task',
  './models/pose_landmarker_lite.task'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheWhitelist.indexOf(cacheName) === -1) {
              return caches.delete(cacheName);
            }
          })
        );
      }).then(() => self.clients.claim())
    );
  });

self.addEventListener('fetch', event => {
  // Ignore non-GET requests and API calls to OpenSheet
  if (event.request.method !== 'GET' || event.request.url.includes('opensheet.elk.sh')) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(response => {
        // Return cached response if it exists
        if (response) {
          return response;
        }

        // Otherwise, fetch from the network and handle failures
        return fetch(event.request).then(networkResponse => {
          // If the fetch is successful, clone it, cache it, and return it.
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            cache.put(event.request, responseToCache);
          }
          return networkResponse;
        }).catch(() => {
          // If the network fetch fails, provide a specific response based on the request type.
          if (event.request.url.endsWith('words.json')) {
            // For the words.json file, return a JSON error response.
            // This is what the application logic expects.
            return new Response(
              JSON.stringify({ error: 'offline' }),
              { headers: { 'Content-Type': 'application/json' }, status: 503 }
            );
          }
          // For any other file type (e.g., audio, images), return a generic
          // error response. This prevents the browser from logging a content-type
          // mismatch error for media elements.
          return new Response('', { status: 503, statusText: 'Service Unavailable' });
        });
      });
    })
  );
});
