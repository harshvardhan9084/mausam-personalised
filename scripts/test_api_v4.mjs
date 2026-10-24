/**
 * test_api_v4.mjs — live Open-Meteo smoke test through the app's real client.
 * Verifies the %2C / dew_point_2m fixes and the v4 bundle shape
 * (minutely nowcast, yesterday, 10 days, 48 hours).
 *
 * Run: node scripts/test_api_v4.mjs
 */

import { fetchWeatherBundle, geocodeSearch } from '../src/api/open-meteo.js';
import { buildSnapshot } from '../src/core/engine.js';

let pass = 0, fail = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) pass++;
  else { fail++; fails.push(`${name}${detail ? ` — ${detail}` : ''}`); }
};

console.log('Fetching live bundle for New Delhi…');
try {
  const bundle = await fetchWeatherBundle(28.6139, 77.209, AbortSignal.timeout(30000));
  const snap = buildSnapshot(bundle);

  check('bundle: current temp present', bundle.current?.temp != null, JSON.stringify(bundle.current));
  check('bundle: 10 forecast days', bundle.days.length === 10, String(bundle.days.length));
  check('bundle: yesterday present', bundle.yesterday?.temp_max != null, JSON.stringify(bundle.yesterday));
  check('bundle: minutely nowcast present', Array.isArray(bundle.minutely?.mm) && bundle.minutely.mm.length >= 4, JSON.stringify(bundle.minutely));
  check('bundle: 48 hourly rows', bundle.hours.length >= 40, String(bundle.hours.length));
  check('bundle: dew_point_2m present', bundle.hours.some((h) => h.dew_point_2m != null));

  check('snapshot: now enriched', snap.now?.wx?.label != null, JSON.stringify(snap.now?.wx));
  check('snapshot: yesterday delta computed', snap.yesterday?.deltaMax != null, JSON.stringify(snap.yesterday));
  check('snapshot: days labelled Today/Tomorrow', snap.days[0].label === 'Today' && snap.days[1].label === 'Tomorrow', snap.days.slice(0, 3).map((d) => d.label).join(','));
  check('snapshot: CPCB AQI object', snap.currentAqi != null && 'aqi' in snap.currentAqi);
  check('snapshot: sun times', snap.sun?.sunrise != null, JSON.stringify(snap.sun));

  console.log(`  Delhi now: ${snap.now.temp}°C, ${snap.now.wx.label}, AQI ${snap.currentAqi.aqi} (${snap.currentAqi.category})`);
  console.log(`  yesterday Δmax: ${snap.yesterday?.deltaMax?.toFixed?.(1) ?? snap.yesterday?.deltaMax}° | nowcast mm: [${(bundle.minutely?.mm ?? []).join(', ')}]`);

  // geocoding still works
  const results = await geocodeSearch('Mumbai', AbortSignal.timeout(15000));
  check('geocode: Mumbai found', results.some((r) => r.name.includes('Mumbai')), JSON.stringify(results.slice(0, 2)));
} catch (err) {
  check('live fetch succeeds', false, err.message);
}

console.log(`\n=== api v4: ${pass} passed, ${fail} failed ===`);
if (fails.length) {
  console.log('FAILURES:');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
