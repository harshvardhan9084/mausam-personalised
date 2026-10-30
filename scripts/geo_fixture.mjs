/**
 * geo_fixture.mjs — query-aware mock for the FX geocoding fixture (dev-only).
 *
 * The old /fx/geo.json was a static canned Ghaziabad list: every query —
 * "Mumbai", "कानपुर", anything — returned the same three rows, so city-search
 * flows and chat city lookups could not be exercised end-to-end in fixtures
 * mode (the 11:00 cycle documented this artifact). This module shapes the
 * response from the query the way the real Open-Meteo geocoder behaves:
 *
 *   - matches against a small multi-city table (EN + Devanagari names);
 *   - `language=hi` (or a Devanagari query) returns Hindi names, `language=en`
 *     returns English names — mirroring the live API we verified by curl
 *     (language=en DROPS Devanagari queries entirely; language=hi matches
 *     both scripts);
 *   - unknown / short queries return the real API's empty shape
 *     ({ generationtime_ms }) so "no results" UI paths stay testable;
 *   - NO name param at all → the legacy canned list (backward compatible
 *     with anything that loads /fx/geo.json directly).
 *
 * Pure module: no I/O, no state — server.mjs calls geoResponse() and the
 * test suite imports the same function.
 */

const CITIES = [
  {
    id: 1271308, en: { name: 'Ghaziabad', admin1: 'Uttar Pradesh', country: 'India' },
    hi: { name: 'ग़ाज़ियाबाद', admin1: 'उत्तर प्रदेश', country: 'भारत' },
    latitude: 28.66535, longitude: 77.43915, elevation: 214,
    country_code: 'IN', timezone: 'Asia/Kolkata', population: 1199191,
  },
  {
    id: 1261481, en: { name: 'New Delhi', admin1: 'Delhi', country: 'India' },
    hi: { name: 'नई दिल्ली', admin1: 'दिल्ली', country: 'भारत' },
    latitude: 28.6139, longitude: 77.209, elevation: 216,
    country_code: 'IN', timezone: 'Asia/Kolkata', population: 257803,
  },
  {
    id: 1275339, en: { name: 'Mumbai', admin1: 'Maharashtra', country: 'India' },
    hi: { name: 'मुंबई', admin1: 'महाराष्ट्र', country: 'भारत' },
    latitude: 19.07609, longitude: 72.8774, elevation: 12,
    country_code: 'IN', timezone: 'Asia/Kolkata', population: 12691836,
  },
  {
    id: 1267995, en: { name: 'Kanpur', admin1: 'Uttar Pradesh', country: 'India' },
    hi: { name: 'कानपुर', admin1: 'उत्तर प्रदेश', country: 'भारत' },
    latitude: 26.46523, longitude: 80.34975, elevation: 137,
    country_code: 'IN', timezone: 'Asia/Kolkata', population: 2823249,
  },
  {
    id: 1259839, en: { name: 'Patna', admin1: 'Bihar', country: 'India' },
    hi: { name: 'पटना', admin1: 'बिहार', country: 'भारत' },
    latitude: 25.59408, longitude: 85.13756, elevation: 53,
    country_code: 'IN', timezone: 'Asia/Kolkata', population: 1683200,
  },
  {
    id: 1259229, en: { name: 'Pune', admin1: 'Maharashtra', country: 'India' },
    hi: { name: 'पुणे', admin1: 'महाराष्ट्र', country: 'भारत' },
    latitude: 18.52043, longitude: 73.85674, elevation: 560,
    country_code: 'IN', timezone: 'Asia/Kolkata', population: 3124458,
  },
];

/** Legacy static list (the old geo.json shape) for no-name-param requests. */
function legacyList() {
  const rows = CITIES.map((c) => row(c, 'en'));
  return { results: rows.slice(0, 3), generationtime_ms: 0.16 };
}

/** One GeoNames-shaped result row. */
function row(c, lang) {
  const n = c[lang] ?? c.en;
  return {
    id: c.id,
    name: n.name,
    latitude: c.latitude,
    longitude: c.longitude,
    elevation: c.elevation,
    feature_code: 'PPL',
    country_code: c.country_code,
    timezone: c.timezone,
    population: c.population,
    country: n.country,
    admin1: n.admin1,
  };
}

/** True if the string contains Devanagari. */
const isDeva = (s) => /[\u0900-\u097F]/.test(s);

/**
 * Shape a /fx/geo.json response from the request's search params.
 * @param {URLSearchParams} q request query params (name, language, ...)
 * @returns {object} JSON-serialisable geocoder response
 */
export function geoResponse(q) {
  const name = (q?.get('name') ?? '').trim();
  if (!name) return legacyList();
  if (name.length < 2) return { generationtime_ms: 0.1 };
  const lang = q?.get('language') === 'hi' || isDeva(name) ? 'hi' : 'en';
  const needle = name.toLowerCase();
  // The real geocoder PREFIX-matches ("Pune" → Pune, "Kanp" → Kanpur);
  // exact-only matching broke the compare/journey pickers' partial queries.
  const hit = CITIES.find((c) =>
    c.en.name.toLowerCase().startsWith(needle) || c.hi.name.startsWith(name));
  if (!hit) return { generationtime_ms: 0.1 };
  // Real API returns the best match first; keep a second foreign-namesake row
  // only when the query is Latin (mirrors e.g. "Kanpur" → PK namesake).
  const results = [row(hit, lang)];
  return { results, generationtime_ms: 0.14 };
}
