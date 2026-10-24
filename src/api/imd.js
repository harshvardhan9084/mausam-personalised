/**
 * imd.js — client for the OFFICIAL India Meteorological Department gateway
 * (api.imd.gov.in). Free key, register at https://api.imd.gov.in.
 *
 * Endpoints used:
 *   GET /api/v1/cityforecast?id={stationId}   7-day official city forecast
 *   GET /api/v1/cityforecast_mapping          station → lat/lon catalogue
 *
 * Auth: `x-api-key` request header (verified against the live gateway).
 * Every failure is TYPED so the UI can tell the user exactly what to fix:
 *   auth  → key rejected by IMD
 *   cors  → browser blocked the call (gateway may not send CORS headers)
 *   network / http / shape / mapping
 *
 * IMD data is an OPTIONAL enrichment layer: without a key the app runs
 * fully on Open-Meteo and never blocks.
 */

import { get, set } from '../core/storage.js';

const BASE = 'https://api.imd.gov.in/api/v1';
const MAPPING_URL = `${BASE}/cityforecast_mapping`;
const CITY_URL = (id) => `${BASE}/cityforecast?id=${encodeURIComponent(id)}`;
const MAPPING_TTL = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 10_000;

/* ---------------- key management ---------------- */

export const imdSettings = {
  getKey: () => get('imdKey', ''),
  setKey: (k) => set('imdKey', String(k ?? '').trim()),
  hasKey: () => Boolean(String(get('imdKey', '')).trim()),
};

/* ---------------- low-level fetch ---------------- */

function withTimeout(signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('IMD timeout', 'TimeoutError')), TIMEOUT_MS);
  const onOuterAbort = () => controller.abort(new DOMException('Aborted', 'AbortError'));
  if (signal) {
    if (signal.aborted) onOuterAbort();
    else signal.addEventListener('abort', onOuterAbort, { once: true });
  }
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onOuterAbort);
    },
  };
}

function classifyError(err) {
  if (err?.name === 'AbortError') return { kind: 'abort', message: 'Request cancelled.' };
  if (err?.name === 'TimeoutError') return { kind: 'network', message: 'IMD gateway did not respond within 10 s.' };
  if (err instanceof TypeError) {
    return { kind: 'cors', message: 'The browser blocked the call to IMD (network or CORS restriction).' };
  }
  return { kind: 'unknown', message: err?.message || 'Unexpected IMD error.' };
}

async function imdFetchJSON(url, key, signal) {
  const t = withTimeout(signal);
  try {
    const res = await fetch(url, {
      headers: { 'x-api-key': key, Accept: 'application/json' },
      signal: t.signal,
    });
    if (res.status === 401 || res.status === 403) {
      throw Object.assign(new Error('IMD rejected the API key'), { imdKind: 'auth' });
    }
    if (!res.ok) {
      throw Object.assign(new Error(`IMD HTTP ${res.status}`), { imdKind: 'http', status: res.status });
    }
    const data = await res.json();
    if (data && typeof data === 'object' && data.error) {
      const msg = String(data.error);
      throw Object.assign(new Error(msg), {
        imdKind: /key|author/i.test(msg) ? 'auth' : 'http',
      });
    }
    return data;
  } catch (err) {
    if (err && err.imdKind) throw err; // already typed (auth / http)
    const c = classifyError(err); // → { kind: abort|network|cors|unknown, message }
    err.imdKind = c.kind;
    err.imdMessage = c.message;
    throw err;
  } finally {
    t.done();
  }
}

/** Case-insensitive field picker — IMD field naming varies in case/underscores. */
function pick(row, ...names) {
  const keys = Object.keys(row ?? {});
  for (const want of names) {
    const rx = new RegExp(`^${want.replace(/[_\s]/g, '[ _]?')}$`, 'i');
    const hit = keys.find((k) => rx.test(k));
    if (hit != null && row[hit] != null && row[hit] !== '') return row[hit];
  }
  return null;
}

