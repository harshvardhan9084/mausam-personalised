/**
 * crosscheck.js — the agreement math behind the "Cross-checked" card.
 *
 * v0.8.41 "the third witness": every headline number on the board is now
 * produced by TWO independent systems, and this module is the honest
 * referee that says whether they agree.
 *
 *   Temperature  NASA POWER (MERRA-2 reanalysis, ~0.5° grid)
 *              vs Open-Meteo archive (ERA5, ~0.25° grid)
 *                → agree when |Δ| ≤ 1.5 °C on the most recent settled day
 *                  (a day POWER has finished processing — the fill value
 *                  -999 means "not computed yet", never a real reading).
 *
 *   Air quality  CAMS model AQI (official CPCB breakpoints)
 *              vs live CPCB/DPCC/UPPCB station AQI (OpenAQ, same math)
 *                → 'agree' when |Δ| ≤ 15 points or the two land in the
 *                  same CPCB band; 'mild' up to 39; 'gap' ≥ 40 means the
 *                  station is the truth (the AQI card already says so).
 *
 * WHY TEMPERATURE ONLY FOR THE WEATHER VERDICT: humidity and wind fields
 * diverge systematically between reanalyses over India's monsoon transition
 * (MERRA-2 RH can sit 20+ points off ERA5 without either being "wrong" at
 * grid scale). Reporting that as agree/disagree would teach users to
 * distrust honest numbers — so the verdict row carries the metric that is
 * robust across independent models, and carries it with both raw values
 * visible. Honest restraint beats decorative precision.
 *
 * Pure and DOM-free — node tests own this file's behaviour.
 */

/** Temperature agreement band, °C. Reanalysis-vs-reanalysis typically sits
 *  inside 1° over the homogenous NW-India plain; 1.5° leaves headroom for
 *  grid-size differences without ever calling a 2°+ split "agreement". */
export const TEMP_TOL_C = 1.5;

/** AQI agreement band, CPCB subindex points. 15 ≈ the width of noise
 *  between two instruments in the same band; beyond that the gap itself
 *  is the story. */
export const AQI_TOL = 15;

/** Station-far-above-model threshold (points) — inherited from v0.8.40's
 *  "trust the station" verdict so the two surfaces never disagree about
 *  what a disagreement is. */
export const AQI_GAP = 40;

/**
 * Two temperature estimates for the same settled day → verdict.
 * @param {number|null} powerT  NASA POWER T2M, °C (-999 fill must be
 *                              stripped by the caller — see witness.js)
 * @param {number|null} era5T   Open-Meteo archive (ERA5) mean temp, °C
 * @returns {{ok:true, delta:number, agree:boolean}|
 *           {ok:false, reason:'missing'}}
 */
export function compareWeatherDay(powerT, era5T) {
  if (powerT == null || era5T == null) return { ok: false, reason: 'missing' };
  const a = Number(powerT);
  const b = Number(era5T);
  /* Defense-in-depth: a POWER fill value (-999) or any absurd reading is
     "missing", never data — even if a caller forgets to strip it. */
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { ok: false, reason: 'missing' };
  if (a < -90 || a > 60 || b < -90 || b > 60) return { ok: false, reason: 'missing' };
  const raw = Math.abs(a - b);
  const delta = Math.round(raw * 10) / 10; // display rounding
  return { ok: true, delta, agree: raw <= TEMP_TOL_C }; // verdict on the raw gap
}

/** CPCB band index for an AQI value (0=Good … 5=Severe), null-safe. */
function bandIndex(aqi) {
  const v = Number(aqi);
  if (!Number.isFinite(v)) return null;
  if (v <= 50) return 0;
  if (v <= 100) return 1;
  if (v <= 200) return 2;
  if (v <= 300) return 3;
  if (v <= 400) return 4;
  return 5;
}

/**
 * Model AQI vs live-station AQI → verdict for the Cross-checked row.
 * @returns {{ok:true, delta:number, sameBand:boolean,
 *            verdict:'agree'|'mild'|'gap'}|{ok:false, reason:'missing'}}
 *   'agree' — same CPCB band or within AQI_TOL: the card shows the ✓.
 *   'mild'  — same band but far apart (the health advice is identical, so
 *             the honest word is "they differ a bit", not "trust one").
 *   'gap'   — different bands AND ≥ AQI_GAP apart, either direction: the
 *             station is ground truth (consistent with v0.8.40's verdict,
 *             which fires in the dangerous station-above direction).
 */
export function compareAqi(modelAqi, stationAqi) {
  if (modelAqi == null || stationAqi == null) return { ok: false, reason: 'missing' };
  const m = Number(modelAqi);
  const s = Number(stationAqi);
  if (!Number.isFinite(m) || !Number.isFinite(s)) return { ok: false, reason: 'missing' };
  const delta = Math.round(Math.abs(m - s));
  const sameBand = bandIndex(m) === bandIndex(s);
  const verdict = delta <= AQI_TOL ? 'agree' : (sameBand || delta < AQI_GAP ? 'mild' : 'gap');
  return { ok: true, delta, sameBand, verdict };
}
