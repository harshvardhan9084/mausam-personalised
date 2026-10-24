/* ================================================================
   sw.js — Mausam service worker
   Strategy:
   - App shell (same-origin): stale-while-revalidate, precached.
   - Open-Meteo APIs: network-first with cached fallback (offline).
   - Navigation fallback: index.html (SPA safety net).
================================================================ */

const VERSION = 'v1.0.0';
const SHELL_CACHE = `mausam-shell-${VERSION}`;
const DATA_CACHE = `mausam-data-${VERSION}`;
const API_HOSTS = ['api.open-meteo.com', 'air-quality-api.open-meteo.com', 'geocoding-api.open-meteo.com'];

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/favicon.svg',
  './icons/icon-64.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './src/main.js',
  './src/styles/tokens.css',
  './src/styles/base.css',
  './src/styles/layout.css',
  './src/styles/components.css',
  './src/api/open-meteo.js',
  './src/api/wmo.js',
  './src/core/aqi-cpcb.js',
  './src/core/engine.js',
  './src/core/personas.js',
  './src/core/scoring.js',
  './src/core/storage.js',
  './src/ui/persona-picker.js',
  './src/ui/header.js',
  './src/ui/shared.js',
  './src/ui/dashboards/fitness.js',
  './src/ui/dashboards/commuter.js',
  './src/ui/dashboards/agriculture.js',
  './src/ui/dashboards/traveler.js',
  './src/ui/dashboards/event.js',
  './src/utils/dom.js',
  './src/utils/format.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // --- Open-Meteo APIs: network-first, fall back to last good response ---
  if (API_HOSTS.includes(url.hostname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(DATA_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) =>
              cached ||
              new Response(JSON.stringify({ error: 'offline' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              })
          )
        )
    );
    return;
  }

  // --- Same-origin: stale-while-revalidate ---
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
