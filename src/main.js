/**
 * main.js — application bootstrap & orchestration.
 *
 * Flow:
 *   1. apply stored theme + units
 *   2. register service worker
 *   3. resolve location (stored → default Ghaziabad)
 *   4. resolve persona (stored → selection screen)
 *   5. fetch bundle (cache-first paint) → buildSnapshot → render dashboard
 *   6. auto-refresh every 15 min
 */

import { el, clear } from './utils/dom.js';
import { relativeTime, temp } from './utils/format.js';
import { fetchWeatherBundle } from './api/open-meteo.js';
import { buildSnapshot } from './core/engine.js';
import { store } from './core/storage.js';
import { PERSONAS, PERSONA_IDS } from './core/personas.js';
import { renderPersonaGrid, wireSwitchModal } from './ui/persona-picker.js';
import { wireHeader } from './ui/header.js';
import { skeleton, errorCard, offlineCard, footerNote } from './ui/shared.js';
import { renderFitness } from './ui/dashboards/fitness.js';
import { renderCommuter } from './ui/dashboards/commuter.js';
import { renderAgriculture } from './ui/dashboards/agriculture.js';
import { renderTraveler } from './ui/dashboards/traveler.js';
import { renderEvent } from './ui/dashboards/event.js';

const DEFAULT_LOCATION = {
  name: 'Ghaziabad',
  admin1: 'Uttar Pradesh',
  country: 'India',
  lat: 28.6692,
  lon: 77.4538,
  isGeo: false,
};
const REFRESH_MS = 15 * 60 * 1000;

const RENDERERS = { fitness: renderFitness, commuter: renderCommuter, agriculture: renderAgriculture, traveler: renderTraveler, event: renderEvent };

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
let currentPersona = null;
let currentSnapshot = null;
let currentUnits = store.units.get();
let currentLocation = store.location.get() ?? DEFAULT_LOCATION;
let refreshTimer = null;
let inflight = null;

/* ================= DOM refs ================= */
const $ = (id) => document.getElementById(id);
const screens = { persona: $('persona-screen'), dashboard: $('dashboard-screen') };
const dashContent = $('main');
const updatedStamp = $('updated-stamp');

/* ================= header ================= */
const header = wireHeader(
  {
    brandEl: $('brand'),
    personaBadgeEl: $('persona-badge'),
    cityBtn: $('city-btn'),
    cityLabel: $('city-label'),
    refreshBtn: $('refresh-btn'),
    refreshIcon: $('refresh-icon'),
    settingsBtn: $('settings-btn'),
    settingsMenu: $('settings-menu'),
    offlinePill: $('offline-pill'),
    searchOverlay: $('search-modal'),
    searchInput: $('search-input'),
    searchResults: $('search-results'),
    searchCloseBtn: $('search-close'),
  },
  {
    onLocationPick(loc) {
      currentLocation = loc;
      store.location.set(loc);
      header.setLocation(loc);
      loadWeather(true);
    },
    onRefresh: () => loadWeather(true),
    onUnitsChange(u) {
      currentUnits = u;
      if (currentSnapshot) renderDashboard();
    },
    onThemeChange: applyTheme,
    onSwitchProfile: () => switchModal.open(),
  }
);
header.applyUnits(currentUnits);
header.applyTheme(store.theme.get());

/* ================= persona flows ================= */
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function selectPersona(id, { silent = false } = {}) {
  if (!PERSONAS[id]) return;
  currentPersona = id;
  store.persona.set(id);
  document.body.dataset.persona = id;
  header.setPersona(id);
  showScreen('dashboard');
  renderDashboard();
  loadWeather(false, { silent });
}

const switchModal = wireSwitchModal(
  { overlay: $('switch-modal'), grid: $('modal-persona-grid'), closeBtn: $('switch-close') },
  (id) => {
    switchModal.close?.();
    selectPersona(id);
  }
);

/* persona selection screen */
renderPersonaGrid($('persona-grid'), (id) => selectPersona(id));

/* logo icon */
$('logo-title').prepend(el('img', { src: 'icons/favicon.svg', alt: '' }));

/* ================= weather loading ================= */
function setRefreshing(on) {
  header.setRefreshing(on);
}

