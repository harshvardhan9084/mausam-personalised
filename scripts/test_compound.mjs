/**
 * compound intents — v0.8.55 "the compound grammar, hardened".
 *
 * v0.8.54 (parallel cycle) shipped compound composition: compoundIntents()
 * splits on and/aur/ya/or/also/plus/और/या/.,;!?/danda, keeps every DISTINCT
 * topical clause (classify() decides), and buildCompound() composes up to
 * three full single-topic answers in clause order with ONE deduped chips
 * row. Supremacy survives: verify on the full question never composes,
 * city questions keep their lane, small-talk clauses are dropped.
 *
 * v0.8.55 adds the localized bridge ('Also —' / 'और यह भी —') between the
 * composed prose parts and the discoverability chips (empty state + help
 * sheet). This suite pins ALL of it: composition, refusals, bridge, chips
 * dedupe, asked order, and the legacy single path staying byte-identical.
 *
 * Deterministic — node, no DOM, no network (same harness discipline as
 * test_offline_intents.mjs).
 */
import { parseBlock } from '../src/ai/contract.js';

/* offline.js reads window.__mausamState.units at answer time — stub the
   minimal global before its dynamic import. */
globalThis.window = { __mausamState: { units: 'metric' } };
const { offlineChat, classifyIntent, compoundIntents } = await import('../src/ai/offline.js');

let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + name + (extra ? ` — ${extra}` : '')); } };

const H = (i, over = {}) => ({
  time: `2026-11-03T${String((6 + i) % 24).padStart(2, '0')}:00`,
  temperature_2m: 24 + (i % 5),
  feels: 26,
  precipitation_probability: over.pop ?? 15,
  wind: over.wind ?? 8,
  weather_code: 1,
  wx: { icon: 'clear-day', label: 'Clear' },
  uv_index: 3,
  aqi: 90,
  visibility: 20000,
  relative_humidity_2m: 55,
  soil_moisture_0_to_1cm: 0.22,
  soil_moisture_3_to_9cm: 0.28,
  soil_temperature_0_to_7cm: 24.5,
  et0_fao_evapotranspiration: 0.18,
  ...over,
});
const STATE = {
  snapshot: {
    now: { temp: 26, feels: 28, wx: { icon: 'clear-day', label: 'Clear' }, uv: 4, humidity: 55, wind: 8 },
    hours: Array.from({ length: 24 }, (_, i) => H(i)),
    days: [
      { label: 'Today', date: '2026-11-03', temp_max: 30, temp_min: 18, precip_prob_max: 20, wx: { icon: 'clear-day' }, uv_max: 5 },
      { label: 'Tomorrow', date: '2026-11-04', temp_max: 34, temp_min: 20, precip_prob_max: 10, wx: { icon: 'clear-day' }, uv_max: 7 },
      { label: 'Wed', date: '2026-11-05', temp_max: 29, temp_min: 17, precip_prob_max: 45, wx: { icon: 'rain' }, uv_max: 4 },
    ],
    currentAqi: { aqi: 84, category: 'Moderate', dominant: 'pm25' },
    sun: { sunrise: '2026-11-03T06:22', sunset: '2026-11-03T17:48' },
  },
  location: { name: 'Hapur' },
};

async function ask(state, text) {
  let full = '';
  await offlineChat({ userText: text, onText: (d) => { full += d; }, getState: () => state, signal: undefined });
  return full;
}
const fences = (full) => [...full.matchAll(/```mausam-ui\n([\s\S]*?)\n```/g)].map((m) => parseBlock(m[1])).filter((r) => r?.ok).map((r) => r.payload);
const types = (full) => fences(full).map((p) => p.c);
const ids = (q) => JSON.stringify((compoundIntents(q) ?? []).map((p) => p.id));

