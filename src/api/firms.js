/**
 * firms.js — NASA FIRMS active-fire hotspots (VIIRS, near real-time).
 *
 * Why a weather/farm app wants this: every winter, stubble burning across
 * Punjab–Haryana–UP puts the Delhi-NCR haze belt on fire — literally. A
 * count of fresh fire pixels around the user's district is the honest
 * "why is the air suddenly bad" context, and for farming users it is a
 * neighbour-signal (what's burning nearby, today).
 *
 * Transport mirrors openaq.js: same-origin proxy /api/firms (server adds
 * the MAP_KEY) first, direct call with the bundled key as fallback.
 * FIRMS answers CSV — parsed here, never evaluated.
 *
 * Never throws — resolves to {ok:true,…} | {ok:false, error}.
 */

import { firmsKey } from './keys.js';
import { get, set } from '../core/storage.js';

const TIMEOUT_MS = 8000;
const CACHE_TTL_MIN = 60;
const HALF_DEG = 0.75; // bbox half-width ≈ 83 km — district scale

/* ---------------- transport ---------------- */

let transport = null;

async function fetchText(url, headers, signal) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new DOMException('FIRMS timeout', 'TimeoutError')), TIMEOUT_MS);
  const onOuter = () => ctl.abort(new DOMException('Aborted', 'AbortError'));
  if (signal) {
    if (signal.aborted) onOuter();
    else signal.addEventListener('abort', onOuter, { once: true });
  }
  try {
    const res = await fetch(url, { headers, signal: ctl.signal });
    if (!res.ok) throw Object.assign(new Error(`FIRMS HTTP ${res.status}`), { fKind: 'http' });
    return await res.text();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuter);
  }
}

/* ---------------- CSV parsing (pure, exported for tests) ---------------- */

/**
 * Parse a FIRMS `area/csv` response (VIIRS columns) into hotspots.
 * Columns: latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,
 *          satellite,instrument,confidence,version,bright_ti5,frp,daynight
 * @returns {Array<{lat:number,lon:number,confidence:string,date:string,time:string,daynight:string}>}
 */
export function parseFirmsCsv(text) {
  const rows = String(text ?? '').trim().split(/\r?\n/);
  if (rows.length < 2 || /^Invalid/i.test(rows[0] ?? '')) return [];
  const head = rows[0].split(',').map((h) => h.trim().toLowerCase());
  const ix = (name) => head.indexOf(name);
  const iLat = ix('latitude'), iLon = ix('longitude'), iConf = ix('confidence');
  const iDate = ix('acq_date'), iTime = ix('acq_time'), iDay = ix('daynight');
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const c = rows[i].split(',');
    const lat = Number(c[iLat]), lon = Number(c[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({
      lat, lon,
      confidence: String(c[iConf] ?? '').trim(),
      date: String(c[iDate] ?? '').trim(),
      time: String(c[iTime] ?? '').trim(),
      daynight: String(c[iDay] ?? '').trim(),
    });
  }
  return out;
}

/** Count hotspots inside the last 24 h of a 2-day window (pure). */
export function countRecent(hotspots, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  let c24 = 0, c48 = 0;
  for (const h of hotspots) {
    if (h.date === today || h.date === yesterday) c48++;
    if (h.date === today) c24++;
  }
  return { c24, c48 };
}

/* ---------------- public ---------------- */

/**
 * Fire hotspots around a point, district scale.
 * @returns {Promise<{ok:true, count24:number, count48:number, via:string, fetchedAt:number}
 *                   |{ok:false, error:{kind:string,message:string}}>}
 */
export async function fetchFires(lat, lon, signal) {
  const key = `fires:${lat.toFixed(1)},${lon.toFixed(1)}`;
  const cached = get(`opt:${key}`, null);
  if (cached && Date.now() - cached.at < cached.ttl && cached.val) return cached.val;

  const w = (lon - HALF_DEG).toFixed(2), s = (lat - HALF_DEG).toFixed(2);
  const e = (lon + HALF_DEG).toFixed(2), n = (lat + HALF_DEG).toFixed(2);
  const bbox = `${w},${s},${e},${n}`;
  const upstream = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey()}/VIIRS_SNPP_NRT/${bbox}/2`;
  const proxyUrl = `/api/firms?bbox=${encodeURIComponent(bbox)}`;

  try {
    let text, via;
    if (transport === 'direct') {
      text = await fetchText(upstream, {}, signal); via = 'direct';
    } else {
      try {
        text = await fetchText(proxyUrl, { Accept: 'text/csv' }, signal); via = 'proxy';
        transport = 'proxy';
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        text = await fetchText(upstream, {}, signal); via = 'direct';
        transport = 'direct';
      }
    }
    const hotspots = parseFirmsCsv(text);
    const { c24, c48 } = countRecent(hotspots);
    const out = { ok: true, count24: c24, count48: c48, via, fetchedAt: Date.now() };
    set(`opt:${key}`, { at: Date.now(), ttl: CACHE_TTL_MIN * 60000, val: out });
    return out;
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    return { ok: false, error: { kind: err?.fKind ?? 'network', message: String(err?.message ?? err).slice(0, 120) } };
  }
}
