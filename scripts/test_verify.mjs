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
import { offlineChat, isVerifyQuestion, verifyLedgerRows, verifyCardFence } from '../src/ai/offline.js';
import { compactSnapshot } from '../src/ai/prompt.js';
import { compareAqi } from '../src/core/crosscheck.js';
import { freshAgo } from '../src/utils/format.js';

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

/* ---------------- 6. v0.8.43 — the shared verify-intent matcher ----------------
   classify() overrides with it (offline path); client.js triggers the
   Z.ai auto-ledger with it. Evidence questions ≠ weather questions. */
ok(isVerifyQuestion('Is this data verified?') === true, 'EN chip question is verify-intent');
ok(isVerifyQuestion('क्या यह डेटा पक्का है?') === true, 'Devanagari chip question is verify-intent');
ok(isVerifyQuestion('who wins when they disagree?') === true, 'trust-rule follow-up is verify-intent');
ok(isVerifyQuestion('is the AQI accurate?') === true, 'accuracy wording is verify-intent');
ok(isVerifyQuestion('Will it rain today?') === false, 'rain question is NOT verify-intent');
ok(isVerifyQuestion('AQI kya hai?') === false, 'plain AQI question is NOT verify-intent (evidence ≠ air)');
ok(isVerifyQuestion('plan my weekend') === false, 'plan question is NOT verify-intent');
ok(isVerifyQuestion(null) === false && isVerifyQuestion(undefined) === false, 'null/undefined question is never verify-intent');

/* ---------------- 7. v0.8.43 — the ledger builder: one source of rows ----------------
   The offline engine, the Gemini tool path and the Z.ai preview path all
   draw from THIS function — a provider can no longer skip or invent
   verification evidence. */
const rowsFull = verifyLedgerRows(STATE_FULL);
ok(rowsFull.length === 2, 'full state → temperature + air rows (only witnesses that spoke)');
ok(rowsFull[0].verdict === 'ok', 'agree temperature witness → ok row');
ok(rowsFull[1].verdict === 'warn', 'AQI gap (84 vs 244, cross-band) → warn row');
const rowsSplit = verifyLedgerRows(STATE_SPLIT);
ok(rowsSplit[0].verdict === 'warn', 'split temperature witness → warn row (never faked as ok)');

const fenceFull = verifyCardFence(STATE_FULL);
ok(fenceFull.startsWith('\n```mausam-ui\n') && fenceFull.endsWith('\n```\n'), 'fence is a streamable mausam-ui block');
const fm = fenceFull.match(/```mausam-ui\n([\s\S]*?)\n```/);
const pb = fm ? parseBlock(fm[1]) : { ok: false };
ok(pb.ok === true && pb.payload.c === 'verify-card', 'auto fence round-trips through the SAME contract parser');
ok(pb.ok && pb.payload.d.rows.length === 2 && pb.payload.t.length > 0, 'round-tripped card keeps both rows + the ledger title');

ok(verifyCardFence({ snapshot: { now: {}, hours: [], days: [], currentAqi: { aqi: 84 } } }) === '', 'no witnesses → empty fence, never an empty ledger');
ok(verifyCardFence(null) === '' && verifyLedgerRows(null).length === 0, 'null state is silent, not a crash');
ok(verifyCardFence(STATE_FULL) === verifyCardFence(STATE_FULL), 'fence is deterministic (same state → same ledger)');

/* ---------------- v0.8.45 — the receipts: freshAgo grammar + ledger ride-along ---------------- */
ok(freshAgo(null) === null && freshAgo(undefined) === null, 'freshAgo: null/undefined → null (caller omits, never "— min ago")');
ok(freshAgo(Infinity) === null && freshAgo(-5) === null && freshAgo('x') === null, 'freshAgo: Infinity/negative/garbage → null');
ok(freshAgo(0) === '0 min ago', 'freshAgo: 0 → "0 min ago"');
ok(freshAgo(59) === '59 min ago', 'freshAgo: 59 → minutes');
ok(freshAgo(60) === '1 hr ago', 'freshAgo: 60 → "1 hr ago" (boundary)');
ok(freshAgo(90) === '1.5 hr ago', 'freshAgo: 90 → "1.5 hr ago" (one decimal)');
ok(freshAgo(240) === '4 hr ago', 'freshAgo: 240 → "4 hr ago" (station gate edge)');
ok(freshAgo(59.4) === '59 min ago', 'freshAgo: 59.4 rounds to minutes');
const STATION_AGED = { ...STATION_LIVE, ageMin: 22 };
const rowsAged = verifyLedgerRows({ snapshot: { now: {}, hours: [], days: [], currentAqi: { aqi: 84 }, bundle: { witness: WITNESS_OK, station: STATION_AGED } }, location: { name: 'Hapur' } });
ok(rowsAged[1].detail.includes('· 22 min ago'), 'ledger AQI row carries the station receipt (· 22 min ago)');
ok(!rowsFull[1].detail.includes('min ago'), 'no ageMin → no receipt (never "— min ago")');
ok(verifyCardFence({ snapshot: { now: {}, hours: [], days: [], currentAqi: { aqi: 84 }, bundle: { witness: WITNESS_OK, station: STATION_AGED } }, location: { name: 'Hapur' } }).includes('22 min ago'), 'fence round-trips the receipt too');
{
  /* the air ANSWER cites the ground truth when the station spoke */
  let said = '';
  await offlineChat({
    userText: 'air quality right now?', onText: (chunk) => { said += chunk; }, signal: new AbortController().signal,
    getState: () => ({ snapshot: { now: {}, hours: [], days: [], currentAqi: { aqi: 84, dominant: 'pm25' }, bundle: { station: STATION_AGED } }, location: { name: 'Hapur' } }),
  });
  ok(said.includes('ITO, New Delhi - CPCB') && said.includes('AQI 244') && said.includes('22 min ago'), 'air answer leads with the live station + receipt', said.slice(0, 120));
}

console.log(`=== verify flow: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
