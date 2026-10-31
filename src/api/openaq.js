/**
 * openaq.js — LIVE ground-station air quality via OpenAQ v3.
 *
 * This closes the gap the CAMS model estimate could never close: real
 * CPCB / DPCC / UPPCB monitors (Anand Vihar, Vasundhara, Indirapuram,
 * Loni, Sanjay Nagar…) reporting hourly, within ~25 km of the user.
 * The concentrations are fed through the SAME official CPCB breakpoint
 * math the model estimate uses (aqi-cpcb.js), so the two numbers on the
 * AQI card are directly comparable — and when they disagree, the card
 * now says which one to trust.
 *
 * TRANSPORT (browser reality, v0.8.40):
 *   1. same-origin proxy  /api/openaq/v3/...  — served by server.mjs in
 *      dev/preview; the server adds the X-API-Key header. This is the
 *      path that actually works in browsers, because OpenAQ's gateway
 *      answers CORS *preflight* (OPTIONS) with 401/no-ACAO, which
 *      blocks any header-authed call from a page. GET responses carry
 *      access-control-allow-origin: * — only the preflight is broken.
 *   2. direct https://api.openaq.org/v3/... with X-API-Key — tried when
 *      no proxy exists (e.g. static Pages). Today it fails in browsers
 *      at preflight; it works in Node (tests). If OpenAQ ever fixes
 *      OPTIONS, static deploys gain station AQI with zero code change.
 *
 * DATA HYGIENE: OpenAQ carries decades of CPCB history, including dead
 * sensors. The freshness gate (≤4 h per sensor, monitor's last payload
 * ≤3 h) keeps 2022 readings out of today's air. ppb gas values are
 * converted to µg/m³ at 25 °C / 760 mmHg (CPCB's own convention).
 *
 * Never throws — resolves to {ok:true,…} | {ok:false, error:{kind,message}}.
 */

import { computeCPCBAqi } from '../core/aqi-cpcb.js';
import { get, set } from '../core/storage.js';
import { openaqKey } from './keys.js';

const DIRECT = 'https://api.openaq.org/v3';
const PROXY = '/api/openaq/v3';
const TIMEOUT_MS = 9000;
const CACHE_TTL_MIN = 20;
const SENSOR_MAX_AGE_MIN = 240; // a sensor older than 4 h is not "live"
const MONITOR_MAX_AGE_MIN = 180; // the monitor itself must have spoken in 3 h
const RADIUS_M = 25000;

/* ---------------- transport ---------------- */

let transport = null; // 'proxy' | 'direct' — memoised for the session

function withTimeout(signal) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new DOMException('OpenAQ timeout', 'TimeoutError')), TIMEOUT_MS);
  const onOuter = () => ctl.abort(new DOMException('Aborted', 'AbortError'));
  if (signal) {
    if (signal.aborted) onOuter();
    else signal.addEventListener('abort', onOuter, { once: true });
  }
  return {
    signal: ctl.signal,
    done: () => { clearTimeout(timer); signal?.removeEventListener('abort', onOuter); },
  };
}

async function getJSON(path, signal) {
  const order = transport ? [transport] : ['proxy', 'direct'];
  let lastErr = null;
  for (const mode of order) {
    const base = mode === 'proxy' ? PROXY : DIRECT;
    const t = withTimeout(signal);
    try {
      const headers = mode === 'direct' ? { 'X-API-Key': openaqKey(), Accept: 'application/json' } : { Accept: 'application/json' };
      const res = await fetch(`${base}${path}`, { headers, signal: t.signal });
      if (res.status === 429) throw Object.assign(new Error('OpenAQ rate limit'), { oqKind: 'rate' });
      if (!res.ok) throw Object.assign(new Error(`OpenAQ HTTP ${res.status}`), { oqKind: res.status === 401 ? 'auth' : 'http' });
      const data = await res.json();
      transport = mode; // remember what worked
      return data;
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      lastErr = err;
      if (mode === order[order.length - 1]) throw err;
      // proxy failed (no server on static hosting) → try direct once
    } finally {
      t.done();
    }
  }
  throw lastErr ?? new Error('OpenAQ unreachable');
}

/* ---------------- unit + freshness math (pure, exported for tests) ------- */

/** ppb → µg/m³ at 25 °C, 1013 hPa (CPCB convention). PM species are
 *  always transmitted in µg/m³ regardless of the sensor label. */
export function ppbToUg(param, v) {
  const x = Number(v);
  if (!Number.isFinite(x)) return null;
  switch (String(param).toLowerCase()) {
    case 'no2': return x * 1.88;
    case 'so2': return x * 2.62;
    case 'o3': return x * 1.96;
    case 'co': return x * 1.145;   // stays µg/m³; aqi-cpcb.js divides by 1000
    case 'nh3': return x * 0.73;
    default: return x;              // pm25 / pm10 / anything already mass
  }
}

export function ageMinutes(iso, now = Date.now()) {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Infinity;
  return Math.max(0, Math.round((now - t) / 60000));
}

/**
 * From a location's sensor list + its /latest payload, keep only fresh
 * readings and resolve each pollutant to ONE value: the freshest sensor
 * wins; on an age tie the µg/m³ sensor beats the ppb one.
 * @returns {{pm25?, pm10?, no2?, so2?, o3?, co?, nh3?}} in native units
 */
