/**
 * main.js — application bootstrap & orchestration (profile era).
 *
 * Boot flow:
 *   1. theme + units, service worker
 *   2. legacy migration (old persona preset → real profile, once)
 *   3. no profiles? → onboarding wizard (mandatory first-run)
 *      profiles?   → resume last active profile straight into dashboard
 *   4. loadWeather: Open-Meteo bundle → optional IMD official enrichment
 *      → buildSnapshot → dashboard render with personal greeting/alert
 *   5. Mausam Mitra chat wired to the live snapshot
 *   6. auto-refresh every 15 min
 */

import { el, clear } from './utils/dom.js';
import { relativeTime } from './utils/format.js';
import { fetchWeatherBundle } from './api/open-meteo.js';
import { fetchImdBundle, imdSettings } from './api/imd.js';
import { buildSnapshot } from './core/engine.js';
import { store } from './core/storage.js';
import {
  listProfiles, activeProfile, setActiveProfile, getProfile,
  migrateLegacy, LENS_INFO,
} from './core/profiles.js';
import { greeting, personalAlert } from './core/personalise.js';
import { renderProfilesGrid, wireProfileModal } from './ui/profile-manager.js';
import { runOnboarding } from './ui/onboarding.js';
import { wireHeader } from './ui/header.js';
import { skeleton, errorCard } from './ui/shared.js';
import { renderFitness } from './ui/dashboards/fitness.js';
import { renderCommuter } from './ui/dashboards/commuter.js';
import { renderAgriculture } from './ui/dashboards/agriculture.js';
import { renderTraveler } from './ui/dashboards/traveler.js';
import { renderEvent } from './ui/dashboards/event.js';
import { wireChat } from './chat/ui.js';

const REFRESH_MS = 15 * 60 * 1000;
const IMD_TIMEOUT_MS = 9000;

const RENDERERS = {
  fitness: renderFitness,
  commuter: renderCommuter,
  agriculture: renderAgriculture,
  traveler: renderTraveler,
  event: renderEvent,
};

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
let currentProfile = null;
let currentSnapshot = null;
let currentUnits = store.units.get();
let currentLocation = null;
let refreshTimer = null;
let inflight = null;

/* ================= DOM refs ================= */
const $ = (id) => document.getElementById(id);
const screens = {
  profiles: $('persona-screen'),
  onboarding: $('onboarding-screen'),
  dashboard: $('dashboard-screen'),
};
const dashContent = $('main');
const updatedStamp = $('updated-stamp');
const srcPill = $('src-pill');
const srcLabel = $('src-label');

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name]?.classList.add('active');
}

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
    onSwitchProfile: () => profileModal.open(),
    onNewProfile: () => startOnboarding('create'),
  }
);
header.applyUnits(currentUnits);
header.applyTheme(store.theme.get());

/* ================= profile handling ================= */

function applyProfile(profile, { silent = false } = {}) {
  currentProfile = profile;
  document.body.dataset.persona = profile.lens; // lens accent (CSS)
  if (profile.color && profile.color !== 'blue') {
    document.body.dataset.accent = profile.color;
  } else {
    delete document.body.dataset.accent;
  }
  currentLocation = { ...profile.home };
  store.location.set(currentLocation);
  header.setProfile(profile);
  header.setLocation(currentLocation);
  showScreen('dashboard');
  renderDashboard();
  loadWeather(false, { silent });
  publishChatState();
}

function selectProfile(id) {
  const p = getProfile(id);
  if (!p) return;
  setActiveProfile(id);
  applyProfile(p);
}

/* ---------- onboarding launcher ---------- */
let wizard = null;

function startOnboarding(mode, profileId = null) {
  wizard?.destroy?.();
  const profile = profileId ? getProfile(profileId) : null;
  if (mode === 'edit' && !profile) return;
  chat.setHidden(true); // no assistant while the wizard owns the screen

  // dashboard keeps rendering behind? No — swap screens cleanly.
  wizard = runOnboarding({
    root: $('onboarding-root'),
    mode,
    profile,
    onDone: (saved) => {
      wizard?.destroy?.();
      wizard = null;
      chat.setHidden(false);
      if (profileModal) profileModal.refresh();
      if (saved?.id) selectProfile(saved.id);
      else {
        // fallback safety
        const ap = activeProfile();
        if (ap) applyProfile(ap);
      }
    },
    onCancel: () => {
      wizard?.destroy?.();
      wizard = null;
      chat.setHidden(false);
      const ap = activeProfile();
      if (ap) applyProfile(ap, { silent: true });
      else startOnboarding('first');
    },
  });
  showScreen('onboarding');
}

