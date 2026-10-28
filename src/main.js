/**
 * main.js — application bootstrap (v0.6: a five-page product).
 *
 * Pages: Home (generous feed) · Crops (crop calendar engine) · Mitra (AI chat)
 *        You (volatile profile) · Settings (full controls)
 * Boot:  theme/accent/lang → router → header → cached paint → live load
 *        (Open-Meteo forecast+air, then optional flood/marine/climate in
 *        parallel — enhancements only, failures never block).
 * Data saver: no auto-refresh, optional APIs only on demand.
 */

import { el, clear, wireModalHistory } from './utils/dom.js';
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
import { wireMitraPage, showMitra, focusMitraInput } from './ui/mitra.js';
import { wireCropsPage, showCrops } from './ui/crops.js';
import { rememberPlace } from './ui/places.js';
import { openCompare, openJourney } from './ui/explore.js';
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

/* ================= chrome metrics → CSS vars =================
 * The header wraps to two rows on small phones and the bottom nav's real
 * height drifts from any static token (safe areas, font scaling). Measure
 * both and publish --header-h / --nav-h so every rule that offsets by the
 * chrome — #page-mitra height, .pages bottom padding, FAB offsets and the
 * pull-to-refresh indicator — stays pixel-exact on every device.
 */
function publishChromeMetrics() {
  const root = document.documentElement;
  const header = document.querySelector('.app-header');
  const nav = document.querySelector('.tab-nav');
  if (header) root.style.setProperty('--header-h', `${Math.round(header.getBoundingClientRect().height)}px`);
  if (nav) root.style.setProperty('--nav-h', `${Math.round(nav.getBoundingClientRect().height)}px`);
}
publishChromeMetrics();
const chromeRO = new ResizeObserver(() => publishChromeMetrics());
document.querySelector('.app-header') && chromeRO.observe(document.querySelector('.app-header'));
document.querySelector('.tab-nav') && chromeRO.observe(document.querySelector('.tab-nav'));
window.addEventListener('resize', publishChromeMetrics);
window.addEventListener('load', publishChromeMetrics);

/* ================= modal history (Android back closes modals) ================= */
wireModalHistory();

/* ================= router ================= */
const PAGES = ['home', 'crops', 'mitra', 'you', 'settings'];
const PAGE_TITLE = {
  home: 'Mausam',
  crops: 'Crops · Mausam',
  mitra: 'Mitra · Mausam',
  you: 'You · Mausam',
  settings: 'Settings · Mausam',
};
let currentPage = 'home';

/* Sliding tab pill (v0.8.10): one element morphs behind the active tab so
   switching feels physical instead of the highlight teleporting. Widths
   differ per label (i18n), so it is measured, never assumed; re-measured
   on resize and after fonts load. Respects reduced motion via CSS only
   transitioning transform (kept instant-safe under prefers-reduced-motion). */
function moveTabPill(instant = false) {
  const btn = document.querySelector('.tab-btn.active');
  const pill = document.querySelector('.tab-pill');
  const nav = document.querySelector('.tab-nav');
  if (!btn || !pill || !nav) return;
  const nb = nav.getBoundingClientRect();
  const bb = btn.getBoundingClientRect();
  if (!bb.width) return;
  if (instant) pill.style.transition = 'none';
  pill.style.width = `${Math.round(bb.width - 8)}px`;
  pill.style.transform = `translateX(${Math.round(bb.left - nb.left + 4)}px)`;
  pill.style.opacity = '1';
  if (instant) requestAnimationFrame(() => { pill.style.transition = ''; });
}

function go(page) {
  if (!PAGES.includes(page)) page = 'home';
  currentPage = page;
  for (const p of PAGES) {
    $(`page-${p}`)?.classList.toggle('active', p === page);
    $(`tab-${p}`)?.classList.toggle('active', p === page);
    $(`tab-${p}`)?.setAttribute('aria-current', p === page ? 'page' : 'false');
  }
  document.title = PAGE_TITLE[page] ?? 'Mausam';
  window.scrollTo({ top: 0 });
  // keep the URL in sync so manifest shortcuts (#mitra, #crops…) and back
  // buttons behave; replaceState avoids polluting history on every tab tap
  try { history.replaceState(null, '', `#${page}`); } catch { /* file:// etc. */ }
  if (page === 'crops') showCrops();
  if (page === 'mitra') showMitra();
  if (page === 'you') renderYou();
  if (page === 'settings') renderSettings();
  moveTabPill();
}

for (const p of PAGES) {
  $(`tab-${p}`)?.addEventListener('click', () => go(p));
}
window.addEventListener('hashchange', () => {
  const page = location.hash.slice(1);
  if (PAGES.includes(page) && page !== currentPage) go(page);
});
window.addEventListener('resize', () => moveTabPill(true));
window.addEventListener('load', () => moveTabPill(true));
document.fonts?.ready?.then(() => moveTabPill(true)).catch(() => {});
moveTabPill(true);
export function navigate(page) { go(page); }

/* ================= "/" — focus the screen's main text field =================
 * Standard convention: / reaches the primary search/text input of whatever
 * is on screen. It is NOT an AI shortcut — it never navigates. So it focuses
 * the Mitra composer on the Mitra tab, the crop filter on Crops, the field
 * of an open dialog (location search / compare / journey / history), and
 * does nothing on screens without a main field.
 */
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  const tgt = e.target;
  if (tgt?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(tgt?.tagName)) return;
  const openModal = document.querySelector('.modal-overlay.active');
  if (openModal) {
    const field = openModal.querySelector('input[type="search"], input[type="text"], textarea');
    if (field) { e.preventDefault(); field.focus(); }
    return; // modal open but no field → leave focus alone
  }
  if (currentPage === 'mitra') { e.preventDefault(); focusMitraInput(); }
  else if (currentPage === 'crops') {
    const filter = document.getElementById('crop-filter');
    if (filter) { e.preventDefault(); filter.focus(); }
  }
});

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

