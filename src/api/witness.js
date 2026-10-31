/**
 * witness.js — the weather's independent second opinion.
 *
 * NASA POWER (MERRA-2 reanalysis, keyless, CORS-open) and the Open-Meteo
 * archive (ERA5, keyless, CORS-open) both publish settled daily means for
 * recent days. Neither is involved in producing the app's forecast — so
 * when the two agree on the most recent settled day, the forecast model
 * family behind the board has an independent witness, and the board can
 * say "cross-checked" instead of "trust me".
 *
 * SETTLED-DAY WALK: POWER answers with -999 for days it has not finished
 * processing (a fill value, never a reading). We walk back from yesterday
 * up to MAX_LOOKBACK days to the first day POWER reports a real value for
 * and the archive covers too. On a normal day that is D-2/D-3 — the
 * honest price of satellite-grade verification.
 *
 * TRANSPORT: both endpoints send `access-control-allow-origin: *`, so the
 * browser calls them DIRECTLY — no proxy, no key, works on static Pages
 * exactly like in fixtures mode.
 *
 * Never throws — resolves to {ok:true,…} | {ok:false, error:{kind,message}}.
 */

import { get, set } from '../core/storage.js';
import { compareWeatherDay } from '../core/crosscheck.js';

const POWER_URL = 'https://power.larc.nasa.gov/api/temporal/daily/point';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const TIMEOUT_MS = 9000;
const CACHE_TTL_MIN = 360; // settled-day values never change — 6 h is generous
const MAX_LOOKBACK = 9;    // days to walk back for a POWER-settled day
const POWER_FILL = -999;   // POWER's documented "not computed" fill value

/* ---------------- helpers ---------------- */

function withTimeout(signal) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new DOMException('Witness timeout', 'TimeoutError')), TIMEOUT_MS);
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

function ymd(d) { return d.toISOString().slice(0, 10); }
function ymdCompact(d) { return d.toISOString().slice(0, 10).replace(/-/g, ''); }

/** Pure: pick the newest day both sources report honestly.
 *  @param {string[]} days            ISO dates, newest first
 *  @param {Object<string,number>} power  YYYYMMDD → T2M (may be -999)
 *  @param {Object<string,number>} era5  YYYY-MM-DD → mean temp
 *  @returns {{day:string, powerT:number, era5T:number}|null} */
export function pickSettledDay(days, power, era5) {
  for (const day of Array.isArray(days) ? days : []) {
    const pv = power?.[String(day).replace(/-/g, '')];
    const ev = era5?.[day];
    if (pv == null || ev == null) continue;
    const p = Number(pv);
    const e = Number(ev);
    if (!Number.isFinite(p) || !Number.isFinite(e)) continue;
    if (p === POWER_FILL || p < -90 || p > 60) continue; // fill / absurd
    return { day, powerT: p, era5T: e };
  }
  return null;
}

/* ---------------- the witness bundle ---------------- */

function cacheKey(lat, lon) { return `witness:${lat.toFixed(2)},${lon.toFixed(2)}`; }

/**
 * @returns {Promise<{ok:true, day:string, powerT:number, era5T:number,
 *                     delta:number, agree:boolean, sources:string[], fetchedAt:number}
 *                   |{ok:false, error:{kind:string,message:string}}>}
 */
export async function fetchWeatherWitness(lat, lon, signal) {
  const key = cacheKey(lat, lon);
  const cached = get(`opt:${key}`, null);
  if (cached && Date.now() - cached.at < cached.ttl && cached.val) return cached.val;

  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);                       // yesterday (local-day handled by the APIs)
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (MAX_LOOKBACK - 1));

  const t = withTimeout(signal);
  try {
    const powerQ = `${POWER_URL}?parameters=T2M&community=AG&latitude=${lat}&longitude=${lon}` +
      `&start=${ymdCompact(start)}&end=${ymdCompact(end)}&format=JSON`;
    const era5Q = `${ARCHIVE_URL}?latitude=${lat}&longitude=${lon}` +
      `&daily=temperature_2m_mean&start_date=${ymd(start)}&end_date=${ymd(end)}&timezone=auto`;
    const [powerRes, era5Res] = await Promise.all([
      fetch(powerQ, { signal: t.signal }),
      fetch(era5Q, { signal: t.signal }),
    ]);
    if (!powerRes.ok) throw Object.assign(new Error(`POWER HTTP ${powerRes.status}`), { wKind: 'power' });
    if (!era5Res.ok) throw Object.assign(new Error(`ERA5 HTTP ${era5Res.status}`), { wKind: 'era5' });
    const powerJson = await powerRes.json();
    const era5Json = await era5Res.json();

    const powerT2M = powerJson?.properties?.parameter?.T2M ?? {};
    const era5Days = era5Json?.daily?.time ?? [];
    const era5Temps = era5Json?.daily?.temperature_2m_mean ?? [];
    const era5Map = {};
    era5Days.forEach((d, i) => { era5Map[d] = era5Temps[i]; });
    const days = [...era5Days].sort().reverse(); // newest first

    const hit = pickSettledDay(days, powerT2M, era5Map);
    if (!hit) {
      const out = { ok: false, error: { kind: 'unsettled', message: 'No day is settled in both independent records yet.' } };
      set(`opt:${key}`, { at: Date.now(), ttl: 60 * 60000, val: out });
      return out;
    }
    const verdict = compareWeatherDay(hit.powerT, hit.era5T);
    const out = {
      ok: true,
      day: hit.day,
      powerT: hit.powerT,
      era5T: hit.era5T,
      delta: verdict.delta,
      agree: verdict.agree,
      sources: ['NASA POWER', 'ERA5'],
      fetchedAt: Date.now(),
    };
    set(`opt:${key}`, { at: Date.now(), ttl: CACHE_TTL_MIN * 60000, val: out });
    return out;
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    const kind = String(err?.message).includes('Failed to fetch') ? 'network' : (err?.wKind ?? 'error');
    return { ok: false, error: { kind, message: String(err?.message ?? err).slice(0, 140) } };
  } finally {
    t.done();
  }
}