/* ================= profile switch modal ================= */
const profileModal = wireProfileModal(
  { overlay: $('switch-modal'), grid: $('modal-persona-grid'), closeBtn: $('switch-close') },
  {
    onSelect: (id) => {
      profileModal.close?.();
      selectProfile(id);
    },
    onNew: () => {
      profileModal.close?.();
      startOnboarding('create');
    },
    onEdit: (id) => {
      profileModal.close?.();
      startOnboarding('edit', id);
    },
  }
);

/* logo icon on the profiles screen */
$('logo-title').prepend(el('img', { src: 'icons/favicon.svg', alt: '' }));

/* ================= IMD settings ================= */

const imdInput = $('imd-key-input');
const imdStatus = $('imd-status');

function imdSetStatus(text, cls = '') {
  imdStatus.textContent = text;
  imdStatus.className = `imd-status ${cls}`;
}

imdInput.value = imdSettings.hasKey() ? imdSettings.getKey() : '';

$('imd-save-btn').addEventListener('click', () => {
  imdSettings.setKey(imdInput.value);
  if (!imdSettings.hasKey()) {
    imdSetStatus('Key cleared — forecasts will use Open-Meteo only.', 'busy');
    setSourceBadge(null);
    loadWeather(true, { silent: true });
    return;
  }
  imdSetStatus('Key saved. Testing…', 'busy');
  testImd();
});

$('imd-test-btn').addEventListener('click', () => {
  imdSettings.setKey(imdInput.value);
  testImd();
});

async function testImd() {
  const { testImdKey } = await import('./api/imd.js');
  imdSetStatus('Contacting the IMD gateway…', 'busy');
  try {
    const res = await testImdKey(imdSettings.getKey() || imdInput.value);
    if (res.ok) {
      imdSetStatus(`✓ ${res.message}${res.sample?.max != null ? ` Today: ${res.sample.max}°/${res.sample.min}°.` : ''}`, 'ok');
      loadWeather(true, { silent: true });
    } else {
      imdSetStatus(`✗ ${res.message}${res.hint ? ` ${res.hint}` : ''}`, 'bad');
    }
  } catch {
    imdSetStatus('✗ Test failed unexpectedly — check the console.', 'bad');
  }
}

function setSourceBadge(imd) {
  srcPill.classList.add('show');
  if (imd?.ok) {
    srcPill.classList.add('imd');
    srcPill.classList.remove('warn');
    srcLabel.textContent = 'IMD + Open-Meteo';
    srcPill.title = `Official IMD forecast via ${imd.station?.name ?? 'IMD station'} merged with Open-Meteo`;
  } else {
    srcPill.classList.remove('imd');
    srcPill.classList.remove('warn');
    srcLabel.textContent = 'Open-Meteo';
    srcPill.title = 'Live data from Open-Meteo (add a free IMD key in Settings for official data)';
  }
}

/* ================= weather loading ================= */

function setRefreshing(on) {
  header.setRefreshing(on);
}

