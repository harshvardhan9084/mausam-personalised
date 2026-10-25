/**
 * main.js — application bootstrap (v0.5: a five-page product).
 *
 * Pages: Home (generous feed) · Radar (live rain map) · Mitra (AI chat)
 *        You (volatile profile) · Settings (full controls)
 * Boot:  theme/accent/lang → router → header → cached paint → live load
 *        (Open-Meteo forecast+air, then optional flood/marine/climate in
 *        parallel — enhancements only, failures never block).
 * Data saver: no auto-refresh, optional APIs and radar only on demand.
 */

import { el, clear } from './utils/dom.js';
import { relativeTime } from './utils/format.js';
import { fetchWeatherBundle } from './api/open-meteo.js';
import { fetchImdBundle } from './api/imd.js';
import { fetchFloodBundle, fetchMarineBundle, fetchClimateDelta } from './api/extras.js';
import { buildSnapshot } from './core/engine.js';
import { store } from './core/storage.js';
import { setLang, t } from './core/i18n.js';
import { getProfile } from './core/profile.js';
import { computeAlerts } from './core/insights.js';
import { wireHeader } from './ui/header.js';
import { wireSettingsPage, renderSettings } from './ui/settings.js';
import { wireYouPage, renderYou } from './ui/you.js';
import { wireMitraPage, showMitra } from './ui/mitra.js';
import { wireRadarPage, showRadar, updateRadarLocation, onRadarThemeChange } from './ui/radar.js';
import { rememberPlace } from './ui/places.js';
import { renderDashboard as renderDashboardUI, updateFreshness } from './ui/dash.js';
import { skeleton, errorCard } from './ui/shared.js';

const REFRESH_MS = 15 * 60 * 1000;
const IMD_TIMEOUT_MS = 9000;
const DEFAULT_LOCATION = { name: 'New Delhi', admin1: 'Delhi', country: 'India', lat: 28.6139, lon: 77.209, isGeo: false };

/* ================= theme + accent + lang ================= */
const mq = window.matchMedia('(prefers-color-scheme: light)');

function applyTheme(pref) {
  const resolved = pref === 'auto' ? (mq.matches ? 'light' : 'dark') : pref;
  document.body.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#f2f4f8' : '#0f1117');
  onRadarThemeChange();
}

function applyAccent(id) {
  if (id) document.body.dataset.accent = id;
  else delete document.body.dataset.accent;
}

mq.addEventListener('change', () => applyTheme(store.theme.get()));
setLang(store.lang.get());
applyTheme(store.theme.get());
applyAccent(store.accent.get());
document.documentElement.lang = store.lang.get() === 'hi' ? 'hi' : 'en';

/** Swap text of static chrome nodes (nav labels, pills, modal titles). */
function applyStaticI18n() {
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
}
applyStaticI18n();

/* ================= state ================= */
let currentSnapshot = null;
let currentUnits = store.units.get();
let currentLocation = store.location.get() ?? DEFAULT_LOCATION;
let refreshTimer = null;
let inflight = null;

/* ================= DOM refs ================= */
const $ = (id) => document.getElementById(id);
const homeScroll = $('home-scroll');

/* ================= router ================= */
const PAGES = ['home', 'radar', 'mitra', 'you', 'settings'];
let currentPage = 'home';

function go(page) {
  if (!PAGES.includes(page)) page = 'home';
  currentPage = page;
  for (const p of PAGES) {
    $(`page-${p}`)?.classList.toggle('active', p === page);
    $(`tab-${p}`)?.classList.toggle('active', p === page);
    $(`tab-${p}`)?.setAttribute('aria-current', p === page ? 'page' : 'false');
  }
  window.scrollTo({ top: 0 });
  if (page === 'radar') showRadar();
  if (page === 'mitra') showMitra();
  if (page === 'you') renderYou();
  if (page === 'settings') renderSettings();
}

for (const p of PAGES) {
  $(`tab-${p}`)?.addEventListener('click', () => go(p));
}
export function navigate(page) { go(page); }

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
    searchOverlay: $('search-modal'),
    searchInput: $('search-input'),
    searchResults: $('search-results'),
    searchCloseBtn: $('search-close'),
    useLocBtn: $('use-loc-btn'),
  },
  {
    onLocationPick(loc) { applyLocation(loc); },
    onRefresh: () => loadWeather(true),
  },
);
header.setLocation(currentLocation);

/** One place-selection path for search, GPS and the places rail. */
function applyLocation(loc) {
  currentLocation = loc;
  store.location.set(loc);
  rememberPlace(loc);
  header.setLocation(loc);
  store.flags.set('welcomeDismissed', true);
  updateRadarLocation(loc);
  loadWeather(true);
}

/* ================= pages wiring ================= */
wireYouPage($('you-mount'), {
  onSaved: () => {
    renderDashboard();
    publishChatState();
  },
});

