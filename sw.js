/* ================================================================
   sw.js — Mausam service worker
   Strategy:
   - App shell (same-origin): stale-while-revalidate, precached.
   - Open-Meteo / Nominatim APIs: network-first with cached fallback.
   - Navigation fallback: index.html (SPA safety net).
   NOTE: /api/chat & /api/health (Z.ai preview) are never intercepted —
   the provider probe must reflect the real server.
================================================================ */

const VERSION = 'v0.8.14';
const SHELL_CACHE = `mausam-shell-${VERSION}`;
const DATA_CACHE = `mausam-data-${VERSION}`;
const API_HOSTS = [
  'api.open-meteo.com',
  'air-quality-api.open-meteo.com',
  'geocoding-api.open-meteo.com',
  'flood-api.open-meteo.com',
  'marine-api.open-meteo.com',
  'archive-api.open-meteo.com',
  'api.bigdatacloud.net',
  'nominatim.openstreetmap.org',
  'generativelanguage.googleapis.com', // Gemini: network-only, no caching of auth'd calls
];

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
  './src/styles/plus.css',
  './src/styles/dash.css',
  './src/styles/chat.css',
  './src/styles/rich.css',
  './src/styles/sheets.css',
  './src/styles/app.css',
  './src/styles/sky.css',
  './src/api/open-meteo.js',
  './src/api/extras.js',
  './src/api/imd.js',
  './src/api/wmo.js',
  './src/core/aqi-cpcb.js',
  './src/core/engine.js',
  './src/core/i18n.js',
  './src/core/insights.js',
  './src/core/profile.js',
  './src/core/scoring.js',
  './src/core/storage.js',
  './src/ui/header.js',
  './src/ui/shared.js',
  './src/ui/icons.js',
  './src/ui/dash.js',
  './src/ui/places.js',
  './src/ui/settings.js',
  './src/ui/you.js',
  './src/ui/mitra.js',
  './src/ui/crops.js',
  './src/ui/explore.js',
  './src/ai/contract.js',
  './src/ai/render.js',
  './src/ai/prompt.js',
  './src/ai/tools.js',
  './src/ai/gemini.js',
  './src/ai/zai.js',
  './src/ai/offline.js',
  './src/ai/client.js',
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

self.addEventListener('message', (event) => {
  if (event.data?.type === 'MAUSAM_VERSION' && event.ports?.[0]) {
    event.ports[0].postMessage({ version: VERSION });
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never touch the preview AI endpoints — probes must be honest.
  if (url.pathname.startsWith('/api/')) return;

  // --- External APIs: network-first, fall back to last good response ---
  if (API_HOSTS.includes(url.hostname)) {
    // Gemini calls are auth'd + personal: no cache fallback.
    if (url.hostname === 'generativelanguage.googleapis.com') return;
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
