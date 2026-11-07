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
const { offlineChat, classifyIntent, isVerifyQuestion, suggestChips } = await import('../src/ai/offline.js');

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
    fetchedAt: Date.now(), /* v0.8.54 — real snapshots always carry it; the receipt strip quotes it */
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

/* ---------------- v0.8.54 — compound questions, one composed answer ----------------
   classify() picks ONE winner, so "rain AND aqi in one breath" used to
   answer half of itself. compoundIntents() splits clauses, keeps topical
   winners in order; offlineChat composes their full answers. */
const { compoundIntents, answerReceipts } = await import('../src/ai/offline.js');

const found = compoundIntents('Will it rain today and what is the AQI?');
ok(found.length === 2 && found[0].id === 'rain' && found[1].id === 'aqi', 'compound: rain+aqi split in clause order', JSON.stringify(found));
const foundHi = compoundIntents('बारिश होगी और AQI कैसा है?');
ok(foundHi.length === 2 && foundHi[0].id === 'rain' && foundHi[1].id === 'aqi', 'compound: Devanagari और splits too', JSON.stringify(foundHi));
ok(compoundIntents('Will it rain today?').length <= 1, 'compound: single topic stays single');
ok(compoundIntents('hello and thanks').length === 0, 'compound: small-talk clauses are dropped, not amplified');

async function askFull(state, text) {
  let full = '';
  const ret = await offlineChat({ userText: text, onText: (d) => { full += d; }, getState: () => state, signal: undefined });
  return { full, ret };
}
const comp = await askFull(STATE_FARM, 'Will it rain today and what is the AQI?');
ok(/rain/i.test(comp.full) && /Air Quality Index|AQI/i.test(comp.full), 'compound answer: both prose parts present');
const compFences = fences(comp.full);
ok(compFences.some((f) => f.c === 'rain-bars'), 'compound: rain card drawn');
ok(compFences.some((f) => f.c === 'aqi-card'), 'compound: aqi card drawn');
ok(compFences.filter((f) => f.c === 'chips').length === 1, 'compound: exactly ONE chips row (no stacked menus)');
const compHi = await askFull(STATE_FARM, 'बारिश होगी और AQI कैसा है?');
/* the ENGINE streams in getLang() — EN in this node harness; the Devanagari
   CLAUSE SPLIT itself is pinned by the foundHi assertion above. */
ok(/rain/i.test(compHi.full) && /AQI/i.test(compHi.full), 'compound from a Hindi question: both parts served (engine language = harness lang)');

/* verify keeps supremacy over compound mode */
const compVerify = await askFull(STATE_FARM, 'aqi kya hai aur kya ye verified hai?');
ok(compVerify.ret.receipts.length === 0 && !compVerify.ret.receipts?.length, 'compound: verify answers carry no chips (ledger card is the receipt)');
ok(!compoundIntents('aqi kya hai aur kya ye verified hai?').some((f) => f.id === 'verify'), 'compound: verify clause never enters TOPICAL composition');

/* ---------------- v0.8.54 — the receipt strip ----------------
   Chips exist only when the source truly fed the answer; aqi adds the
   station chip ONLY when the live monitor answered. */
const rRain = await askFull(STATE_FARM, 'Will it rain today?');
ok(rRain.ret.receipts?.length === 1 && rRain.ret.receipts[0].k === 'forecast', 'receipts: rain → forecast only', JSON.stringify(rRain.ret.receipts));
ok(typeof rRain.ret.receipts[0].fresh === 'string' && rRain.ret.receipts[0].fresh.length > 0, 'receipts: forecast chip carries the honest age');
const rAqi = await askFull(STATE_FARM, 'what is the AQI?');
ok(rAqi.ret.receipts?.some((r) => r.k === 'air'), 'receipts: aqi → air model chip');
ok(!rAqi.ret.receipts?.some((r) => r.k === 'station'), 'receipts: station chip absent when no monitor spoke');
const rWear = await askFull(STATE_FARM, 'what should I wear?');
ok(rWear.ret.receipts?.some((r) => r.k === 'air') && rWear.ret.receipts?.some((r) => r.k === 'forecast'), 'receipts: wear → forecast + air (mask rule)');
const rHelp = await askFull(STATE_FARM, 'help');
ok(rHelp.ret.receipts?.length === 0, 'receipts: help quotes no data → no chips');
const STATION_STATE = {
  ...STATE_FARM,
  station: { ok: true, aqi: 91, ageMin: 34, station: { name: 'Hapur CPCB', distanceKm: 2.1 } },
};
const rAqiSt = await askFull(STATION_STATE, 'what is the AQI?');
ok(rAqiSt.ret.receipts?.some((r) => r.k === 'station' && /34/.test(r.fresh ?? '')), 'receipts: station chip with the reading age when the monitor spoke');
const compRec = comp.ret.receipts ?? [];
ok(compRec.some((r) => r.k === 'forecast') && compRec.some((r) => r.k === 'air'), 'receipts: compound unions its parts (forecast+air)');
ok(answerReceipts(STATE_FARM, []).length === 0 && answerReceipts(null, ['rain']).length === 0, 'receipts: honest empty on no-state / no-ids');
/* raw source keys — the Z.ai preview path declares what the model was FED */
const zaiCtx = answerReceipts(STATE_FARM, ['forecast', 'air', 'witness']);
ok(zaiCtx.some((r) => r.k === 'forecast') && zaiCtx.some((r) => r.k === 'air'), 'receipts: zai context keys → forecast+air chips');
ok(!zaiCtx.some((r) => r.k === 'witness'), 'receipts: witness chip only when the witness spoke');
ok(answerReceipts(STATE_FARM, ['nonsense-key']).length === 0, 'receipts: unknown keys contribute nothing');

