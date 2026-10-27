/**
 * test_fixture_transform.mjs — verify fetchWeatherBundle's normalisation +
 * buildSnapshot against a REAL API response saved earlier (sandbox is
 * rate-limited, but the response shape is what matters here).
 *
 * Fixture source: /tmp/api_test.json if present (fresh capture), else the
 * committed real-shape fixture at ../../scripts/fixtures_v4/forecast.json.
 *
 * Run: node scripts/test_fixture_transform.mjs
 */

import { readFileSync, existsSync } from 'node:fs';

let pass = 0, fail = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) pass++;
  else { fail++; fails.push(`${name}${detail ? ` — ${detail}` : ''}`); }
};

// Pull the client source and eval its pure transform pieces by importing the module graph.
// Simpler: re-run the real client but stub fetch with the fixture.
const TMP_FIXTURE = '/tmp/api_test.json';
const COMMITTED_FIXTURE = new URL('../../scripts/fixtures_v4/forecast.json', import.meta.url);
const fixture = JSON.parse(readFileSync(existsSync(TMP_FIXTURE) ? TMP_FIXTURE : COMMITTED_FIXTURE, 'utf8'));

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('/forecast?')) {
    // sanity: the URL the CLIENT builds must match the proven-good shape
    check('client URL: no %2C anywhere', !u.includes('%2C'), u.slice(0, 160));
    check('client URL: dew_point_2m used', u.includes('dew_point_2m'));
    check('client URL: minutely_15 requested', u.includes('minutely_15=precipitation'));
    check('client URL: past_days=1', u.includes('past_days=1'));
    check('client URL: forecast_days=10', u.includes('forecast_days=10'));
    return { ok: true, status: 200, json: async () => fixture, headers: new Map() };
  }
  if (u.includes('air-quality')) {
    return { ok: true, status: 200, json: async () => ({ hourly: { time: fixture.hourly.time.slice(0, 48), pm10: fixture.hourly.time.slice(0, 48).map(() => 120), pm2_5: fixture.hourly.time.slice(0, 48).map(() => 60) } }), headers: new Map() };
  }
  throw new Error('unexpected url ' + u);
};

const { fetchWeatherBundle } = await import('../src/api/open-meteo.js');
const { buildSnapshot } = await import('../src/core/engine.js');

const bundle = await fetchWeatherBundle(28.6139, 77.209);
const snap = buildSnapshot(bundle);

check('transform: 10 days', bundle.days.length === 10, String(bundle.days.length));
check('transform: yesterday extracted', bundle.yesterday?.temp_max != null, JSON.stringify(bundle.yesterday));
check('transform: days[0] is TODAY not yesterday', bundle.days[0].date === fixture.daily.time[1], `${bundle.days[0].date} vs ${fixture.daily.time[1]}`);
check('transform: minutely mapped', bundle.minutely?.mm?.length === 8, JSON.stringify(bundle.minutely));
check('transform: hours sliced from now', bundle.hours.length >= 40 && bundle.hours.length <= 49, String(bundle.hours.length));
check('transform: dew field preserved', bundle.hours.some((h) => h.dew_point_2m != null));
check('snapshot: AQI computed from stub air', snap.currentAqi?.aqi != null, JSON.stringify(snap.currentAqi));
check('snapshot: yesterday delta', snap.yesterday?.deltaMax != null, JSON.stringify(snap.yesterday));
check('snapshot: now label', snap.now?.wx?.label != null);

console.log(`\n=== fixture transform: ${pass} passed, ${fail} failed ===`);
if (fails.length) {
  console.log('FAILURES:');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
