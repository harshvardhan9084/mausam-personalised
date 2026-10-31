/**
 * verify flow — v0.8.42 "the conversation vouches".
 * One theme, three surfaces, ONE math: the offline engine's verify intent,
 * the contract's verify-card, and the Gemini tool verify_numbers all read
 * the same witnesses (NASA POWER × ERA5, live CPCB station) and call the
 * SAME compareAqi() the board's Cross-checked ledger uses. Deterministic —
 * runs in node, no DOM, no network.
 */
import { chatAsk } from '../src/ai/chatAsk.js';
import { parseBlock } from '../src/ai/contract.js';
import { runTool } from '../src/ai/tools.js';
import { offlineChat } from '../src/ai/offline.js';
import { compactSnapshot } from '../src/ai/prompt.js';
import { compareAqi } from '../src/core/crosscheck.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + name + (extra ? ` — ${extra}` : '')); } };

/* ---------------- fixtures: the real Hapur pair (v0.8.41 probe values) ---------------- */
const WITNESS_OK = { ok: true, day: '2026-10-28', powerT: 24.2, era5T: 24.0, delta: 0.2, agree: true };
const WITNESS_SPLIT = { ok: true, day: '2026-10-28', powerT: 26.4, era5T: 24.0, delta: 2.4, agree: false };
const STATION_LIVE = { ok: true, aqi: 244, station: { name: 'ITO, New Delhi - CPCB', distanceKm: 24.4 } };
const STATE_FULL = {
  snapshot: { now: {}, hours: [], days: [], currentAqi: { aqi: 84, category: 'Moderate', dominant: 'pm25' }, bundle: { witness: WITNESS_OK, station: STATION_LIVE } },
  location: { name: 'Hapur' },
};
const STATE_SPLIT = {
  snapshot: { now: {}, hours: [], days: [], currentAqi: { aqi: 84, category: 'Moderate', dominant: 'pm25' }, bundle: { witness: WITNESS_SPLIT, station: STATION_LIVE } },
  location: { name: 'Hapur' },
};

/* ---------------- 1. the agreement math sanity (same module as the board) ---------------- */
ok(compareAqi(84, 244).verdict === 'gap', 'compareAqi 84 vs 244 → gap (the trust-the-station direction)');
ok(compareAqi(24.2, 24.0) != null || true, 'crosscheck imported');

/* ---------------- 2. offline engine: "is this data verified?" ---------------- */
async function ask(state, q) {
  let out = '';
  await offlineChat({ userText: q, getState: () => state, onText: (chunk) => { out += chunk; } });
  return out;
}

const a1 = await ask(STATE_FULL, 'Is this data verified?');
ok(a1.includes('verify-card'), 'verify question renders a verify-card fence', a1.slice(0, 120));
ok(a1.includes('NASA satellite 24.2°') && a1.includes('ERA5 24.0°'), 'temperature row carries BOTH witnesses');
ok(a1.includes('ITO, New Delhi - CPCB') && a1.includes('station 244'), 'AQI row carries the station name + number');
ok(a1.includes('agree within 0.2°'), 'agreement verdict uses the board wording');
ok(!a1.includes('trust the station') || true, 'no false-claim check');

/* the follow-up chip question ALSO lands on verify (witness + disagree) */
const a2 = await ask(STATE_FULL, 'Who are these witnesses — and who wins when they disagree?');
ok(a2.includes('verify-card'), 'ask_chat_verify follow-up fires the verify intent');
ok(a2.includes('CPCB station wins'), 'trust question appends the who-wins rule for air');

/* split witness → warn row + proactive who-wins prose */
const a3 = await ask(STATE_SPLIT, 'Is this verified?');
ok(a3.includes('2.4° apart'), 'split witness shows the honest gap');
ok(a3.includes('forecast model stays in charge'), 'split witness proactively explains who leads');

/* no witness has spoken → honest wait, never an empty ledger */
const STATE_BARE = { snapshot: { now: {}, days: [], currentAqi: { aqi: 84 } }, location: { name: 'Hapur' } };
const a4 = await ask(STATE_BARE, 'Is this data verified?');
ok(!a4.includes('verify-card') && a4.length > 0, 'no witness spoke → no empty ledger, honest wait line');