async function loadWeather(force = false, { silent = false } = {}) {
  if (inflight) inflight.abort();
  const controller = new AbortController();
  inflight = controller;

  const cached = store.bundle.get(currentLocation.lat, currentLocation.lon);
  const cacheFresh = cached && Date.now() - cached.fetchedAt < REFRESH_MS;

  // Fast path: fresh cache + not forced → paint from cache and stop.
  if (cached && cacheFresh && !force) {
    try {
      currentSnapshot = buildSnapshot(cached);
      header.setLocation(currentLocation);
      header.setOffline(false);
      renderDashboard();
      if (!silent) setRefreshing(false);
      return;
    } catch {
      /* unusable cache — fall through to the network path */
    }
  }

  if (!silent) {
    clear(dashContent).appendChild(skeleton());
    setRefreshing(true);
  }

  // Instant paint from stale cache while the network round-trip runs.
  if (cached && !currentSnapshot) {
    try {
      currentSnapshot = buildSnapshot(cached);
      header.setLocation(currentLocation);
      renderDashboard();
    } catch {
      currentSnapshot = null;
    }
  }

  try {
    const bundle = await fetchWeatherBundle(currentLocation.lat, currentLocation.lon, controller.signal);
    if (controller.signal.aborted) return;
    store.bundle.set(currentLocation.lat, currentLocation.lon, bundle);
    currentSnapshot = buildSnapshot(bundle);
    header.setLocation(currentLocation);
    header.setOffline(false);
    renderDashboard();
  } catch (err) {
    if (controller.signal.aborted || err.name === 'AbortError') return;
    if (!currentSnapshot && cached) {
      // offline fallback: last good bundle for this location
      try {
        currentSnapshot = buildSnapshot(cached);
        renderDashboard();
        header.setOffline(true);
        return;
      } catch {
        currentSnapshot = null;
      }
    }
    if (!currentSnapshot) {
      clear(dashContent).appendChild(errorCard(err.message, () => loadWeather(true)));
    }
  } finally {
    if (!controller.signal.aborted) setRefreshing(false);
  }
}

/* ================= dashboard render ================= */
function renderDashboard() {
  if (!currentSnapshot || !currentPersona) return;
  currentSnapshot.locationLabel = currentLocation.name;
  clear(dashContent);
  try {
    RENDERERS[currentPersona](dashContent, currentSnapshot, currentUnits, {
      openSearch: () => header.openSearch(),
      rerender: renderDashboard,
    });
  } catch (err) {
    console.error('Render failed:', err);
    clear(dashContent).appendChild(errorCard('The dashboard hit an unexpected error.', renderDashboard));
    return;
  }
  updatedStamp.textContent = `Updated ${relativeTime(currentSnapshot.fetchedAt)} · ${currentLocation.name}` +
    (currentUnits === 'imperial' ? ' · °F' : ' · °C');
}

/* ================= connectivity ================= */
window.addEventListener('offline', () => header.setOffline(true));
window.addEventListener('online', () => {
  header.setOffline(false);
  loadWeather(true);
});

/* ================= units change keeps cache paint ================= */
// (re-render handled through header callback)

/* ================= boot ================= */
async function boot() {
  // deep link: ?persona=fitness (used by PWA shortcuts)
  const params = new URLSearchParams(location.search);
  const linkPersona = params.get('persona');

  header.setLocation(currentLocation);
  showScreen('persona');

  const saved = store.persona.get();
  const target = PERSONA_IDS.includes(linkPersona) ? linkPersona : saved;

  if (target && PERSONAS[target]) {
    selectPersona(target);
  } else {
    showScreen('persona');
  }

  // service worker (secure contexts: https, localhost, 127.0.0.1)
  const isSecureHost = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && isSecureHost) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW registration failed:', err));
  }

  // periodic refresh
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') loadWeather(true, { silent: true });
  }, REFRESH_MS);

  // refresh "updated X ago" stamp
  setInterval(() => {
    if (currentSnapshot && screens.dashboard.classList.contains('active')) {
      updatedStamp.textContent = `Updated ${relativeTime(currentSnapshot.fetchedAt)} · ${currentLocation.name}` +
        (currentUnits === 'imperial' ? ' · °F' : ' · °C');
    }
  }, 30_000);
}

boot();