async function enrichWithImd(bundle, signal) {
  if (!imdSettings.hasKey()) {
    setSourceBadge(null);
    return bundle;
  }
  // IMD is an optional enrichment: hard timeout + never throws.
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
  if (!currentProfile || !currentLocation) return;
  header.setOffline(!navigator.onLine); // connectivity state, always honest
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
      if (!silent) setRefreshing(false);
      if (inflight === controller) inflight = null; // fast path: never leaves "loading" stuck
      return;
    } catch {
      /* unusable cache — fall through */
    }
  }

  if (!silent) {
    clear(dashContent).appendChild(skeleton());
    setRefreshing(true);
  }

  if (cached && !currentSnapshot) {
    try {
      currentSnapshot = buildSnapshot(cached);
      setSourceBadge(cached.imd);
      renderDashboard();
    } catch {
      currentSnapshot = null;
    }
  }

  try {
    let bundle = await fetchWeatherBundle(currentLocation.lat, currentLocation.lon, controller.signal);
    if (controller.signal.aborted) return;
    bundle = await enrichWithImd(bundle, controller.signal);
    if (controller.signal.aborted) return;
    store.bundle.set(currentLocation.lat, currentLocation.lon, bundle);
    currentSnapshot = buildSnapshot(bundle);
    header.setLocation(currentLocation);
    header.setOffline(false);
    renderDashboard();
  } catch (err) {
    if (controller.signal.aborted || err.name === 'AbortError') return;
    header.setOffline(true); // the fetch itself failed — surface it
    if (!currentSnapshot && cached) {
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
    if (inflight === controller) inflight = null;
    if (!controller.signal.aborted) {
      setRefreshing(false);
      publishChatState();
    }
  }
}

/* ================= dashboard render ================= */

function renderDashboard() {
  if (!currentSnapshot || !currentProfile) return;
  currentSnapshot.locationLabel = currentLocation.name;
  clear(dashContent);
  try {
    RENDERERS[currentProfile.lens]?.(dashContent, currentSnapshot, currentUnits, {
      openSearch: () => header.openSearch(),
      rerender: renderDashboard,
    });
  } catch (err) {
    console.error('Render failed:', err);
    clear(dashContent).appendChild(errorCard('The dashboard hit an unexpected error.', renderDashboard));
    return;
  }

  // Personal layer: greeting + profile-tuned alert (prepended to the top).
  const alert = personalAlert(currentSnapshot, currentProfile, currentUnits);
  const block = el('div.personal-block', null,
    el('div.dash-greet', null,
      el('div.dash-greet-name', null, `${currentProfile.emoji} ${greeting(currentProfile)}`),
      el('div.dash-greet-sub', null, `📍 ${currentLocation.name}${currentLocation.admin1 ? `, ${currentLocation.admin1}` : ''}`)
    ),
    alert
      ? el(`div.alert.alert-${alert.kind}.personal-alert`, { role: 'alert' },
          el('div.alert-title', null, `${alert.icon} ${alert.title}`),
          el('div', null, alert.text)
        )
      : null
  );
  dashContent.prepend(block);

  updatedStamp.textContent = `Updated ${relativeTime(currentSnapshot.fetchedAt)} · ${currentLocation.name}` +
    (currentUnits === 'imperial' ? ' · °F' : ' · °C');
  publishChatState();
}

/* ================= chat ================= */

const chat = wireChat({
  onAction: (action) => {
    switch (action) {
      case 'new-profile': startOnboarding('create'); break;
      case 'edit-profile': if (currentProfile) startOnboarding('edit', currentProfile.id); break;
      case 'switch-profile': profileModal.open(); break;
      case 'open-imd-settings': header.openSettings?.(); break;
    }
  },
});

/* live state bridge for the chatbot brain */
function publishChatState() {
  window.__mausamState = {
    snapshot: currentSnapshot,
    profile: currentProfile,
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
  migrateLegacy();

  const params = new URLSearchParams(location.search);
  const linkLens = params.get('persona');

  const profiles = listProfiles();
  if (!profiles.length) {
    showScreen('onboarding');
    startOnboarding('first');
  } else {
    const target =
      (linkLens && LENS_INFO[linkLens] && profiles.find((p) => p.lens === linkLens)) ||
      activeProfile() ||
      profiles[0];
    applyProfile(target, { silent: false });
  }

  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && currentProfile) {
      loadWeather(true, { silent: true });
    }
  }, REFRESH_MS);

  setInterval(() => {
    if (currentSnapshot && screens.dashboard.classList.contains('active')) {
      updatedStamp.textContent = `Updated ${relativeTime(currentSnapshot.fetchedAt)} · ${currentLocation.name}` +
        (currentUnits === 'imperial' ? ' · °F' : ' · °C');
    }
  }, 30_000);
}

boot();