/* ---------------- v0.8.56 — context-aware chips: classification ----------------
   Every generated chip phrase must route to the intent that answers it,
   otherwise a tap dead-ends. EN + hi, all five phrases (verified against
   the v0.8.54/55 compound engine's classifier). */
ok(classifyIntent('Will it rain by 9 AM?') === 'rain', 'chip: rain-by routes to rain');
ok(classifyIntent('How is the week looking?') === 'week', 'chip: weeklook routes to week');
ok(classifyIntent('AQI 214 — how bad is it?') === 'aqi', 'chip: aqin routes to aqi');
ok(classifyIntent('How strong is the UV today?') === 'uv', 'chip: uv routes to uv');
ok(classifyIntent('Best spray window this week?') === 'farm', 'chip: spray routes to farm');
ok(classifyIntent('शाम 5 बजे तक बारिश होगी?') === 'rain', 'chip hi: rain-by routes to rain');
ok(classifyIntent('हफ़्ता कैसा जाएगा?') === 'week', 'chip hi: weeklook routes to week');
ok(classifyIntent('AQI 214 — कितना खराब है?') === 'aqi', 'chip hi: aqin routes to aqi');
ok(classifyIntent('आज UV कितना तेज़ है?') === 'uv', 'chip hi: uv routes to uv');
ok(classifyIntent('इस हफ़्ते छिड़काव की खिड़की?') === 'farm', 'chip hi: spray routes to farm');

/* ---------------- v0.8.56 — suggestChips(state) ---------------- */
const CHIP_WET = {
  snapshot: {
    now: { temp: 26, feels: 28, wx: { icon: 'rain', label: 'Rain' }, uv: 8, humidity: 70, wind: 10 },
    hours: Array.from({ length: 24 }, (_, i) => H(i, { pop: i === 3 ? 65 : 15 })),
    days: STATE_FARM.snapshot.days,
    currentAqi: { aqi: 214, category: 'Poor', dominant: 'pm25' },
  },
  location: { name: 'Delhi' },
};
const wetChips = suggestChips(CHIP_WET);
ok(wetChips.some((c) => /by 9 AM/.test(c)), 'chips: wet sky names the concrete rain hour', wetChips.join(' | '));
ok(wetChips.some((c) => c.includes('214')), 'chips: live AQI number rides in the chip');
ok(wetChips.some((c) => /UV/i.test(c)), 'chips: uv chip appears when uv >= 6');
ok(wetChips[wetChips.length - 1] === 'Is this data verified?', 'chips: verify signature stays last');
ok(wetChips.length <= 6 && new Set(wetChips).size === wetChips.length, 'chips: capped at 6, no duplicates');
ok(wetChips.every((c) => classifyIntent(c) !== 'default'), 'chips: every generated chip routes to a real intent');
const dryChips = suggestChips(STATE_FARM);
ok(dryChips.some((c) => c === 'How is the week looking?'), 'chips: dry sky asks about the week');
ok(dryChips.some((c) => c === 'Best spray window this week?'), 'chips: spray chip when soil speaks');
ok(!dryChips.some((c) => /by \d/.test(c)), 'chips: no fake rain hour when sky is dry');
const bareChips = suggestChips({});
ok(bareChips.includes('What should I wear?') && bareChips.includes('Is this data verified?'), 'chips: no snapshot → honest evergreens');

console.log(`\noffline-intents: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
