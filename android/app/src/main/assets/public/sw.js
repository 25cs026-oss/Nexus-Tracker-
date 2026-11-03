const CACHE_NAME = 'nexus-tracker-pwa-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('PWA: Some static assets skipped precache', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Network-first for dynamic API/Firestore/Tiles, Cache-first for local static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass cache for Firestore / Firebase Realtime / WebSockets / Chrome extensions
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.protocol.startsWith('chrome-extension') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Dedicated Offline Map Tiles Interceptor (Serves downloaded 10km offline map immediately)
  const isTileRequest = 
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('basemaps.cartocdn.com') ||
    url.hostname.includes('arcgisonline.com');

  if (isTileRequest) {
    event.respondWith(
      (async () => {
        // 1. Check offline tile cache first (0ms latency, 100% offline support)
        const offlineCache = await caches.open('nexus-offline-map-tiles');
        let cached = await offlineCache.match(event.request);
        if (!cached) {
          cached = await caches.match(event.request);
        }
        if (cached) {
          return cached;
        }

        // 2. Not in cache: fetch from network
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.status === 200) {
            offlineCache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (fetchErr) {
          // 3. Network failed: Try matching fallback without subdomain
          const fallbackUrl = `https://tile.openstreetmap.org${url.pathname}`;
          const fallbackCached = await offlineCache.match(fallbackUrl);
          if (fallbackCached) {
            return fallbackCached;
          }
          // Fallback: 1x1 transparent PNG so offline map never displays broken image icons
          return new Response(
            new Uint8Array([
              0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
              0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
              0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
              0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
              0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
              0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
            ]),
            {
              status: 200,
              headers: { 'Content-Type': 'image/png' }
            }
          );
        }
      })()
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (url.origin === self.location.origin || url.hostname.includes('tile.openstreetmap.org'))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          return caches.match('/');
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      })
  );
});

// Handle persistent notification click in mobile notification drawer
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(event.notification.data?.url || '/');
      }
    })
  );
});

// Web Push event (Emergency SOS alerts when app is closed / screen off)
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: '🚨 EMERGENCY SOS ALERT!',
      body: event.data ? event.data.text() : 'A family member triggered an emergency SOS!'
    };
  }

  const title = payload.title || '🚨 EMERGENCY SOS ALERT!';
  const options = {
    body: payload.body || 'A family member pressed the SOS button! Tap to view live location.',
    icon: '/pwa-192x192.png',
    badge: '/icon.svg',
    tag: 'nexus-emergency-sos',
    requireInteraction: true,
    renotify: true,
    vibrate: [500, 200, 500, 200, 500, 200, 800],
    data: { url: payload.url || '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Background Sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'nexus-location-sync') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SYNC_LOCATION' });
        });
      })
    );
  }
});

// Periodic Background Sync (runs in background on Android even when app is idle)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'nexus-periodic-location') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'PERIODIC_SYNC_LOCATION' });
        });
      })
    );
  }
});

// Message listener from foreground pages
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_PERSISTENT_NOTIFICATION') {
    self.registration.showNotification('Nexus Family Tracker', {
      body: '🟢 Live Background Location Active (10s intervals)',
      icon: '/pwa-192x192.png',
      badge: '/icon.svg',
      tag: 'nexus-live-status',
      ongoing: true,
      silent: true,
      requireInteraction: true,
      data: { url: event.data?.url || '/' }
    });
  }
});
