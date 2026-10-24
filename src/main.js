/**
 * main.js — application bootstrap (v3: "generous data, personal on top").
 *
 * Boot flow:
 *   1. theme + units, service worker
 *   2. location: saved one, else New Delhi as a sensible default — the
 *      dashboard ALWAYS fills immediately; a dismissible welcome card
 *      offers GPS / city search. Nothing is mandatory.
 *   3. loadWeather: Open-Meteo bundle → optional IMD official enrichment
 *      → buildSnapshot → universal dashboard + optional For You rail
 *   4. Mausam Mitra wired to the live snapshot (Z.ai preview / Gemini
 *      with the user's own key / Mausam Core offline engine)
 *   5. auto-refresh every 15 min
 */

import { el, clear } from './utils/dom.js';
import { relativeTime } from './utils/format.js';
import { fetchWeatherBundle } from './api/open-meteo.js';
import { fetchImdBundle } from './api/imd.js';
import { buildSnapshot } from './core/engine.js';
import { store } from './core/storage.js';
import { wireHeader } from './ui/header.js';
import { wireSettings, openSettings } from './ui/settings.js';
import { wireYou, openYou } from './ui/you.js';
import { renderDashboard as renderDashboardUI, updateFreshness } from './ui/dash.js';
import { skeleton, errorCard } from './ui/shared.js';
import { wireChat } from './chat/ui.js';

const REFRESH_MS = 15 * 60 * 1000;
const IMD_TIMEOUT_MS = 9000;
const DEFAULT_LOCATION = { name: 'New Delhi', admin1: 'Delhi', country: 'India', lat: 28.6139, lon: 77.209, isGeo: false };

/* ================= theme ================= */
const mq = window.matchMedia('(prefers-color-scheme: light)');

function applyTheme(pref) {
  const resolved = pref === 'auto' ? (mq.matches ? 'light' : 'dark') : pref;
  document.body.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#f2f4f8' : '#0f1117');
}
mq.addEventListener('change', () => applyTheme(store.theme.get()));
applyTheme(store.theme.get());

/* ================= state ================= */
let currentSnapshot = null;
let currentUnits = store.units.get();
let currentLocation = store.location.get() ?? DEFAULT_LOCATION;
let refreshTimer = null;
let inflight = null;

/* ================= DOM refs ================= */
const $ = (id) => document.getElementById(id);
const dashContent = $('main');

/* ================= header ================= */
const header = wireHeader(
  {
    brandEl: $('brand'),
    cityBtn: $('city-btn'),
    cityLabel: $('city-label'),
    refreshBtn: $('refresh-btn'),
    refreshIcon: $('refresh-icon'),
    offlinePill: $('offline-pill'),
    srcPill: $('src-pill'),
    srcLabel: $('src-label'),
    youBtn: $('you-btn'),
    settingsBtn: $('settings-btn'),
    searchOverlay: $('search-modal'),
    searchInput: $('search-input'),
    searchResults: $('search-results'),
    searchCloseBtn: $('search-close'),
    useLocBtn: $('use-loc-btn'),
  },
  {
    onLocationPick(loc) {
      currentLocation = loc;
      store.location.set(loc);
      header.setLocation(loc);
      store.flags.set('welcomeDismissed', true);
      loadWeather(true);
    },
    onRefresh: () => loadWeather(true),
    onOpenYou: () => openYou(),
    onOpenSettings: () => openSettings(),
  }
);
header.setLocation(currentLocation);

/* ================= settings + you sheets ================= */
wireSettings(
  {
    overlay: $('settings-modal'),
    closeBtn: $('settings-close'),
    aiSection: $('settings-ai'),
    imdSection: $('settings-imd'),
  },
  {
    onUnitsChange: (u) => { currentUnits = u; if (currentSnapshot) renderDashboard(); },
    onThemeChange: applyTheme,
    onImdChange: () => loadWeather(true, { silent: true }),
  }
);

wireUnitsTheme();
function wireUnitsTheme() {
  const apply = () => {
    document.querySelectorAll('[data-units]').forEach((b) => b.classList.toggle('active', b.dataset.units === store.units.get()));
    document.querySelectorAll('[data-theme-btn]').forEach((b) => b.classList.toggle('active', b.dataset.themeBtn === store.theme.get()));
  };
  document.querySelectorAll('[data-units]').forEach((b) =>
    b.addEventListener('click', () => { store.units.set(b.dataset.units); currentUnits = b.dataset.units; apply(); if (currentSnapshot) renderDashboard(); }));
  document.querySelectorAll('[data-theme-btn]').forEach((b) =>
    b.addEventListener('click', () => { store.theme.set(b.dataset.themeBtn); applyTheme(b.dataset.themeBtn); apply(); }));
  apply();
}

wireYou(
  {
    overlay: $('you-modal'),
    closeBtn: $('you-close'),
    body: $('you-body'),
    saveBtn: $('you-save'),
    resetBtn: $('you-reset'),
  },
  { onSaved: () => { renderDashboard(); publishChatState(); } }
);

/* ================= chat ================= */
const chat = wireChat({ onOpenSettings: (section) => openSettings(section) });

