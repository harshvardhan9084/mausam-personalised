/**
 * offline intents — v0.8.50 "Mausam Core grows up".
 *
 * The keyless engine gained three intents the live models always had:
 *   farm  — soil moisture verdict + spray windows (a Hinglish spray
 *           question previously derailed into a failed CITY lookup —
 *           "patwar" parsed as a place; that bug is pinned here)
 *   uv    — UV index + protection advice
 *   trend — day-over-day compare (tomorrow vs today)
 * plus explain-mode definitions riding in front of aqi/uv/temp answers.
 * Verify stays supreme; city lookups still work. Deterministic — node,
 * no DOM, no network (same harness discipline as test_verify.mjs).
 */
import { parseBlock } from '../src/ai/contract.js';

/* offline.js reads window.__mausamState.units at answer time — stub the
   minimal global before its dynamic import (static imports hoist, so the
   engine itself is pulled in after the stub exists). */
globalThis.window = { __mausamState: { units: 'metric' } };
const { offlineChat, classifyIntent, isVerifyQuestion } = await import('../src/ai/offline.js');

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
const STATE_FARM = {
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
const STATE_FARM_DRY = {
  ...STATE_FARM,
  snapshot: { ...STATE_FARM.snapshot, hours: Array.from({ length: 24 }, (_, i) => H(i, { soil_moisture_0_to_1cm: 0.09, soil_moisture_3_to_9cm: 0.12 })) },
};
const STATE_NO_SOIL = {
  ...STATE_FARM,
  snapshot: { ...STATE_FARM.snapshot, hours: Array.from({ length: 24 }, (_, i) => { const h = H(i); delete h.soil_moisture_0_to_1cm; delete h.soil_moisture_3_to_9cm; return h; }) },
};

async function ask(state, text) {
  let full = '';
  const comps = [];
  await offlineChat({
    userText: text,
    onText: (d) => { full += d; },
    getState: () => state,
    signal: undefined,
  });
  return full;
}
const fences = (full) => [...full.matchAll(/```mausam-ui\n([\s\S]*?)\n```/g)].map((m) => parseBlock(m[1])).filter((r) => r?.ok).map((r) => r.payload);

/* ---------------- classification ---------------- */
ok(classifyIntent('Kya aaj khet me spray ke liye theek hai?') === 'farm', 'farm: Hinglish spray question');
ok(classifyIntent('should I irrigate the field today') === 'farm', 'farm: irrigate');
ok(classifyIntent('fasal ke liye mausam') === 'farm', 'farm: Devanagari-adjacent fasal');
ok(classifyIntent('What is the UV index today?') === 'uv', 'uv: explicit uv');
ok(classifyIntent('Is tomorrow hotter than today?') === 'trend', 'trend: hotter-than override beats week');
ok(classifyIntent('difference between today and tomorrow weather') === 'trend', 'trend: difference');
ok(classifyIntent('kya fasal ka data verified hai?') === 'verify', 'verify stays supreme over farm');
ok(isVerifyQuestion('kya fasal ka data verified hai?') === true, 'verify: isVerifyQuestion true');
ok(classifyIntent('weather in Mumbai') === 'week' || classifyIntent('weather in Mumbai') !== 'farm', 'farm override does not swallow city questions');

/* ---------------- the Patwar bug (city guard) ---------------- */
const patwar = await ask(STATE_FARM, 'Kya aaj khet me spray ke liye theek hai? Patwar me paani dena chahiye?');
ok(!/couldn't find|not found/i.test(patwar), 'patwar bug: farm question never becomes a city lookup', patwar.slice(0, 90));
ok(/0\.22|0\.28/.test(patwar), 'patwar bug: farm answer carries the real soil numbers');
ok(patwar.includes('मिट्टी') || /soil/i.test(patwar), 'patwar bug: farm answer speaks soil (en default)');

/* ---------------- farm answers ---------------- */
const farm = await ask(STATE_FARM, 'spray time today?');
const farmFences = fences(farm);
ok(/good band|अच्छे बैंड/.test(farm), 'farm ok: good-band verdict for moist soil');
ok(farmFences.some((f) => f.c === 'metrics-grid'), 'farm: soil metrics card');
ok(farmFences.some((f) => f.c === 'advice'), 'farm: spray rules advice card');
ok(farmFences.some((f) => f.c === 'window-card'), 'farm: spray window card');
const dry = await ask(STATE_FARM_DRY, 'khet me paani dena chahiye?');
ok(/thirsty|प्यासी/.test(dry), 'farm dry: irrigate verdict when top < 0.15');
const nosoil = await ask(STATE_NO_SOIL, 'spray time today?');
ok(/has not landed|नहीं आया/.test(nosoil), 'farm no-soil: honest absence, never invented moisture');

/* ---------------- uv answers ---------------- */
const uv = await ask(STATE_FARM, 'What is the UV index today?');
ok(/UV index/i.test(uv) && /4/.test(uv), 'uv: value from snapshot');
ok(fences(uv).some((f) => f.c === 'metrics-grid'), 'uv: metrics card');
ok(/definition/i.test(uv) || /measures/i.test(uv), 'uv explain: definition rides in front');
const uvPlain = await ask(STATE_FARM, 'uv right now?');
ok(!/measures/i.test(uvPlain), 'uv plain: no definition when not asked');

/* ---------------- trend answers ---------------- */
const trend = await ask(STATE_FARM, 'Is tomorrow hotter than today?');
ok(/warmer|गर्म/.test(trend), 'trend: warmer verdict (+4° high)');
ok(/4°/.test(trend), 'trend: delta in prose');
const tf = fences(trend);
ok(tf.some((f) => f.c === 'compare-table' && f.d?.rows?.length === 3), 'trend: compare-table with 3 rows');
ok(JSON.stringify(tf.find((f) => f.c === 'compare-table')?.d?.columns) === JSON.stringify(['', 'Today', 'Tomorrow']), 'trend: columns Today/Tomorrow');

/* ---------------- explain mode on existing intents ---------------- */
const aqiDef = await ask(STATE_FARM, 'What is AQI?');
ok(/Air Quality Index/.test(aqiDef) && /84/.test(aqiDef), 'aqi explain: definition + live number');
const feelsDef = await ask(STATE_FARM, 'what is feels like temperature?');
ok(/Feels like|feels like/i.test(feelsDef), 'feels-like explain: definition present');
const aqiPlain = await ask(STATE_FARM, 'aqi abhi kya hai?');
ok(/Air Quality Index/.test(aqiPlain), 'aqi kya hai: explicit explain phrasing shows definition');

/* ---------------- regression: city lookups untouched ---------------- */
ok(classifyIntent('hello') === 'greet', 'regression: greet intact');
ok(!isVerifyQuestion('Will it rain today?'), 'regression: rain is not verify');

console.log(`\noffline-intents: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
