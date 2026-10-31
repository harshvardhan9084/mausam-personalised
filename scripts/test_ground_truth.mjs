/**
 * test_ground_truth.mjs — v0.8.40 station AQI + farm fires.
 *
 * Pure tests run the REAL pipeline on real fixture data captured from
 * OpenAQ (Vasundhara, Ghaziabad — UPPCB monitor 5665): freshness gate,
 * ppb→µg/m³ conversion, CPCB AQI end-to-end. Live smokes hit the real
 * APIs from Node (header auth works there; no CORS in the way).
 * Network failures SKIP, not fail — same rule as test_api_v4.mjs.
 *
 * Run: node scripts/test_ground_truth.mjs
 */

import { ppbToUg, pickFreshSensors, concFromReadings, fetchStationAqi, ageMinutes } from '../src/api/openaq.js';
import { computeCPCBAqi } from '../src/core/aqi-cpcb.js';
import { parseFirmsCsv, countRecent, fetchFires } from '../src/api/firms.js';

let pass = 0, fail = 0, skipped = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) pass++;
  else { fail++; fails.push(`${name}${detail ? ` — ${detail}` : ''}`); }
};

/* ---------------- captured from OpenAQ monitor 5665 (Vasundhara, Ghaziabad)
   2026-10-31: fresh sensors are the 122351xx series; the 152xx series is
   a dead 2022 payload that MUST be excluded by the freshness gate. ------ */
const NOW = Date.parse('2026-10-31T08:35:00Z');
const LOCATION = {
  id: 5665,
  name: 'Vasundhara, Ghaziabad - UPPCB',
  sensors: [
    { id: 15238, parameter: { name: 'pm10', units: 'µg/m³' } },
    { id: 12235159, parameter: { name: 'pm10', units: 'µg/m³' } },
    { id: 15239, parameter: { name: 'pm25', units: 'µg/m³' } },
    { id: 12235160, parameter: { name: 'pm25', units: 'µg/m³' } },
    { id: 12235157, parameter: { name: 'no2', units: 'ppb' } },
    { id: 12235162, parameter: { name: 'so2', units: 'ppb' } },
    { id: 12235158, parameter: { name: 'o3', units: 'µg/m³' } },
    { id: 12235155, parameter: { name: 'co', units: 'ppb' } },
  ],
};
const LATEST = [
  { sensorsId: 12235160, value: 63.0, datetime: { utc: '2026-10-31T08:30:00Z' } },
  { sensorsId: 12235159, value: 115.0, datetime: { utc: '2026-10-31T08:30:00Z' } },
  { sensorsId: 15239, value: 166.0, datetime: { utc: '2022-10-31T02:00:00Z' } }, // stale
  { sensorsId: 15238, value: 293.0, datetime: { utc: '2022-10-31T02:00:00Z' } }, // stale
  { sensorsId: 12235157, value: 31.6, datetime: { utc: '2026-10-31T08:30:00Z' } },
  { sensorsId: 12235162, value: 14.4, datetime: { utc: '2026-10-31T08:30:00Z' } },
  { sensorsId: 12235158, value: 91.0, datetime: { utc: '2026-10-31T08:30:00Z' } },
  { sensorsId: 12235155, value: 0.78, datetime: { utc: '2026-10-31T08:30:00Z' } },
];

/* ---------------- pure: unit conversion ---------------- */
check('ppb→µg: no2 ×1.88', Math.abs(ppbToUg('no2', 31.6) - 59.408) < 0.01, String(ppbToUg('no2', 31.6)));
check('ppb→µg: so2 ×2.62', Math.abs(ppbToUg('so2', 14.4) - 37.728) < 0.01, String(ppbToUg('so2', 14.4)));
check('ppb→µg: co ×1.145', Math.abs(ppbToUg('co', 0.78) - 0.8931) < 0.001, String(ppbToUg('co', 0.78)));
check('ppb→µg: pm25 passes through untouched', ppbToUg('pm25', 63) === 63);
check('ppb→µg: garbage → null', ppbToUg('no2', 'x') === null);

/* ---------------- pure: freshness gate + per-pollutant winner ------- */
const picked = pickFreshSensors(LOCATION, LATEST, NOW);
check('gate: stale 2022 pm25 (166) excluded', picked.values.pm25 === 63, JSON.stringify(picked));
check('gate: stale 2022 pm10 (293) excluded', picked.values.pm10 === 115, JSON.stringify(picked));
check('gate: fresh no2 (ppb) picked', picked.values.no2 === 31.6, JSON.stringify(picked));
check('gate: fresh o3 (µg/m³) picked', picked.values.o3 === 91, JSON.stringify(picked));
check('gate: fresh co (ppb) picked', picked.values.co === 0.78, JSON.stringify(picked));
check('gate: units ride along (no2=ppb, o3=µg/m³)', picked.units.no2 === 'ppb' && picked.units.o3 === 'µg/m³', JSON.stringify(picked.units));
check('gate: nothing fresh → empty object', Object.keys(pickFreshSensors(LOCATION, [
  { sensorsId: 15239, value: 1, datetime: { utc: '2022-01-01T00:00:00Z' } },
], NOW).values).length === 0);

