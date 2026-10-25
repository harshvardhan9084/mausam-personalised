/**
 * extras.js — optional Open-Meteo services + helpers. ALL of these are
 * enhancements: every function resolves to null on any failure and never
 * blocks the main dashboard.
 *
 *   - fetchFloodBundle()  : 7-day river discharge (flood-api)
 *   - fetchMarineBundle() : wave height / period / direction (marine-api)
 *   - fetchClimateDelta() : "this week last year" from the archive API
 *
 * All keyless + CORS-open, fetched directly by the browser. Results are
 * cached in localStorage via store.optionalCache so re-renders and short
 * offline windows stay free.
 */

import { store } from '../core/storage.js';

const FLOOD_URL = 'https://flood-api.open-meteo.com/v1/flood';
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';

/** Tiny JSON GET with timeout; throws on HTTP/网络 failure. */
async function getJSON(url, { timeoutMs = 9000, signal } = {}) {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => ctl.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.reason || 'API error');
    return data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/* ================================================================
   RIVER DISCHARGE (flood watch)
================================================================ */

/**
 * @returns {Promise<null|{days: Array<{date, discharge, mean, max, median}>, peak: {date, ratio, discharge, mean}}>}
 */
export async function fetchFloodBundle(lat, lon, signal) {
  const key = `flood:${lat.toFixed(2)},${lon.toFixed(2)}`;
  const fresh = store.optionalCache.fresh(key);
  if (fresh !== null) return fresh;
  try {
    const url = `${FLOOD_URL}?latitude=${lat}&longitude=${lon}&daily=river_discharge,river_discharge_mean,river_discharge_median,river_discharge_max&forecast_days=7&timezone=auto`;
    const j = await getJSON(url, { signal });
    const d = j.daily ?? {};
    if (!Array.isArray(d.time) || !d.time.length) throw new Error('no data');
    const days = d.time.map((date, i) => ({
      date,
      discharge: d.river_discharge?.[i] ?? null,
      mean: d.river_discharge_mean?.[i] ?? null,
      median: d.river_discharge_median?.[i] ?? null,
      max: d.river_discharge_max?.[i] ?? null,
    }));
    // Peak abnormality this week: discharge vs climatological mean
    let peak = null;
    for (const day of days) {
      if (day.discharge == null || !day.mean) continue;
      const ratio = day.discharge / day.mean;
      if (!peak || ratio > peak.ratio) peak = { date: day.date, ratio, discharge: day.discharge, mean: day.mean };
    }
    const out = { days, peak };
    store.optionalCache.set(key, out, 90);
    return out;
  } catch {
    store.optionalCache.set(key, null, 30); // don't hammer a failing endpoint
    return null;
  }
}

/* ================================================================
   MARINE (coastal users)
================================================================ */

/**
 * @returns {Promise<null|{now: {waveHeightM, wavePeriodS, waveDirectionDeg}, days: Array<{date, waveMaxM, popNote?}}>}
 */
export async function fetchMarineBundle(lat, lon, signal) {
  const key = `marine:${lat.toFixed(1)},${lon.toFixed(1)}`;
  const fresh = store.optionalCache.fresh(key);
  if (fresh !== null) return fresh;
  try {
    const url = `${MARINE_URL}?latitude=${lat}&longitude=${lon}` +
      '&current=wave_height,wave_period,wave_direction' +
      '&daily=wave_height_max,wave_period_max&forecast_days=4&timezone=auto';
    const j = await getJSON(url, { signal });
    const c = j.current;
    if (!c || c.wave_height == null) throw new Error('no marine data (inland?)');
    const d = j.daily ?? {};
    const days = (d.time ?? []).map((date, i) => ({
      date,
      waveMaxM: d.wave_height_max?.[i] ?? null,
      wavePeriodS: d.wave_period_max?.[i] ?? null,
    }));
    const out = {
      now: {
        waveHeightM: c.wave_height ?? null,
        wavePeriodS: c.wave_period ?? null,
        waveDirectionDeg: c.wave_direction ?? null,
      },
      days,
    };
    store.optionalCache.set(key, out, 90);
    return out;
  } catch {
    store.optionalCache.set(key, null, 120); // inland places: cache "no" for 2h
    return null;
  }
}

/* ================================================================
   CLIMATE MEMORY ("this week last year")
================================================================ */

/**
 * Compares the coming 7-day mean max temp with the same calendar week one
 * year ago (archive API runs ~5 days behind, which is fine for last year).
 * @returns {Promise<null|{lastYearAvgMaxC: number, lastYearAvgMinC: number, lastYearRainMm: number}>}
 */
export async function fetchClimateDelta(lat, lon, signal) {
  const key = `climate:${lat.toFixed(1)},${lon.toFixed(1)}`;
  const fresh = store.optionalCache.fresh(key);
  if (fresh !== null) return fresh;
  try {
    const now = new Date();
    const ly = new Date(now.getTime() - 365 * 86400000);
    const iso = (d) => d.toISOString().slice(0, 10);
    const start = iso(new Date(ly.getTime() - 2 * 86400000));
    const end = iso(new Date(ly.getTime() + 4 * 86400000));
    const url = `${ARCHIVE_URL}?latitude=${lat}&longitude=${lon}` +
      `&start_date=${start}&end_date=${end}` +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto';
    const j = await getJSON(url, { signal });
    const d = j.daily ?? {};
    const maxes = (d.temperature_2m_max ?? []).filter((v) => v != null);
    const mins = (d.temperature_2m_min ?? []).filter((v) => v != null);
    const rains = (d.precipitation_sum ?? []).filter((v) => v != null);
    if (maxes.length < 3) throw new Error('insufficient archive');
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const out = {
      lastYearAvgMaxC: Math.round(avg(maxes) * 10) / 10,
      lastYearAvgMinC: mins.length ? Math.round(avg(mins) * 10) / 10 : null,
      lastYearRainMm: rains.length ? Math.round(rains.reduce((x, y) => x + y, 0) * 10) / 10 : 0,
    };
    store.optionalCache.set(key, out, 720); // stable for 12h
    return out;
  } catch {
    store.optionalCache.set(key, null, 180);
    return null;
  }
}
