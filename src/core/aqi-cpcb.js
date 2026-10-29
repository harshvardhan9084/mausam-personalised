/**
 * aqi-cpcb.js — CPCB India Air Quality Index (AQI) computation.
 *
 * Implements the official CPCB (Central Pollution Control Board) AQI:
 *   - Sub-index per pollutant via piecewise-linear interpolation on the
 *     CPCB breakpoint table.
 *   - Overall AQI = max(sub-indices); dominant pollutant = argmax.
 *
 * Reference: CPCB "National Air Quality Index — Report of the Expert Group"
 * (2014). CO breakpoints use mg/m³, others µg/m³. Ozone uses the 8-hour
 * breakpoints applied to the hourly value as an indicative estimate.
 */

const BREAKPOINTS = {
  pm2_5: {
    unit: 'µg/m³', c: ['PM2.5'],
    table: [[0, 30, 0, 50], [30, 60, 51, 100], [60, 90, 101, 200], [90, 120, 201, 300], [120, 250, 301, 400], [250, 500, 401, 500]],
  },
  pm10: {
    unit: 'µg/m³', c: ['PM10'],
    table: [[0, 50, 0, 50], [50, 100, 51, 100], [100, 250, 101, 200], [250, 350, 201, 300], [350, 430, 301, 400], [430, 800, 401, 500]],
  },
  no2: {
    unit: 'µg/m³', c: ['NO₂'],
    table: [[0, 40, 0, 50], [40, 80, 51, 100], [80, 180, 101, 200], [180, 280, 201, 300], [280, 400, 301, 400], [400, 1000, 401, 500]],
  },
  so2: {
    unit: 'µg/m³', c: ['SO₂'],
    table: [[0, 40, 0, 50], [40, 80, 51, 100], [80, 380, 101, 200], [380, 800, 201, 300], [800, 1600, 301, 400], [1600, 2400, 401, 500]],
  },
  co: {
    unit: 'mg/m³', c: ['CO'],
    table: [[0, 1, 0, 50], [1, 2, 51, 100], [2, 10, 101, 200], [10, 17, 201, 300], [17, 34, 301, 400], [34, 50, 401, 500]],
  },
  o3: {
    unit: 'µg/m³', c: ['O₃'],
    table: [[0, 50, 0, 50], [50, 100, 51, 100], [100, 168, 101, 200], [168, 208, 201, 300], [208, 748, 301, 400], [748, 1000, 401, 500]],
  },
  nh3: {
    unit: 'µg/m³', c: ['NH₃'],
    table: [[0, 200, 0, 50], [200, 400, 51, 100], [400, 800, 101, 200], [800, 1200, 201, 300], [1200, 1800, 301, 400], [1800, 2400, 401, 500]],
  },
};

/** CPCB AQI category descriptors.
 *  v0.8.22 — colors are CSS custom properties (--aqi-1..6, --aqi-u) defined
 *  per theme in tokens.css: one band vocabulary for the dashboard dial +
 *  48h bars, the chat aqi-card, and the compare cells (they used to be
 *  hardcoded hexes here plus two divergent re-implementations elsewhere,
 *  so the same AQI value painted different colours per surface/theme). */
export const AQI_CATEGORIES = [
  { max: 50,  label: 'Good',        color: 'var(--aqi-1)', advice: 'Air is clean. Ideal for outdoor activity.' },
  { max: 100, label: 'Satisfactory',color: 'var(--aqi-2)', advice: 'Minor breathing discomfort possible for sensitive people.' },
  { max: 200, label: 'Moderate',    color: 'var(--aqi-3)', advice: 'Breathing discomfort for people with lung or heart disease, children and older adults.' },
  { max: 300, label: 'Poor',        color: 'var(--aqi-4)', advice: 'Breathing discomfort for most on prolonged exposure. Limit outdoor exertion.' },
  { max: 400, label: 'Very Poor',   color: 'var(--aqi-5)', advice: 'Respiratory illness on prolonged exposure. Avoid outdoor activity.' },
  { max: 500, label: 'Severe',      color: 'var(--aqi-6)', advice: 'Serious health impact even for healthy people. Stay indoors.' },
];