/* µg/m³ wins an age tie: two fresh pm25 sensors, same minute */
const tie = pickFreshSensors(
  { sensors: [
    { id: 1, parameter: { name: 'pm25', units: 'ppb' } },
    { id: 2, parameter: { name: 'pm25', units: 'µg/m³' } },
  ] },
  [
    { sensorsId: 1, value: 99, datetime: { utc: '2026-10-31T08:30:00Z' } },
    { sensorsId: 2, value: 63, datetime: { utc: '2026-10-31T08:30:00Z' } },
  ],
  NOW,
);
check('tie: µg/m³ sensor wins over ppb', tie.values.pm25 === 63, JSON.stringify(tie));

/* ---------------- pure: CPCB AQI end-to-end on real readings -------- */
const conc = concFromReadings(picked.values, picked.units);
check('conc: pm2_5 present', conc.pm2_5 === 63, JSON.stringify(conc));
check('conc: ppb no2 converted to µg/m³', Math.abs(conc.no2 - 59.408) < 0.01, JSON.stringify(conc));
check('conc: ppb co converted to µg/m³ (cpcb divides later)', Math.abs(conc.co - 0.8931) < 0.001, JSON.stringify(conc));
check('conc: µg/m³ o3 NOT converted (91 stays 91)', conc.o3 === 91, JSON.stringify(conc));
const aqi = computeCPCBAqi(conc);
check('cpcbaqi: AQI 111 (PM2.5 63 → band 101-200)', aqi.aqi === 111, JSON.stringify({ aqi: aqi.aqi, dom: aqi.dominant, sub: aqi.subIndices }));
check('cpcbaqi: dominant PM2.5', aqi.dominant === 'PM2.5', String(aqi.dominant));
check('cpcbaqi: category Moderate', aqi.category === 'Moderate', aqi.category);
check('cpcbaqi: sub-index no2 = 75', aqi.subIndices['NO₂'] === 75, JSON.stringify(aqi.subIndices));
check('ageMinutes: 5 minutes for 08:30 at 08:35', ageMinutes('2026-10-31T08:30:00Z', NOW) === 5);
check('ageMinutes: garbage → Infinity', ageMinutes(null) === Infinity);

/* ---------------- pure: FIRMS CSV ---------------- */
const CSV = [
  'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight',
  '28.912,77.451,344.2,0.48,0.39,2026-10-31,1315,Suomi-NPP,VIIRS,n,2.0NRT,300.1,12.3,D',
  '29.101,77.220,341.0,0.51,0.42,2026-10-30,0230,Suomi-NPP,VIIRS,l,2.0NRT,299.4,8.1,N',
  '30.000,78.500,340.0,0.5,0.4,2026-10-29,1130,Suomi-NPP,VIIRS,h,2.0NRT,298.0,5.0,D',
  'not-a-row,broken,row',
].join('\n');
const spots = parseFirmsCsv(CSV);
check('firms: 3 valid rows parsed (malformed dropped)', spots.length === 3, String(spots.length));
check('firms: confidence kept', spots[0].confidence === 'n', JSON.stringify(spots[0]));
const counts = countRecent(spots, new Date('2026-10-31T14:00:00Z'));
check('firms: count24=1, count48=2', counts.c24 === 1 && counts.c48 === 2, JSON.stringify(counts));
check('firms: garbage CSV → []', parseFirmsCsv('Invalid MAP_KEY').length === 0);

/* ---------------- live: OpenAQ direct from Node ---------------- */
try {
  const st = await fetchStationAqi(28.67, 77.45, AbortSignal.timeout(25000));
  if (st.ok) {
    check('live openaq: ok + numeric AQI', Number.isFinite(st.aqi), JSON.stringify({ aqi: st.aqi, st: st.station }));
    check('live openaq: fresh monitor near Ghaziabad', /ghaziabad|delhi|noida/i.test(st.station.name), st.station.name);
    check('live openaq: pm2_5 concentration present', st.conc?.pm2_5 != null, JSON.stringify(st.conc));
    check('live openaq: age within 4 h', (st.ageMin ?? 1e9) <= 240, String(st.ageMin));
    console.log(`  ${st.station.name} (${st.station.distanceKm} km): AQI ${st.aqi} ${st.category} · PM2.5 ${Math.round(st.conc.pm2_5 ?? NaN)} µg/m³ · ${st.ageMin} min old · via ${st.via}`);
  } else {
    skipped++;
    console.log(`  ⏭ live station SKIPPED — ${st.error?.kind}: ${st.error?.message}`);
  }
} catch (err) {
  skipped++;
  console.log(`  ⏭ live station SKIPPED — network: ${String(err?.message ?? err).slice(0, 80)}`);
}

/* live: FIRMS resolves without throwing (sandbox often cannot reach it —
   an honest {ok:false} is the designed degradation, not a failure) */
try {
  const fr = await fetchFires(28.67, 77.45, AbortSignal.timeout(20000));
  check('live firms: resolves to an ok flag', typeof fr?.ok === 'boolean', JSON.stringify(fr).slice(0, 120));
  if (fr?.ok) console.log(`  fires: ${fr.count24} in 24 h, ${fr.count48} in 48 h (via ${fr.via})`);
  else skipped++;
} catch (err) {
  check('live firms: never throws', false, String(err?.message ?? err).slice(0, 80));
}

console.log(`\n=== ground truth: ${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped (network)` : ''} ===`);
if (fails.length) {
  console.log('FAILURES:');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