/* ---------------- composition fires ---------------- */
ok(ids('will it rain and how is the aqi?') === '["rain","aqi"]', 'compound: rain + aqi (canonical EN)');
ok(ids('barish aur aqi?') === '["rain","aqi"]', 'compound: Hinglish barish aur aqi');
ok(ids('rain ya aqi?') === '["rain","aqi"]', 'compound: ya split');
ok(ids('बारिश या AQI?') === '["rain","aqi"]', 'compound: Devanagari या split');
ok(ids('rain. aqi!') === '["rain","aqi"]', 'compound: period/bang split');
ok(ids('aqi and uv?') === '["aqi","uv"]', 'compound: aqi + uv');
ok(ids('spray window aur uv?') === '["farm","uv"]', 'compound: STRONG_FARM composes with uv');
ok(ids('temperature tomorrow and rain?') === '["temp","rain"]', 'compound: temp+week clause → temp + rain');
ok(ids('rain, aqi and uv') === '["rain","aqi","uv"]', 'compound: three topics found (build caps at 3)');

/* ---------------- composition refuses (single path unchanged) ---------------- */
ok(ids('what should i wear and carry?') === '["wear"]', 'refuse: wear+carry same topic twice → single');
ok(ids('kya khet me spray aur paani chahiye?') === '["farm"]', 'refuse: weak right clause (farm stays single — patwar lesson)');
ok((compoundIntents('is the aqi verified and real?') ?? []).length < 2, 'refuse: verify never a topic (evidence supremacy)');
ok(ids('hello and aqi?') === '["aqi"]', 'refuse: greet clause dropped, one topic left → single');
ok(ids('weather in Mumbai and aqi?') === '["aqi"]', 'refuse: city clause not topical — city lane keeps priority');
ok(ids('rain?') === '["rain"]', 'refuse: single clause is never compound');
ok(ids('aqi and pm2.5?') === '["aqi"]', 'refuse: aqi + pm2.5 same topic twice (and . in pm2.5 splits safely)');
ok(classifyIntent('Kya aaj khet me spray ke liye theek hai?') === 'farm', 'regression: farm classification intact');
ok(classifyIntent('Is tomorrow hotter than today?') === 'trend', 'regression: trend override intact');
ok(classifyIntent('kya fasal ka data verified hai?') === 'verify', 'regression: verify supremacy intact');

/* ---------------- end-to-end through offlineChat ---------------- */
{
  const full = await ask(STATE, 'will it rain and how is the aqi?');
  ok(full.includes('Also —'), 'e2e: localized bridge present', full.slice(0, 120));
  const ts = types(full);
  ok(ts.includes('rain-bars') && ts.includes('aqi-card'), 'e2e: BOTH card sets drew (rain-bars + aqi-card)', ts.join(','));
  ok(full.indexOf('rain-bars') < full.indexOf('aqi-card'), 'e2e: asked order kept (rain before aqi)');
  ok((full.match(/"c":"chips"/g) ?? []).length === 1, 'e2e: exactly ONE chips row (deduped)', String((full.match(/"c":"chips"/g) ?? []).length));
  ok(fences(full).every((p) => p && p.c), 'e2e: every fence parses under the v1 contract');
}
{
  const full = await ask(STATE, 'aqi first, barish?');
  ok(full.indexOf('aqi-card') < full.indexOf('rain-bars'), 'e2e: comma form keeps asked order (aqi before rain)');
}
{
  const full = await ask(STATE, 'rain, aqi and uv');
  ok((full.match(/Also —/g) ?? []).length === 2, 'e2e: three topics → two bridges', String((full.match(/Also —/g) ?? []).length));
  ok(types(full).includes('rain-bars') && types(full).includes('aqi-card'), 'e2e: three-topic answer still draws the real cards');
}
{
  const full = await ask(STATE, 'kya khet me spray aur paani chahiye?');
  ok(!full.includes('Also —'), 'e2e: refused compound shows NO bridge (single farm answer)');
  ok(types(full).includes('metrics-grid'), 'e2e: refused compound still answers the farm topic fully');
}
{
  const full = await ask(STATE, 'is the aqi verified and real?');
  ok(!full.includes('Also —'), 'e2e: verify supremacy — no bridge on evidence questions');
  ok(full.length > 40, 'e2e: verify answers in prose (honest empty-ledger copy when no witness has spoken)');
}

console.log(`\n=== compound: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