/* ================= welcome hint (dismissible, non-blocking) ================= */
function maybeWelcomeHint() {
  if (store.flags.get('welcomeDismissed')) return;
  if (store.location.get()) return; // user already picked a place before
  const hint = el('div.alert.alert-info.dash-alert.welcome-hint', { role: 'status' },
    el('div.alert-title', null, '👋 You\'re looking at New Delhi'),
    el('div.welcome-actions',
      el('button.btn.btn-sm', {
        onclick: () => {
          if ('geolocation' in navigator) {
            hint.querySelector('.welcome-actions').textContent = '📡 Requesting your location…';
            navigator.geolocation.getCurrentPosition(
              async (pos) => {
                const { latitude, longitude } = pos.coords;
                let name = 'My location';
                try {
                  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=10`, { signal: AbortSignal.timeout(8000) });
                  const j = await res.json();
                  const addr = j?.address ?? {};
                  name = addr.city || addr.town || addr.village || addr.county || name;
                } catch { /* keep default name */ }
                currentLocation = { name, admin1: '', country: '', lat: latitude, lon: longitude, isGeo: true };
                store.location.set(currentLocation);
                header.setLocation(currentLocation);
                store.flags.set('welcomeDismissed', true);
                loadWeather(true);
              },
              () => { header.openSearch(); },
              { timeout: 10000 }
            );
          } else header.openSearch();
        },
      }, '📍 Use my location'),
      el('button.btn.btn-sm', { onclick: () => header.openSearch() }, '🔍 Search city'),
      el('button.btn.btn-sm', { onclick: () => { store.flags.set('welcomeDismissed', true); hint.remove(); } }, 'Keep Delhi')
    )
  );
  dashContent.prepend(hint);
}

/* ================= weather loading ================= */

function setSourceBadge(imd) { header.setSource(imd); }

async function enrichWithImd(bundle, signal) {
  if (!store.imdKey.has()) {
    setSourceBadge(null);
    return bundle;
  }
  const relay = new AbortController();
  const onOuter = () => relay.abort();
  signal?.addEventListener('abort', onOuter, { once: true });
  const timer = setTimeout(() => relay.abort(new DOMException('IMD timeout', 'TimeoutError')), IMD_TIMEOUT_MS);
  try {
    const imd = await fetchImdBundle(bundle.location.lat, bundle.location.lon, relay.signal);
    bundle.imd = imd;
    setSourceBadge(imd);
    return bundle;
  } catch {
    setSourceBadge(null);
    return bundle; // IMD failure never blocks the app
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuter);
  }
}

async function loadWeather(force = false, { silent = false } = {}) {
  header.setOffline(!navigator.onLine);
  if (inflight) inflight.abort();
  const controller = new AbortController();
  inflight = controller;

  const cached = store.bundle.get(currentLocation.lat, currentLocation.lon);
  const cacheFresh = cached && Date.now() - cached.fetchedAt < REFRESH_MS;

  if (cached && cacheFresh && !force) {
    try {
      currentSnapshot = buildSnapshot(cached);
      setSourceBadge(cached.imd);
      renderDashboard();
      if (inflight === controller) inflight = null;
      publishChatState();
      return;
    } catch { /* unusable cache — fall through */ }
  }

  if (!silent) {
    clear(dashContent).appendChild(skeleton());
    header.setRefreshing(true);
  }

  if (cached && !currentSnapshot) {
    try {
      currentSnapshot = buildSnapshot(cached);
      setSourceBadge(cached.imd);
      renderDashboard();
    } catch { currentSnapshot = null; }
  }

  try {
    let bundle = await fetchWeatherBundle(currentLocation.lat, currentLocation.lon, controller.signal);
    if (controller.signal.aborted) return;
    bundle = await enrichWithImd(bundle, controller.signal);
    if (controller.signal.aborted) return;
    store.bundle.set(currentLocation.lat, currentLocation.lon, bundle);
    currentSnapshot = buildSnapshot(bundle);
    header.setOffline(false);
    renderDashboard();
    maybeWelcomeHint();
  } catch (err) {
    if (controller.signal.aborted || err.name === 'AbortError') return;
    header.setOffline(true);
    if (!currentSnapshot && cached) {
      try {
        currentSnapshot = buildSnapshot(cached);
        renderDashboard();
        return;
      } catch { currentSnapshot = null; }
    }
    if (!currentSnapshot) {
      clear(dashContent).appendChild(errorCard(err.message, () => loadWeather(true)));
    }
  } finally {
    if (inflight === controller) inflight = null;
    if (!controller.signal.aborted) {
      header.setRefreshing(false);
      publishChatState();
    }
  }
}

/* ================= dashboard render ================= */

function renderDashboard() {
  if (!currentSnapshot) return;
  try {
    renderDashboardInto();
  } catch (err) {
    console.error('Render failed:', err);
    clear(dashContent).appendChild(errorCard('The dashboard hit an unexpected error.', renderDashboard));
    return;
  }
  updateFreshness(currentSnapshot);
  publishChatState();
}

function renderDashboardInto() {
  renderDashboardUI(dashContent, currentSnapshot, currentUnits, {
    location: currentLocation,
    openYou,
    rerender: renderDashboard,
  });
}

/* ================= state bridge ================= */

function publishChatState() {
  window.__mausamState = {
    snapshot: currentSnapshot,
    you: store.you.get(),
    units: currentUnits,
    location: currentLocation,
    imd: currentSnapshot?.bundle?.imd ?? null,
    loading: Boolean(inflight),
    online: navigator.onLine,
  };
}

/* ================= connectivity ================= */
window.addEventListener('offline', () => header.setOffline(true));
window.addEventListener('online', () => {
  header.setOffline(false);
  loadWeather(true);
});

/* ================= service worker ================= */
const isSecureHost = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && isSecureHost) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW registration failed:', err));
}

/* ================= boot ================= */
async function boot() {
  store.flags.set('bootedOnce', true);

  renderDashboard(); // instant paint (skeleton or cache)
  loadWeather(false, { silent: false });

  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') {
      loadWeather(true, { silent: true });
    }
  }, REFRESH_MS);

  setInterval(() => {
    if (currentSnapshot) updateFreshness(currentSnapshot);
  }, 30_000);
}

boot();