wireMitraPage($('page-mitra'), {
  openSettings: () => go('settings'),
  go: (p) => go(p),
  currentPage: () => currentPage,
});

wireCropsPage($('page-crops'));

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
      openCompare: () => openCompare({ location: currentLocation, units: currentUnits }),
      openJourney: () => openJourney({ location: currentLocation, units: currentUnits }),
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
let swReg = null;
if ('serviceWorker' in navigator && isSecureHost) {
  navigator.serviceWorker.register('sw.js')
    .then((reg) => { swReg = reg; })
    .catch((err) => console.warn('SW registration failed:', err));
}

/* ================= "app updated" snackbar =================
 * skipWaiting+claim means a freshly installed SW takes over while this
 * page still runs the old bundle. controllerchange after the first load
 * → offer a one-tap refresh instead of a silent half-updated state. */
let firstController = !navigator.serviceWorker?.controller;
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (firstController) { firstController = false; return; }
  showSnackbar(t('upd_ready'), '⟳', () => location.reload());
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && swReg) swReg.update().catch(() => {});
});

let snackbarTimer = null;
function showSnackbar(text, btnLabel, onBtn) {
  const bar = $('snackbar');
  const txt = $('snackbar-text');
  const btn = $('snackbar-btn');
  if (!bar || !txt || !btn) return;
  txt.textContent = text;
  btn.textContent = btnLabel;
  btn.onclick = () => { hideSnackbar(); onBtn?.(); };
  bar.hidden = false;
  requestAnimationFrame(() => bar.classList.add('show'));
  clearTimeout(snackbarTimer);
  snackbarTimer = setTimeout(hideSnackbar, 12000);
}
function hideSnackbar() {
  const bar = $('snackbar');
  if (!bar) return;
  bar.classList.remove('show');
  setTimeout(() => { bar.hidden = true; }, 300);
}

/* ================= install prompt (PWA) ================= */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__mausamInstallEvt = e; // settings.js renders the Install button from this
});
window.addEventListener('appinstalled', () => { window.__mausamInstallEvt = null; });

/* ================= pull-to-refresh (home, touch) ================= */
const PTR_TRIGGER = 72;   // px of pull before refresh fires
const ptrEl = $('ptr-indicator');
let ptrStartY = 0;
let ptrPulling = false;
let ptrFired = false;

$('page-home').addEventListener('touchstart', (e) => {
  if (window.scrollY > 4 || document.querySelector('.modal-overlay.active')) return;
  ptrStartY = e.touches[0].clientY;
  ptrPulling = true;
  ptrFired = false;
}, { passive: true });

$('page-home').addEventListener('touchmove', (e) => {
  if (!ptrPulling || ptrFired || !ptrEl) return;
  const dist = e.touches[0].clientY - ptrStartY;
  if (dist <= 0 || window.scrollY > 4) { ptrEl.classList.remove('show', 'armed'); return; }
  const eased = Math.min(dist * 0.45, 96); // rubber-band
  ptrEl.style.transform = `translateY(${Math.max(0, eased - 52)}px)`;
  ptrEl.classList.add('show');
  ptrEl.classList.toggle('armed', dist >= PTR_TRIGGER);
  if (dist >= PTR_TRIGGER + 8 && !inflight) {
    ptrFired = true;
    ptrEl.classList.remove('armed');
    ptrEl.classList.add('spin');
    loadWeather(true);
    setTimeout(() => {
      ptrEl.classList.remove('show', 'spin');
      ptrEl.style.transform = '';
    }, 900);
  }
}, { passive: true });

$('page-home').addEventListener('touchend', () => {
  ptrPulling = false;
  ptrEl?.classList.remove('show', 'armed');
  ptrEl.style.transform = '';
}, { passive: true });

/* ================= PWA share target =================
 * The manifest declares a share_target so "Share → Mausam" from any app
 * (WhatsApp, Maps, browser…) lands here with title/text/url params. If the
 * shared text looks like a place, open location search with it pre-filled.
 */
function handleSharedText() {
  try {
    const q = new URLSearchParams(location.search);
    const raw = q.get('text') || q.get('title') || q.get('url') || '';
    if (!q.toString()) return;
    // clean the URL immediately so a reload/back doesn't re-trigger
    history.replaceState(null, '', location.pathname + location.hash);
    let query = String(raw).trim();
    if (!query) return;
    // shared URLs: try to pull a place out of maps-style links (?q= / ?query= / last path bit)
    if (/^https?:\/\//i.test(query)) {
      try {
        const u = new URL(query);
        query = u.searchParams.get('q') || u.searchParams.get('query') || u.searchParams.get('place')
          || decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '') || query;
      } catch { /* keep raw */ }
    }
    query = query.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (query.length < 2) return;
    setTimeout(() => header.openSearchWithQuery(query), 350);
  } catch { /* never block boot */ }
}

/* ================= boot ================= */
async function boot() {
  store.flags.set('bootedOnce', true);

  // deep link: manifest shortcuts and shared links use #crops / #mitra etc.
  const hashPage = location.hash.slice(1);
  go(PAGES.includes(hashPage) ? hashPage : 'home');
  handleSharedText();
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