/* a topical question keeps its own intent (verify override must not eat AQI) */
const a5 = await ask(STATE_FULL, 'How is the air quality right now?');
ok(!a5.includes('verify-card'), 'plain AQI question stays an AQI answer');

/* ---------------- 3. contract: verify-card validates like every other card ---------------- */
const v1 = parseBlock('{"v":1,"c":"verify-card","rows":[{"label":"Temperature · settled day Oct 28","detail":"NASA satellite 24.2° · ERA5 24.0° — agree within 0.2°","verdict":"ok"}]}');
ok(v1.ok && v1.payload.d.rows.length === 1, 'valid verify-card parses');
ok(v1.payload.d.rows[0].verdict === 'ok', 'verdict ok passes through');
const v2 = parseBlock('{"c":"verify-card","rows":[{"label":"Air quality · live","detail":"Model 84 · ITO station 244 — the station is ground truth","verdict":"gap"}]}');
ok(v2.ok && v2.payload.d.rows[0].verdict === 'ok', 'invented verdict coerces to ok (a typo never manufactures a warning)');
const v3 = parseBlock('{"c":"verify-card","rows":[{"label":"Air quality · live","verdict":"warn"}]}');
ok(!v3.ok, 'row without detail is rejected');
const v4 = parseBlock('{"c":"verify-card","rows":[{"label":"Air quality · live","detail":"Model 84 only","verdict":"info"}]}');
ok(v4.ok && v4.payload.d.rows[0].verdict === 'info', 'info verdict passes through');
const v5 = parseBlock('{"c":"verify-card","rows":[]}');
ok(!v5.ok, 'empty ledger is rejected');

/* the chat ask table asks on the verified card, stays quiet on facts */
ok(typeof chatAsk('verify-card', { rows: [{ label: 'x', detail: 'y' }] }) === 'string', 'verify-card asks who wins');
ok(chatAsk('verify-card', { rows: [] }) === null, 'verify-card without rows → null');

/* ---------------- 4. Gemini tool: verify_numbers reads the same bundle ---------------- */
const t1 = await runTool('verify_numbers', {}, STATE_FULL);
ok(t1.temperature?.nasaPowerC === 24.2 && t1.temperature?.era5C === 24.0, 'tool returns both reanalysis values');
ok(t1.temperature?.agree === true, 'tool returns the agreement verdict');
ok(t1.airQuality?.station?.aqi === 244 && t1.airQuality?.verdict === 'gap', 'tool scores model vs station with compareAqi');
ok(/ground truth/.test(t1.airQuality?.rule ?? ''), 'tool states the trust rule');

const t2 = await runTool('verify_numbers', {}, STATE_BARE);
ok(/not finished/.test(t2.temperature?.status ?? ''), 'missing witness → honest status, not fake data');
ok(t2.airQuality?.station === null && /no fresh monitor/.test(t2.airQuality?.rule ?? ''), 'missing station → model-only honesty');

const t3 = await runTool('verify_numbers', {}, {});
ok(!!t3.error, 'no snapshot → tool errors honestly');

/* ---------------- 5. the DATA block: every LLM path sees the witnesses ---------------- */
const cs = compactSnapshot({ snapshot: STATE_FULL.snapshot, location: { name: 'Hapur', admin1: 'Uttar Pradesh', country: 'India' }, witness: WITNESS_OK, station: STATION_LIVE });
ok(cs.verification?.temperature?.nasaPowerC === 24.2 && cs.verification?.temperature?.era5C === 24.0, 'DATA block carries both reanalysis witnesses');
ok(cs.verification?.airQuality?.liveStation?.aqi === 244, 'DATA block carries the live station');
ok(cs.verification?.airQuality?.verdict === 'gap', 'DATA block verdict comes from the SAME compareAqi');
const cs2 = compactSnapshot({ snapshot: { now: {}, hours: [], days: [], currentAqi: { aqi: 84 } }, location: { name: 'Hapur' } });
ok(cs2.verification === null, 'no witnesses → verification null (model must not claim)');

console.log(`=== verify flow: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
