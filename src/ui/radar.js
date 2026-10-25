/**
 * radar.js — the Radar tab: live rain radar over the Indian subcontinent.
 *
 * Zero keys: RainViewer's public weather-maps API gives past + nowcast
 * radar frames; tiles render over Leaflet (CDN, lazy-injected on first
 * open so casual users never download a map library they don't use).
 * Data-saver mode holds everything until the user presses Play.
 */

import { el, clear } from '../utils/dom.js';
import { store } from '../core/storage.js';
import { t } from '../core/i18n.js';

const RV_INDEX = 'https://api.rainviewer.com/public/weather-maps.json';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

const state = {
  ready: false,
  loading: false,
  failed: false,
  map: null,
  baseLayer: null,
  frames: [],          // [{time, layer}]
  frameIdx: -1,
  playing: false,
  timer: null,
  marker: null,
  lastLoc: null,
};

let mount = null;
let hooks = null;

export function wireRadarPage(mountEl, hooksIn) {
  mount = mountEl;
  hooks = hooksIn;
}

/** Called by the router when the tab becomes active. */
export function showRadar() {
  if (!mount) return;
  if (!state.ready && !state.loading && !state.failed) renderIntro();
  else if (state.ready) syncTheme();
}

function renderIntro() {
  clear(mount);
  const saver = store.dataSaver.get();
  mount.appendChild(el('div.page-h', null, '🗺️ ' + t('radar_title')));
  mount.appendChild(el('div.radar-shell',
    el('div.radar-map', { id: 'radar-map' },
      el('div.radar-overlay', { id: 'radar-overlay' },
        el('div.radar-note', null, t('radar_loading')),
        saver
          ? el('div.radar-ds', null, t('radar_ds_note'))
          : null,
        el('button.btn.btn-primary.btn-lg.radar-go', {
          type: 'button',
          onclick: (e) => { e.currentTarget.closest('.radar-overlay')?.remove(); start(); },
        }, '▶ ' + t('radar_play')),
      ),
    ),
    el('div.radar-bar',
      el('button.btn.btn-sm', { id: 'radar-play', type: 'button', onclick: togglePlay }, '⏸ ' + t('radar_pause')),
      el('span.radar-time', { id: 'radar-time' }, '—'),
      el('span.radar-spacer'),
      el('button.btn.btn-sm', { type: 'button', onclick: locateMe, title: t('radar_locate') }, '📍'),
    ),
    el('div.radar-legend',
      el('span.radar-grad'),
      el('span', null, t('radar_legend')),
    ),
  ));
  if (!saver) start();
}

/* ---------------- Leaflet bootstrap ---------------- */

function injectLeaflet() {
  if (window.L) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = LEAFLET_CSS;
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = LEAFLET_JS;
    js.onload = () => resolve();
    js.onerror = () => reject(new Error('Leaflet failed to load'));
    document.body.appendChild(js);
  });
}

async function start() {
  if (state.loading || state.ready) return;
  state.loading = true;
  const mapEl = mount.querySelector('#radar-map');
  const overlay = mount.querySelector('#radar-overlay');
  try {
    await injectLeaflet();
    if (!mapEl) return;
    const loc = hooks?.getLocation?.() ?? { lat: 22.5, lon: 79 };
    state.map = window.L.map(mapEl, { zoomControl: false, attributionControl: true }).setView([loc.lat, loc.lon], 6);
    window.L.control.zoom({ position: 'bottomright' }).addTo(state.map);
    addBasemap();
    state.marker = window.L.circleMarker([loc.lat, loc.lon], {
      radius: 7, color: '#ffffff', weight: 2, fillColor: 'var(--accent)', fillOpacity: 1,
    }).addTo(state.map);
    state.lastLoc = loc;
    await loadFrames();
    state.ready = true;
    document.querySelector('#radar-overlay')?.remove();
    play();
  } catch (err) {
    state.failed = true;
    if (overlay) {
      overlay.innerHTML = '';
      overlay.appendChild(el('div.radar-note', null, t('radar_load_fail')));
    }
  } finally {
    state.loading = false;
  }
}

function addBasemap() {
  if (!state.map) return;
  const light = document.body.dataset.theme === 'light';
  const url = light
    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  if (state.baseLayer) state.map.removeLayer(state.baseLayer);
  state.baseLayer = window.L.tileLayer(url, {
    maxZoom: 12, minZoom: 3,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> · © <a href="https://carto.com/attributions">CARTO</a> · RainViewer',
  }).addTo(state.map);
}

function syncTheme() {
  if (state.ready) addBasemap();
}

/* ---------------- RainViewer frames ---------------- */

async function loadFrames() {
  const res = await fetch(RV_INDEX, { signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`rainviewer ${res.status}`);
  const j = await res.json();
  const host = j.host ?? 'https://tilecache.rainviewer.com';
  const frames = [...(j.radar?.past ?? []).slice(-6), ...(j.radar?.nowcast ?? []).slice(0, 2)];
  state.frames = frames.map((f) => {
    const url = `${host}${f.path}/256/{z}/{x}/{y}/4/1_1/${f.time}.png`;
    const layer = window.L.tileLayer(url, { opacity: 0, maxZoom: 12, minZoom: 3 });
    layer.addTo(state.map);
    return { time: f.time, layer };
  });
  state.frameIdx = state.frames.length - 1;
  showFrame(state.frameIdx);
}

function showFrame(i) {
  state.frames.forEach((f, k) => f.layer.setOpacity(k === i ? 0.72 : 0));
  state.frameIdx = i;
  const label = mount.querySelector('#radar-time');
  if (label && state.frames[i]) {
    const d = new Date(state.frames[i].time * 1000);
    const nowcast = i >= (state.frames.length - 2) && state.frames.length > 6;
    label.textContent = (nowcast ? '⚡ ' : '') + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
}

function togglePlay() {
  const btn = mount.querySelector('#radar-play');
  state.playing ? pause() : play();
  if (btn) btn.textContent = state.playing ? `⏸ ${t('radar_pause')}` : `▶ ${t('radar_play')}`;
}

function play() {
  if (!state.frames.length) return;
  state.playing = true;
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    if (document.hidden) return;
    showFrame((state.frameIdx + 1) % state.frames.length);
  }, 650);
}

function pause() {
  state.playing = false;
  clearInterval(state.timer);
}

/* ---------------- location ---------------- */

function locateMe() {
  const loc = hooks?.getLocation?.();
  if (loc && state.map) {
    state.map.setView([loc.lat, loc.lon], 8);
    state.marker?.setLatLng([loc.lat, loc.lon]);
  }
}

/** External nudge: the current place changed. */
export function updateRadarLocation(loc) {
  if (!state.ready || !loc) return;
  const moved = !state.lastLoc || Math.abs(state.lastLoc.lat - loc.lat) > 0.05 || Math.abs(state.lastLoc.lon - loc.lon) > 0.05;
  if (moved) {
    state.lastLoc = loc;
    state.map.setView([loc.lat, loc.lon], 8);
    state.marker?.setLatLng([loc.lat, loc.lon]);
  }
}

export function onRadarThemeChange() { syncTheme(); }