function num(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^\d.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function addDays(dateISO, n) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ---------------- public: key test (Settings → Test) ---------------- */

const TEST_STATION = '42182'; // New Delhi (Safdarjung) — always exists

/**
 * Run a live round-trip with the given key.
 * @returns {Promise<{ok:boolean, kind?:string, message:string, hint?:string, sample?:{station:string,max:number,min:number}}>}
 */
export async function testImdKey(key, signal) {
  if (!key) return { ok: false, kind: 'empty', message: 'Enter your IMD API key first.' };
  try {
    const data = await imdFetchJSON(CITY_URL(TEST_STATION), key, signal);
    const row = Array.isArray(data) ? data[0] : data?.[Object.keys(data)[0]] ?? data;
    const station = pick(row, 'Station_Name') ?? 'test station';
    const max = num(pick(row, 'Todays_Forecast_Max_Temp', 'Today_Max_temp'));
    const min = num(pick(row, 'Todays_Forecast_Min_Temp', 'Today_Min_temp'));
    return { ok: true, message: `Key works — IMD responded for ${station}.`, sample: { station, max, min } };
  } catch (err) {
    const kind = err?.imdKind ?? 'unknown';
    const hints = {
      auth: 'Check the key on api.imd.gov.in → Dashboard. Keys can take a few minutes to activate after registration.',
      http: err.status === 429 ? 'Rate limited by IMD — try again in a minute.' : `IMD returned ${err.status ?? 'an error'}. The key may not be subscribed to the City Forecast product.`,
      cors: 'The browser could not call api.imd.gov.in directly from this page (network or CORS restriction). The app keeps working via Open-Meteo.',
      network: 'IMD did not respond in time — check your internet connection, then Test again.',
      abort: 'The request was cancelled.',
      unknown: 'Unexpected error while contacting IMD.',
    };
    const friendly = {
      cors: 'The browser blocked the call to IMD (network or CORS restriction).',
      network: 'The IMD gateway did not respond within 10 s.',
      abort: 'Request cancelled.',
      unknown: 'Unexpected IMD error.',
    };
    return {
      ok: false,
      kind,
      message: kind === 'auth' || kind === 'http' ? err.message : (friendly[kind] ?? err.message),
      hint: hints[kind],
    };
  }
}

/* ---------------- station catalogue ---------------- */

function normaliseStations(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.records) ? raw.records : [];
  const out = [];
  for (const row of list) {
    const code = pick(row, 'Station_Code', 'code', 'id');
    const name = pick(row, 'Station_Name', 'name');
    const lat = num(pick(row, 'Latitude', 'lat'));
    const lon = num(pick(row, 'Longitude', 'lon'));
    if (code != null && lat != null && lon != null) {
      out.push({ code: String(code), name: String(name ?? code), lat, lon });
    }
  }
  return out;
}

function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function nearestStation(stations, lat, lon) {
  let best = null;
  for (const st of stations) {
    const d = haversineKm(lat, lon, st.lat, st.lon);
    if (!best || d < best.distanceKm) best = { ...st, distanceKm: Math.round(d) };
  }
  return best;
}

async function getStationMap(key, signal) {
  const cached = get('imd:stationMap', null);
  if (cached && Date.now() - cached.fetchedAt < MAPPING_TTL && Array.isArray(cached.stations) && cached.stations.length) {
    return cached.stations;
  }
  const raw = await imdFetchJSON(MAPPING_URL, key, signal);
  const stations = normaliseStations(raw);
  if (!stations.length) {
    const err = new Error('Station catalogue came back empty');
    err.imdKind = 'shape';
    throw err;
  }
  set('imd:stationMap', { fetchedAt: Date.now(), stations });
  return stations;
}

/* ---------------- public: the enrichment bundle ---------------- */

/**
 * Fetch the official IMD 7-day city forecast for a location.
 * Never throws — resolves to a result object the caller can branch on.
 *
 * @returns {Promise<{ok:true, station, days:Array, obs:Object, fetchedAt:number} |
 *                    {ok:false, error:{kind:string,message:string}}>}
 */
export async function fetchImdBundle(lat, lon, signal) {
  const key = imdSettings.getKey();
  if (!key) return { ok: false, error: { kind: 'nokey', message: 'No IMD key configured.' } };
  try {
    const stations = await getStationMap(key, signal);
    const station = nearestStation(stations, lat, lon);
    if (!station) {
      return { ok: false, error: { kind: 'mapping', message: 'No IMD station near this location.' } };
    }
    const data = await imdFetchJSON(CITY_URL(station.code), key, signal);
    const row = Array.isArray(data) ? data[0] : Array.isArray(data?.records) ? data.records[0] : data;

    const obsDate = pick(row, 'Date') ?? new Date().toISOString().slice(0, 10);
    const date0 = String(obsDate).slice(0, 10);

    const dayField = (n) => ({
      date: addDays(date0, n - 1),
      max: num(pick(row, n === 1 ? 'Todays_Forecast_Max_Temp' : `Day_${n}_Max_Temp`)),
      min: num(pick(row, n === 1 ? 'Todays_Forecast_Min_Temp' : `Day_${n}_Min_Temp`)),
      text: pick(row, n === 1 ? 'Todays_Forecast' : `Day_${n}_Forecast`),
    });
    const days = [1, 2, 3, 4, 5, 6, 7].map(dayField).filter((d) => d.max != null || d.min != null || d.text);

    const obs = {
      maxTemp: num(pick(row, 'Today_Max_temp')),
      minTemp: num(pick(row, 'Today_Min_temp')),
      rain24: num(pick(row, 'Past_24_hrs_Rainfall')),
      rh0830: num(pick(row, 'Relative_Humidity_at_0830')),
      rh1730: num(pick(row, 'Relative_Humidity_at_1730')),
      sunrise: pick(row, 'Sunrise_time'),
      sunset: pick(row, 'Sunset_time'),
      moonrise: pick(row, 'Moonrise_time'),
      moonset: pick(row, 'Moonset_time'),
    };

    return {
      ok: true,
      station: { code: station.code, name: String(pick(row, 'Station_Name') ?? station.name), distanceKm: station.distanceKm },
      days,
      obs,
      fetchedAt: Date.now(),
    };
  } catch (err) {
    const typed = err?.imdKind ? { kind: err.imdKind, message: err.message } : classifyError(err);
    if (typed.kind === 'abort') return { ok: false, error: typed };
    return { ok: false, error: typed };
  }
}
