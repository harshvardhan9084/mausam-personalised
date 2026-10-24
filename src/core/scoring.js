/**
 * scoring.js — shared scoring models used by the persona engine.
 *
 * Every score is 0–100 (higher = better) and is computed from REAL
 * Open-Meteo values. Threshold bands are tuned for Indian climate zones.
 */

export const BANDS = {
  safe: { min: 65, label: 'Good', cls: 'safe', badge: 'badge-green', color: '#4caf82' },
  caution: { min: 40, label: 'Fair', cls: 'caution', badge: 'badge-yellow', color: '#f7c44f' },
  danger: { min: 0, label: 'Poor', cls: 'danger', badge: 'badge-red', color: '#e05c5c' },
};

/** Map a 0–100 score to its band object. */
export function band(score) {
  if (score == null) return BANDS.caution;
  if (score >= BANDS.safe.min) return BANDS.safe;
  if (score >= BANDS.caution.min) return BANDS.caution;
  return BANDS.danger;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Penalty that ramps 0 → max as value moves from start → end. */
function ramp(value, start, end, maxPenalty) {
  if (value <= start) return 0;
  if (value >= end) return maxPenalty;
  return ((value - start) / (end - start)) * maxPenalty;
}

/** Penalty for deviation from an ideal window [lo, hi] (soft edges soft). */
function windowPenalty(value, lo, hi, soft, maxPenalty) {
  if (value >= lo && value <= hi) return 0;
  const d = value < lo ? lo - value : value - hi;
  return clamp((d / soft) * maxPenalty, 0, maxPenalty);
}

/**
 * Outdoor fitness / running score for one hour.
 * Considers apparent temp, humidity, UV, precipitation risk and CPCB AQI.
 * @param {{feels:number, humidity:number, uv_index:number, precipitation_probability:number, aqi:number|null}} h
 */
export function runScore(h) {
  let s = 100;
  s -= windowPenalty(h.feels ?? 25, 8, 28, 14, 45);      // heat/cold discomfort
  s -= ramp(h.humidity ?? 50, 70, 95, 15);               // sticky air
  s -= ramp(h.uv_index ?? 0, 6, 11, 20);                 // sunburn risk
  s -= ramp(h.precipitation_probability ?? 0, 40, 85, 25); // rain
  const aqi = h.aqi;
  if (aqi != null) {
    if (aqi > 300) s -= 40;
    else s -= ramp(aqi, 100, 320, 40);                   // breathable-air penalty
  }
  return clamp(Math.round(s), 0, 100);
}

/**
 * Outdoor event suitability score for one hour.
 * Rain matters most, then heat, UV, wind gusts.
 */
export function eventScore(h) {
  let s = 100;
  s -= ramp(h.precipitation_probability ?? 0, 25, 80, 50);
  s -= windowPenalty(h.feels ?? 25, 17, 30, 12, 30);
  s -= ramp(h.uv_index ?? 0, 7, 11, 12);
  s -= ramp(h.wind_gusts_10m ?? h.wind ?? 0, 30, 65, 18);
  s -= ramp(h.humidity ?? 50, 75, 95, 10);
  return clamp(Math.round(s), 0, 100);
}

/**
 * Road / commute driving risk (higher = better driving conditions).
 * Visibility and precipitation dominate; gusts and fog codes add penalties.
 */
export function driveScore(h) {
  let s = 100;
  const vis = h.visibility;
  if (vis != null) {
    if (vis < 200) s -= 55;                    // dense fog
    else s -= ramp(2000 - Math.min(vis, 2000), 0, 2000, 55) * (vis < 2000 ? 1 : 0);
    if (vis >= 2000 && vis < 4000) s -= 12;    // reduced visibility
  }
  s -= ramp(h.precipitation_probability ?? 0, 35, 90, 35);
  s -= ramp(h.precipitation ?? 0, 0.5, 7, 20);
  s -= ramp(h.wind_gusts_10m ?? 0, 35, 70, 12);
  if ([45, 48].includes(h.weather_code)) s -= 30; // fog codes
  if ([95, 96, 99].includes(h.weather_code)) s -= 25; // thunderstorm
  return clamp(Math.round(s), 0, 100);
}

/**
 * Composite day score (for "best day" recommendations across the week).
 * Uses daily aggregates only.
 * @param {{temp_max:number, temp_min:number, precip_prob_max:number, precipitation_sum:number, uv_max:number, wind_max:number, gusts_max?:number}} d
 */
export function dayScore(d) {
  const meanFeels = ((d.temp_max + d.temp_min) / 2);
  const pseudoHour = {
    feels: meanFeels,
    humidity: null,
    uv_index: d.uv_max,
    precipitation_probability: d.precip_prob_max,
    precipitation: d.precipitation_sum,
    wind_gusts_10m: d.gusts_max ?? d.wind_max,
    visibility: null,
    weather_code: d.weather_code,
  };
  return eventScore(pseudoHour);
}

/**
 * Fieldwork score for agriculture (dry enough to work the field).
 */
export function fieldScore(h) {
  let s = 100;
  s -= ramp(h.precipitation_probability ?? 0, 20, 70, 60);
  s -= ramp(h.precipitation ?? 0, 0.2, 4, 25);
  s -= windowPenalty(h.feels ?? 25, 12, 36, 10, 15);
  return clamp(Math.round(s), 0, 100);
}

/**
 * Find the best non-overlapping 2-hour windows in a scored hour list.
 * @param {Array<{score:number, time:string}>} hours already scored, chronological
 * @param {number} count how many windows
 * @param {number} span hours per window
 * @returns {Array<{startIdx:number, endIdx:number, avg:number}>}
 */
export function bestWindows(hours, count = 2, span = 2) {
  const candidates = [];
  for (let i = 0; i + span <= hours.length; i++) {
    let sum = 0;
    for (let j = i; j < i + span; j++) sum += hours[j].score;
    candidates.push({ startIdx: i, endIdx: i + span - 1, avg: Math.round(sum / span) });
  }
  candidates.sort((a, b) => b.avg - a.avg);
  const picked = [];
  for (const c of candidates) {
    if (picked.every((p) => c.endIdx < p.startIdx || c.startIdx > p.endIdx)) {
      picked.push(c);
      if (picked.length === count) break;
    }
  }
  picked.sort((a, b) => a.startIdx - b.startIdx);
  return picked;
}

/**
 * Longest consecutive stretch of hours below a score threshold.
 * @returns {Array<{startIdx:number, endIdx:number}>}
 */
export function worstStretch(hours, threshold = 40, minLen = 2) {
  const stretches = [];
  let start = -1;
  for (let i = 0; i <= hours.length; i++) {
    const bad = i < hours.length && (hours[i].score ?? 100) < threshold;
    if (bad && start < 0) start = i;
    if (!bad && start >= 0) {
      if (i - start >= minLen) stretches.push({ startIdx: start, endIdx: i - 1 });
      start = -1;
    }
  }
  return stretches;
}