export function pickFreshSensors(location, latestResults, now = Date.now()) {
  const fresh = new Map(); // sensorsId -> {value, utc, age}
  for (const row of Array.isArray(latestResults) ? latestResults : []) {
    const age = ageMinutes(row?.datetime?.utc, now);
    if (age <= SENSOR_MAX_AGE_MIN) fresh.set(row.sensorsId, { value: row.value, utc: row.datetime?.utc, age });
  }
  const best = new Map(); // param -> {value, units, age}
  for (const sensor of Array.isArray(location?.sensors) ? location.sensors : []) {
    const param = sensor?.parameter?.name;
    const hit = fresh.get(sensor.id);
    if (!param || !hit || hit.value == null) continue;
    const prev = best.get(param);
    const better =
      !prev ||
      hit.age < prev.age ||
      (hit.age === prev.age && sensor.parameter.units === 'µg/m³' && prev.units !== 'µg/m³');
    if (better) best.set(param, { value: Number(hit.value), units: sensor.parameter.units, age: hit.age });
  }
  const values = {};
  const units = {};
  for (const [k, v] of best) { values[k] = v.value; units[k] = v.units; }
  return { values, units };
}

/**
 * Readings → the concentration object aqi-cpcb.js expects (µg/m³).
 * Conversion follows the SENSOR's declared units — the same OpenAQ
 * pollutant often arrives twice (a µg/m³ sensor and a ppb sensor), and
 * converting a value that is already mass would multiply it into
 * nonsense (an O₃ 91 µg/m³ afternoon reading suddenly reading 178).
 */
export function concFromReadings(values, units = {}) {
  const conc = {};
  const put = (key, param, val) => {
    if (val == null) return;
    const v = String(units[param] ?? '').toLowerCase() === 'ppb' ? ppbToUg(param, val) : Number(val);
    if (v != null && Number.isFinite(v)) conc[key] = v;
  };
  put('pm2_5', 'pm25', values.pm25);
  put('pm10', 'pm10', values.pm10);
  put('no2', 'no2', values.no2);
  put('so2', 'so2', values.so2);
  put('co', 'co', values.co);
  put('o3', 'o3', values.o3);
  put('nh3', 'nh3', values.nh3);
  return conc;
}

/* ---------------- public: the station bundle ---------------- */

function cacheKey(lat, lon) {
  return `station:${lat.toFixed(2)},${lon.toFixed(2)}`;
}

/**
 * Live CPCB AQI from the nearest fresh monitor.
 * @returns {Promise<{ok:true, aqi, category, color, advice, dominant, subIndices,
 *                     conc, station:{id,name,distanceKm,provider}, ageMin, via, fetchedAt}
 *                   |{ok:false, error:{kind:string,message:string}}>}
 */
export async function fetchStationAqi(lat, lon, signal) {
  const key = cacheKey(lat, lon);
  const cached = get(`opt:${key}`, null);
  if (cached && Date.now() - cached.at < cached.ttl && cached.val) return cached.val;

  try {
    const q = `/locations?coordinates=${lat},${lon}&radius=${RADIUS_M}&limit=25`;
    const locs = await getJSON(q, signal);
    const now = Date.now();
    const monitors = (locs?.results ?? [])
      .filter((r) => r?.isMonitor && r?.coordinates)
      .map((r) => ({ ...r, age: ageMinutes(r.datetimeLast?.utc, now) }))
      .filter((r) => r.age <= MONITOR_MAX_AGE_MIN)
      .sort((a, b) => (a.distance ?? a.distanceKm ?? 1e9) - (b.distance ?? b.distanceKm ?? 1e9));
    if (!monitors.length) {
      const out = { ok: false, error: { kind: 'stale', message: 'No monitor near this place reported in the last 3 hours.' } };
      set(`opt:${key}`, { at: Date.now(), ttl: 30 * 60000, val: out });
      return out;
    }
    const mon = monitors[0];

    const latest = await getJSON(`/locations/${mon.id}/latest`, signal);
    const readings = pickFreshSensors(mon, latest?.results, now);
    const conc = concFromReadings(readings.values, readings.units);
    if (!Object.keys(conc).length) {
      const out = { ok: false, error: { kind: 'empty', message: 'The nearest monitor answered but reported no fresh pollutant values.' } };
      set(`opt:${key}`, { at: Date.now(), ttl: 30 * 60000, val: out });
      return out;
    }
    const computed = computeCPCBAqi(conc);
    const out = {
      ok: true,
      aqi: computed.aqi,
      category: computed.category,
      color: computed.color,
      advice: computed.advice,
      dominant: computed.dominant,
      subIndices: computed.subIndices,
      conc,
      station: {
        id: mon.id,
        name: String(mon.name ?? mon.id),
        distanceKm: Math.round((mon.distance ?? 0) / 10) / 100,
        provider: String(mon.provider?.name ?? mon.owner?.name ?? 'CPCB'),
      },
      ageMin: freshestAge(mon, latest?.results, now),
      via: transport ?? 'direct',
      fetchedAt: now,
    };
    set(`opt:${key}`, { at: now, ttl: CACHE_TTL_MIN * 60000, val: out });
    return out;
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    const kind = err?.oqKind ?? (String(err?.message).includes('Failed to fetch') ? 'network' : 'error');
    return { ok: false, error: { kind, message: String(err?.message ?? err).slice(0, 140) } };
  }
}

/** Age of the freshest reading actually used (for the "N min ago" line). */
function freshestAge(mon, latestResults, now) {
  const ids = new Set((mon?.sensors ?? []).map((s) => s.id));
  let best = Infinity;
  for (const row of Array.isArray(latestResults) ? latestResults : []) {
    if (!ids.has(row.sensorsId)) continue;
    const a = ageMinutes(row.datetime?.utc, now);
    if (a < best) best = a;
  }
  return Number.isFinite(best) ? best : null;
}