wireSettingsPage($('settings-mount'), {
  onUnitsChange: (u) => { currentUnits = u; if (currentSnapshot) renderDashboard(); },
  onThemeChange: (th) => { applyTheme(th); },
  onAccentChange: (id) => applyAccent(id),
  onClockChange: () => { if (currentSnapshot) renderDashboard(); },
  onLangChange: () => {
    document.documentElement.lang = store.lang.get() === 'hi' ? 'hi' : 'en';
    applyStaticI18n();
    if (currentSnapshot) renderDashboard();
    header.setLocation(currentLocation);
  },
  onImdChange: () => loadWeather(true, { silent: true }),
  onNotifChange: () => runNotifCheck(true),
  onDataSaverChange: () => { /* takes effect on next loads */ },
});

wireMitraPage($('page-mitra'), { openSettings: () => go('settings') });

wireRadarPage($('page-radar'), { getLocation: () => currentLocation });

/* ================= chat state bridge ================= */
function publishChatState() {
  window.__mausamState = {
    snapshot: currentSnapshot,
    profile: getProfile(),
    units: currentUnits,
    location: currentLocation,
    imd: currentSnapshot?.bundle?.imd ?? null,
    loading: Boolean(inflight),
    online: navigator.onLine,
  };
}

/* ================= optional extras (never block) ================= */

async function loadExtras(lat, lon, signal) {
  if (store.dataSaver.get()) return null;
  const [flood, marine, climate] = await Promise.all([
    fetchFloodBundle(lat, lon, signal),
    fetchMarineBundle(lat, lon, signal),
    fetchClimateDelta(lat, lon, signal),
  ]);
  return { flood, marine, climate };
}

/* ================= IMD enrichment (optional, never blocks) ================= */

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
    return bundle;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuter);
  }
}

/* ================= weather loading ================= */

function setSourceBadge(imd) { header.setSource(imd); }

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
    clear(homeScroll).appendChild(skeleton());
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
    bundle.extras = await loadExtras(currentLocation.lat, currentLocation.lon, controller.signal);
    if (controller.signal.aborted) return;
    bundle = await enrichWithImd(bundle, controller.signal);
    if (controller.signal.aborted) return;
    store.bundle.set(currentLocation.lat, currentLocation.lon, bundle);
    currentSnapshot = buildSnapshot(bundle);
    header.setOffline(false);
    renderDashboard();
    maybeWelcomeHint();
    runNotifCheck();
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
      clear(homeScroll).appendChild(errorCard(err.message, () => loadWeather(true)));
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
    renderDashboardUI(homeScroll, currentSnapshot, currentUnits, {
      location: currentLocation,
      openYou: () => go('you'),
      rerender: renderDashboard,
      pickLocation: applyLocation,
      openSearch: () => header.openSearch(),
    });
  } catch (err) {
    console.error('Render failed:', err);
    clear(homeScroll).appendChild(errorCard('The dashboard hit an unexpected error.', renderDashboard));
    return;
  }
  updateFreshness(currentSnapshot);
  publishChatState();
}

/* ================= welcome hint (first run, non-blocking) ================= */

function maybeWelcomeHint() {
  if (store.flags.get('welcomeDismissed')) return;
  if (store.location.get()) return;
  const hint = el('div.alert.alert-info.dash-alert.welcome-hint', { role: 'status' },
    el('div.alert-title', null, `👋 ${t('welcome_hi', { city: currentLocation.name })}`),
    el('div.welcome-actions',
      el('button.btn.btn-sm', { onclick: () => header.openSearch() }, '🔍'),
      el('button.btn.btn-sm', { onclick: () => { store.flags.set('welcomeDismissed', true); hint.remove(); } }, t('keep_city', { city: currentLocation.name })),
    ),
  );
  homeScroll.prepend(hint);
}

/* ================= notifications (while the app is open) ================= */

let lastNotifKey = null;

function runNotifCheck(force = false) {
  const cfg = store.notif.get() ?? { on: false };
  if (!cfg.on || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (!currentSnapshot) return;
  const alerts = computeAlerts(currentSnapshot);
  const top = alerts?.[0];
  if (!top) return;
  const key = `${top.title}`;
  if (!force && key === lastNotifKey) return;
  // only fire when the alert is fresh (≤1h old check is implicit via refresh cadence)
  if (Date.now() - (store.flags.get('lastNotifAt') ?? 0) < 60 * 60 * 1000 && !force) return;
  lastNotifKey = key;
  store.flags.set('lastNotifAt', Date.now());
  try {
    new Notification(`Mausam — ${top.title}`, { body: top.text, icon: 'icons/icon-192.png', tag: 'mausam-alert' });
  } catch { /* some browsers require SW registration */ }
}

setInterval(() => {
  if (document.visibilityState === 'visible') runNotifCheck();
}, 20 * 60 * 1000);

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

  go('home');
  renderDashboard(); // instant paint (skeleton or cache)
  loadWeather(false, { silent: false });

  if (!store.dataSaver.get()) {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') loadWeather(true, { silent: true });
    }, REFRESH_MS);
  }

  setInterval(() => {
    if (currentSnapshot) updateFreshness(currentSnapshot);
  }, 30_000);
}

boot();