/** Band color for an AQI value (or null → unknown), shared by every AQI surface. */
export function aqiBandColor(aqi) {
  if (aqi == null || Number.isNaN(Number(aqi))) return 'var(--aqi-u)';
  const cat = AQI_CATEGORIES.find((c) => aqi <= c.max) ?? AQI_CATEGORIES[AQI_CATEGORIES.length - 1];
  return cat.color;
}

/* ================================================================
   MODEL-ESTIMATE HONESTY (v0.8.24) — the AQI this app computes comes from
   the CAMS satellite model behind Open-Meteo (≈11 km grid, no street-level
   emissions, no crop-burning plumes). Around Indian cities it is documented
   to run FAR below official CPCB stations during the Oct–Feb pollution
   season — Delhi has shown model ~20-40 vs stations 200-400 the same hour.
   A number that low, shown as plain "Air quality (CPCB)", can talk someone
   out of a mask. These helpers let every surface say what the number IS
   and when the gap is dangerous.
================================================================ */

/** India's pollution season: October through February (0-based months). */
export function isPollutionSeason(d = new Date()) {
  const m = d.getMonth();
  return m >= 9 || m <= 1;
}

/** Indo-Gangetic plain + NW haze belt — Punjab → West Bengal, where the
 *  model-vs-station gap is extreme every winter (stubble smoke, haze inversions). */
export function isInHazeBelt(lat, lon) {
  return lat != null && lon != null
    && lat >= 21.5 && lat <= 32.5 && lon >= 72 && lon <= 88.5;
}

/** The dangerous case: the estimate is low enough to look "safe" while
 *  official stations in the belt typically read Poor+ in this season. */
export function aqiNeedsSeasonNotice(aqi, lat, lon, d = new Date()) {
  return aqi != null && aqi < 100 && isPollutionSeason(d) && isInHazeBelt(lat, lon);
}

/** Live station readings for this place (CPCB data republished, mobile-friendly). */
export function stationAqiUrl(name) {
  const slug = String(name ?? '').toLowerCase().trim().replace(/\s+/g, '-');
  return slug ? `https://aqicn.org/city/${encodeURIComponent(slug)}/` : 'https://aqicn.org/';
}

/**
 * Linear sub-index for one pollutant value against the CPCB table.
 * @param {number} value pollutant concentration
 * @param {Array<[number, number, number, number]>} table [Clow, Chigh, Ilow, Ihigh]
 */
function subIndex(value, table) {
  for (const [cLow, cHigh, iLow, iHigh] of table) {
    if (value <= cHigh) {
      return Math.round(iLow + ((iHigh - iLow) / (cHigh - cLow)) * (value - cLow));
    }
  }
  return 500; // beyond the highest breakpoint
}

/**
 * Compute CPCB AQI from pollutant concentrations.
 * @param {Object} conc concentrations: pm2_5, pm10, no2, so2, co (mg/m³), o3, nh3 — all nullable
 * @returns {{aqi: number|null, category: string, color: string, advice: string,
 *            dominant: string|null, subIndices: Object<string, number>}}
 */
export function computeCPCBAqi(conc) {
  const subIndices = {};
  for (const [key, spec] of Object.entries(BREAKPOINTS)) {
    let v = conc?.[key];
    if (v == null || Number.isNaN(v)) continue;
    if (key === 'co') v = v / 1000; // Open-Meteo CO: µg/m³ → CPCB mg/m³
    subIndices[spec.c[0]] = subIndex(v, spec.table);
  }
  const entries = Object.entries(subIndices);
  if (entries.length === 0) {
    return { aqi: null, category: 'Unknown', color: 'var(--aqi-u)', advice: '', dominant: null, subIndices: {} };
  }
  const [dominant, aqi] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const cat = AQI_CATEGORIES.find((c) => aqi <= c.max) ?? AQI_CATEGORIES[AQI_CATEGORIES.length - 1];
  return { aqi, category: cat.label, color: cat.color, advice: cat.advice, dominant, subIndices };
}

/** UV index → label. */
export function uvLabel(uv) {
  if (uv == null) return '—';
  if (uv < 3) return 'Low';
  if (uv < 6) return 'Moderate';
  if (uv < 8) return 'High';
  if (uv < 11) return 'Very High';
  return 'Extreme';
}
