/**
 * offline.js — "Mausam Core": the local, keyless fallback brain.
 *
 * Runs entirely in the browser on top of the live snapshot. Not a scammy
 * fake-AI: it is honest rule-based intelligence that reuses the same
 * scoring models and the SAME MausamUI contract as the real models, so
 * the experience stays consistent. Labelled clearly in the UI.
 *
 * When the user adds a Gemini key (or runs the preview server), the
 * client switches to real LLMs; this engine remains the zero-config
 * default and the graceful fallback.
 */

import { temp as fmtTemp, wind as fmtWind, hourLabel, dateLabel, freshAgo, relativeTime } from '../utils/format.js';
import { runScore, eventScore, driveScore, dayScore, bestWindows, band } from '../core/scoring.js';
import { isPollutionSeason, aqiCat } from '../core/aqi-cpcb.js';
/* v0.8.42 — verification answers use the SAME agreement math as the
   board's Cross-checked ledger; the chat can never contradict the card. */
import { compareAqi } from '../core/crosscheck.js';
import { wxText } from '../api/wmo.js';
import { runTool, fetchCitySnapshot } from './tools.js';
/* v0.8.27 — Mausam Core speaks the user's language. The engine runs at SEND
   time (not fetch-baked like the dashboard), so it resolves strings through
   the SAME i18n dictionary as the UI: tr() for prose, wxText()/aqiCat() for
   the sky/air vocabularies. The EN bake in engine.js stays untouched — tests
   and the dashboard keep their stable English; only generated CHAT text and
   card titles localize. */
import { t as tr, getLang, dateLocale } from '../core/i18n.js';
import { pickName } from '../core/placename.js';

/* ---------------- tiny utils ---------------- */

const esc = (s) => String(s ?? '');
const unit = () => window.__mausamState?.units ?? 'metric';
const t = (c, w = false) => fmtTemp(c, unit(), w);
const w = (k) => fmtWind(k, unit());

function placeName(state) {
  // v0.8.32: the reader's script — a place saved in one language still
  // greets correctly after a switch (lazy alt-name resolution).
  return pickName(state?.location) || tr('mt_place_fallback');
}

/** Language of this conversation turn (the engine is on-demand, so this is
    always current — unlike the fetch-time dashboard bake). */
const LANG = () => getLang();

/** Localized day label — prefers the snapshot's date (engine bakes EN labels
    for tests/dashboard), falls back to the baked label. */
function dayLab(d, i) {
  const idx = i ?? d?.i;
  if (d?.date && idx != null) {
    if (idx === 0) return tr('today');
    if (idx === 1) return tr('tomorrow');
    return new Date(`${d.date}T12:00:00`).toLocaleDateString(dateLocale(), { weekday: 'short' });
  }
  return d?.label ?? '';
}

const UV_KEY = { Low: 'mt_uv_low', Moderate: 'mt_uv_moderate', High: 'mt_uv_high', 'Very High': 'mt_uv_vhigh', Extreme: 'mt_uv_extreme' };
const BAND_KEY = { Good: 'mt_band_good', Fair: 'mt_band_fair', Poor: 'mt_band_poor' };

/** Stream pre-built full text word-by-word (abort-aware). */
async function stream(full, onText, signal) {
  const tokens = full.match(/\S+\s*|\s+/g) ?? [full];
  const CHUNK = 2;
  for (let i = 0; i < tokens.length; i += CHUNK) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    onText(tokens.slice(i, i + CHUNK).join(''));
    await new Promise((r) => setTimeout(r, 14));
  }
}

function block(payload) {
  return '\n```mausam-ui\n' + JSON.stringify(payload) + '\n```\n';
}

const fence = (c, d, title) => block({ v: 1, c, t: title ?? undefined, d });

/* ---------------- intents ---------------- */

const INTENTS = [
  { id: 'greet', kw: ['hello', ' hi ', 'hey', 'namaste', 'namaskar', ' yo ', 'kaise', 'kya haal', 'good morning', 'good evening', 'good night', 'नमस्ते', 'नमस्कार', 'कैसे हो', 'क्या हाल', 'सुप्रभात', 'शुभ संध्या'] },
  { id: 'help', kw: ['help', 'what can you do', 'kya kar sakte', 'options', 'who are you', 'tum kaun', 'commands', 'मदद', 'क्या कर सकते', 'कौन हो'] },
  { id: 'thanks', kw: ['thank', 'thanks', 'shukriya', 'dhanyavad', 'great job', 'nice work', 'awesome', 'धन्यवाद', 'शुक्रिया', 'थैंक'] },
  { id: 'rain', kw: ['rain', 'barish', 'baarish', 'umbrella', 'chhata', 'chatri', 'shower', 'drizzle', 'wet', ' precipitation', 'mm', 'बारिश', 'बरसात', 'बौछार', 'उमड़', 'गिरेगी', 'गिरेगा'] },
  { id: 'temp', kw: ['temperature', 'temp ', 'degree', 'hot', 'garmi', 'cold', 'thand', 'thandi', 'chill', 'warm', 'heat', 'तापमान', 'गर्मी', 'ठंड', 'गरम', 'ठंडा'] },
  { id: 'wear', kw: ['wear', 'clothes', 'clothing', 'kapde', 'dress', 'jacket', 'sweater', 'carry', 'pack', 'footwear', 'shoes', 'sunscreen', 'mask', 'पहन', 'कपड़े', 'जैकेट', 'स्वेटर', 'मास्क', 'सनस्क्रीन'] },
  { id: 'plan', kw: ['plan', 'picnic', 'outing', 'hangout', 'party', 'event', 'function', 'match', 'game', 'cricket', 'football', 'run', 'jog', 'walk', 'cycling', 'cycle', 'hike', 'trek', 'outdoor', 'workout', 'exercise', 'laundry', 'wash clothes', 'dry clothes', 'photoshoot', 'पिकनिक', 'घूमने', 'बाहर', 'दौड़', 'सैर', 'क्रिकेट', 'मैच', 'धुलाई', 'सुखाने', 'वर्कआउट', 'कसरत', 'योजना'] },
  { id: 'commute', kw: ['commute', 'office', 'work ', 'drive', 'driving', 'traffic', 'bike', 'scooter', 'metro', 'cab', 'bus ', 'train ', 'reach', 'ऑफिस', 'दफ़्तर', 'सवारी', 'यात्रा', 'ट्रैफ़िक', 'बाइक', 'मेट्रो', 'बस ', 'ट्रेन', 'पहुँच'] },
  { id: 'aqi', kw: ['aqi', 'air', 'pollution', 'smog', 'pm2', 'pm10', 'quality', 'polluted', 'mask ', 'एक्यूआई', 'वायु', 'प्रदूषण', 'धुंध', 'स्मॉग', 'हवा कैसी', 'हवा की गुणवत्ता'] },
  { id: 'sun', kw: ['sunrise', 'sunset', 'sun', 'moon', 'daylight', 'golden hour', 'dark', 'सूर्योदय', 'सूर्यास्त', 'सूरज', 'चांद', 'चाँद', 'दिन की लंबाई'] },
  { id: 'hours', kw: ['hourly', 'hours', 'timeline', 'next few hours', 'abhi ka', 'right now', 'ab ', 'this evening', 'this morning', 'tonight', 'afternoon', 'प्रति-घंटा', 'अगले घंटे', 'अगले कुछ घंटे', 'आज शाम', 'आज सुबह', 'आज रात', 'दोपहर'] },
  { id: 'week', kw: ['week', 'weekend', 'tomorrow', 'kal ', 'day after', 'sunday', 'saturday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'forecast', '7 day', 'seven day', 'outlook', 'next few days', 'सप्ताह', 'हफ़्ता', 'हफ्ता', 'वीकेंड', 'कल', 'परसों', 'रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'] },
  { id: 'wind', kw: ['wind', 'gust', 'hawa', 'humidity', 'sticky', 'muggy', 'nami', 'हवा', 'झोंका', 'नमी', 'उमस'] },
  /* v0.8.42 — "is this verified / can I trust it": the conversation earns
     the same witnesses the board's Cross-checked ledger shows. */
  { id: 'verify', kw: ['verif', 'accura', 'trust', 'cross-check', 'crosscheck', 'cross check', 'witness', 'real data', 'real number', 'which source', 'sources', 'सत्यापित', 'पक्का', 'भरोसा', 'गवाह', 'स्रोत'] },
  /* v0.8.50 — Mausam Core grows up: field/agronomy, UV exposure and
     day-over-day trend join the intent set. The live models already
     answer these from the system prompt; the keyless engine could not —
     a Hinglish spray question even derailed into a failed city lookup
     ("patwar" parsed as a place). Verify keeps supremacy over both. */
  { id: 'farm', kw: ['spray', 'irrigat', 'khet', 'fasal', 'crop', 'farm', 'field', 'harvest', 'sow', 'pesticide', 'urea', 'khad', 'fertilis', 'fertiliz', 'बुवाई', 'कटाई', 'सिंचाई', 'खेत', 'फसल', 'छिड़काव', 'खाद', 'किसान'] },
  { id: 'uv', kw: ['uv', 'sunburn', 'sunscreen', 'यूवी', 'सनबर्न'] },
  { id: 'trend', kw: ['yesterday', 'than today', 'compared to', 'difference', 'warmer', 'colder', 'hotter', 'cooler', 'beeta', 'guzra', 'बीता', 'गुज़रा', 'अंतर', 'तुलना'] },
];

function classify(text) {
  const q = ' ' + text.toLowerCase() + ' ';
  let best = { id: 'default', score: 0 };
  for (const intent of INTENTS) {
    let score = 0;
    for (const k of intent.kw) if (q.includes(k)) score += k.length > 5 ? 2 : 1;
    if (score > best.score) best = { id: intent.id, score };
  }
  // Activity verbs are strong signals — a run/jog/picnic question is a plan
  // question even when it also mentions "tomorrow" or "weekend". Devanagari
  // words carry no ASCII word chars, so \\b never fires on them — match plain.
  const STRONG_ACTIVITY = /\b(run|jog|jogging|cycl|cycling|hike|trek|workout|exercise|picnic|cricket|football|match|photoshoot|laundry)\b|दौड़|धुलाई|सुखाने|पिकनिक|क्रिकेट|कसरत/;
  if (best.id !== 'plan' && STRONG_ACTIVITY.test(q)) best = { id: 'plan', score: 99 };
  /* v0.8.42 — verification/trust questions override topical intents: an
     "is the AQI verified?" is about EVIDENCE, not about air quality.
     Devanagari alternatives sit outside \b (word boundaries never fire
     on Devanagari — the lesson v0.8.27 already encoded). */
  /* v0.8.54 FIX — the stems are PREFIXES of real words ('verif' only ever
     appears inside 'verified'/'verification'), so the trailing \b made
     them unmatchable and an explicit "...verified hai?" fell through the
     tie-break to whichever intent sits first (aqi). Evidence words now
     win on their own strength, as the supremacy rule always intended. */
  const STRONG_VERIFY = /\b(verif\w*|accura\w*|trust\w*|cross.?check\w*|witness\w*|disagree\w*|who wins|which source|real data|real number)\b|सत्यापित|पक्का|भरोसा|गवाह|स्रोत/;
  if (STRONG_VERIFY.test(q)) best = { id: 'verify', score: 100 };
  /* v0.8.50 — a spray/irrigation question with a stray place-sounding word
     ("patwar me paani") is FARMING, never a city lookup; the city guard in
     offlineChat() respects this override. Verify stays supreme. */
  const STRONG_FARM = /\b(spray|irrigat|harvest|pesticide|urea|fertilis|fertiliz|khet|fasal|sow)\b|खेत|फसल|सिंचाई|छिड़काव|खाद/;
  if (best.id !== 'verify' && STRONG_FARM.test(q)) best = { id: 'farm', score: 98 };
  /* "hotter than today?" must not drown in the week intent's 'tomorrow'. */
  const STRONG_TREND = /\b(hotter|colder|warmer|cooler)\s+than\b|\bthan\s+(yesterday|today)\b|\bcompared to\b|\bdifference between\b|बीता कल|गुज़रा कल/;
  if (best.id !== 'verify' && best.id !== 'farm' && STRONG_TREND.test(q)) best = { id: 'trend', score: 97 };
  return best;
}

/* v0.8.43 "every provider draws the ledger" — the verify-intent answer is
   a shared export now: classify() above stays the single source of truth
   (keyword scan + the STRONG_VERIFY override), and client.js calls this
   to guarantee the tool-less Z.ai preview path draws the same ledger
   whenever a question would be classified as evidence. */

/** Would this question be classified as verify/trust (evidence, not
    weather)? Delegates to classify() so the two can never drift apart. */
export function isVerifyQuestion(text) {
  return classify(String(text ?? '')).id === 'verify';
}

/** v0.8.50 — test seam: which intent would this text get? (classify() stays
    internal; the offline-intent suite pins behaviour, not spelling.) */
export function classifyIntent(text) {
  return classify(String(text ?? '')).id;
}

/* ---------------- v0.8.54 "the receipt strip" — per-source provenance ----------------
   The board answers "who said this" on every card; the chat only said it in
   the provider badge. Now every Mausam Core answer carries the SAME receipt
   grammar the Settings → Data sources rows use: one chip per source that
   actually fed THIS intent, with the age the data layer already computed.
   Chips exist only when their source truly contributed — never decoration. */

const RECEIPT_LABEL = { forecast: 'srcs_forecast', air: 'srcs_air', station: 'srcs_station', witness: 'srcs_witness' };

function receiptChip(k, fresh) {
  return { k, label: tr(RECEIPT_LABEL[k] ?? k), fresh: fresh ?? null, tone: 'ok' };
}

/** Which snapshot sources does each intent actually read? Kept in ONE
    place next to the builders so the chip can never claim a source the
    answer did not touch. verify draws its own ledger card — no chips. */
const INTENT_SOURCES = {
  greet: ['forecast'], help: [], thanks: [],
  rain: ['forecast'], temp: ['forecast'], wear: ['forecast', 'air'],
  plan: ['forecast', 'air'], commute: ['forecast'],
  aqi: ['air', 'station'], sun: ['forecast'], hours: ['forecast'],
  week: ['forecast'], wind: ['forecast'], farm: ['forecast'],
  uv: ['forecast'], trend: ['forecast'], default: ['forecast'], verify: [],
};

/** Receipt chips for a set of intents — union of their sources, each with
    the honest age. The station chip appears ONLY when the live monitor
    actually answered (st.ageMin is the reading's real age, not fetch age).
    v0.8.54 — also accepts RAW source keys ('forecast','air','station',
    'witness'): the Z.ai preview path declares what the model was FED, not
    which intent won, so it calls with keys directly. Unknown ids that are
    neither intents nor source keys contribute nothing (honest silence). */
export function answerReceipts(state, ids) {
  const s = state?.snapshot;
  if (!s || !Array.isArray(ids) || !ids.length) return [];
  const keys = [];
  for (const id of ids) {
    const mapped = INTENT_SOURCES[id];
    if (mapped) { for (const k of mapped) if (!keys.includes(k)) keys.push(k); }
    else if (RECEIPT_LABEL[id] && !keys.includes(id)) keys.push(id);
  }
  if (!keys.length) return [];
  const out = [];
  for (const k of keys) {
    if (k === 'forecast' || k === 'air') {
      out.push(receiptChip(k, s.fetchedAt != null ? relativeTime(s.fetchedAt) : null));
    } else if (k === 'station') {
      const st = state.station ?? s.bundle?.station ?? null;
      if (st?.ok && st.aqi != null) out.push(receiptChip(k, freshAgo(st.ageMin)));
    } else if (k === 'witness') {
      const wi = state.witness ?? s.bundle?.witness ?? null;
      if (wi?.ok) out.push(receiptChip(k, wi.fetchedAt != null ? relativeTime(wi.fetchedAt) : null));
    }
  }
  return out.slice(0, 4);
}

/* ---------------- v0.8.54 — compound questions, one composed answer ----------------
   "Will it rain today and what's the AQI?" used to answer HALF of itself:
   classify() picks ONE winner by score, and a single keyword tie broke
   toward whichever intent sits first in INTENTS. Real users ask two things
   in one breath — Hinglish especially ("... aur ...", "... ya ...").
   Compound mode splits the question into clauses, classifies each clause
   with the SAME classify(), and composes the winners' full answers in
   clause order — same builders, same cards, one turn. Supremacy rules
   survive: verify on the FULL question still wins, city questions still
   override, and a clause that is small talk is dropped, not amplified. */

const TOPICAL = new Set(['rain', 'temp', 'wear', 'plan', 'commute', 'aqi', 'sun', 'hours', 'week', 'wind', 'farm', 'uv', 'trend']);

/* ASCII conjunctions take \b; Devanagari never fires \b (the v0.8.27
   lesson), so और/या are matched with explicit space guards. */
const CLAUSE_SPLIT = /\?|।|\.|;|!|,|(?:\s+और\s+)|(?:\s+या\s+)|(?:\s+\b(?:and|aur|ya|or|also|plus)\s+)/gi;

export function compoundIntents(q) {
  const text = String(q ?? '');
  if (!text.trim()) return [];
  /* v0.8.55 — a fragment that classifies on its own survives however short
     it is ("aqi and uv?" kept losing UV to the old length>=3 filter). The
     ≥2-distinct-topics gate below still guards composition, so a lone
     short topic can never fire a compound by itself. */
  const clauses = text.split(CLAUSE_SPLIT).map((c) => c.trim()).filter((c) => c.length >= 3 || classify(c).score > 0);
  const out = [];
  for (const clause of clauses) {
    const id = classify(clause).id;
    if (TOPICAL.has(id) && !out.some((x) => x.id === id)) out.push({ id, clause });
  }
  return out;
}

/** One topical intent → its full single-topic answer (the SAME builder the
    single path uses). Conversational/verify/default ids return null. */
function singleBuild(id, state, q) {
  const p = state.profile ?? state.you ?? null;
  const youShim = p ? { name: p.name, commute: { am: p.schedule?.leaveAm ?? p.commute?.am, pm: p.schedule?.backPm ?? p.commute?.pm } } : null;
  switch (id) {
    case 'rain': return buildRain(state);
    case 'temp': return buildTemp(state, q);
    case 'wear': return buildWear(state);
    case 'plan': return buildPlan(state, q);
    case 'commute': return buildCommute(state, youShim);
    case 'aqi': return buildAqi(state, q);
    case 'sun': return buildSun(state);
    case 'hours': return buildHours(state);
    case 'week': return buildWeek(state);
    case 'wind': return buildWind(state);
    case 'farm': return buildFarm(state);
    case 'uv': return buildUv(state, q);
    case 'trend': return buildTrend(state);
    default: return null;
  }
}

/** Compose 2–3 topical answers: prose paragraphs in clause order, cards in
    the same order, and exactly ONE suggestion-chips row (the last part's)
    so a two-topic turn doesn't grow three stacked chip menus. */
function buildCompound(state, q, found) {
  const parts = (found ?? []).slice(0, 3)
    .map((f) => singleBuild(f.id, state, f.clause))
    .filter(Boolean);
  if (parts.length < 2) return null;
  /* v0.8.55 — the localized bridge: a bare '\n\n' reads like two answers
     pasted together; 'Also —' / 'और यह भी —' reads like ONE answer that
     took both halves seriously (same connective grammar a model uses). */
  const bridge = tr('mt_cx_bridge');
  const text = parts.map((p) => p.text).filter(Boolean).join(`\n\n${bridge} `);
  const comps = [];
  let pendingChips = null;
  for (const p of parts) {
    for (const c of (p.comps ?? []).filter(Boolean)) {
      if (c.includes('"c":"chips"')) { pendingChips = c; continue; }
      if (comps.length < 4) comps.push(c);
    }
  }
  if (pendingChips) comps.push(pendingChips);
  return { text, comps };
}

/* --- city extraction for weather-in-X / compare questions --- */
/* v0.8.27 — Devanagari city names: the Hindi suggestion chip asks
   "मुंबई का मौसम?" — the keyless engine must find Mumbai, not fall to the
   generic answer. A compact metro gazetteer maps the script to the ASCII
   name the geocoder already handles. Longest names first (नई दिल्ली ⊃ दिल्ली). */
const DEV_CITIES = [
  ['नई दिल्ली', 'New Delhi'], ['गुरुग्राम', 'Gurugram'], ['देहरादून', 'Dehradun'], ['चंडीगढ़', 'Chandigarh'],
  ['अहमदाबाद', 'Ahmedabad'], ['इलाहाबाद', 'Prayagraj'], ['प्रयागराज', 'Prayagraj'], ['बेंगलुरु', 'Bengaluru'],
  ['बैंगलोर', 'Bangalore'], ['गुवाहाटी', 'Guwahati'], ['अमृतसर', 'Amritsar'], ['लुधियाना', 'Ludhiana'],
  ['कोलकाता', 'Kolkata'], ['हैदराबाद', 'Hyderabad'], ['थिरुवनंतपुरम', 'Thiruvananthapuram'], ['विशाखापत्तनम', 'Visakhapatnam'],
  ['जयपुर', 'Jaipur'], ['लखनऊ', 'Lucknow'], ['कानपुर', 'Kanpur'], ['नागपुर', 'Nagpur'], ['भोपाल', 'Bhopal'],
  ['इंदौर', 'Indore'], ['पटना', 'Patna'], ['सूरत', 'Surat'], ['वाराणसी', 'Varanasi'], ['गोरखपुर', 'Gorakhpur'],
  ['रांची', 'Ranchi'], ['कोच्चि', 'Kochi'], ['मुंबई', 'Mumbai'], ['दिल्ली', 'Delhi'], ['चेन्नई', 'Chennai'],
  ['पुणे', 'Pune'], ['आगरा', 'Agra'], ['मेरठ', 'Meerut'], ['नोएडा', 'Noida'], ['शिमला', 'Shimla'],
];

/* v0.8.50 — weather vocabulary and units joined the stop-list: "What is
   AQI?" used to geocode the acronym and answer with Qaisumah, Saudi
   Arabia (real probe). Acronyms + topic nouns must never be places. */
const CITY_STOP = new Set(['Best', 'Tomorrow', 'Today', 'Will', 'What', 'How', 'Is', 'It', 'Hey', 'Hello', 'Mausam', 'IMD', 'The', 'And', 'For', 'Should', 'Air', 'Rain', 'Plan', 'Weekend', 'Week', 'Carry', 'Umbrella', 'Good', 'Thanks', 'Please', 'Can', 'Could', 'Do', 'Does', 'Am', 'PM', 'When', 'Where', 'Why', 'If', 'My', 'Me', 'We', 'Us', 'This', 'That', 'There', 'Then', 'Now', 'Kal', 'Aaj', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'AQI', 'UV', 'Uv', 'PM10', 'PM25', 'ET0', 'Humidity', 'Temperature', 'Feels', 'Wind', 'Gusts', 'Sunrise', 'Sunset', 'Forecast', 'Rainfall', 'Weather', 'Visibility', 'Monsoon', 'Heatwave', 'Smog']);
const PHRASE_STOP = /\b(run|walk|time|hour|day|week|me|my|i|you|today|tomorrow|evening|morning|night|out|clothes|wear|umbrella|air|rain|laundry|commute|office|plan|picnic|jacket|mask|sunscreen)\b/i;

function extractCities(text, currentName) {
  const cities = [];
  const push = (c) => {
    const city = String(c ?? '').replace(/\b(weather|mausam|forecast|temp|temperature|rain|aqi|uv|humidity|gusts?|sunrise|sunset|pm2(?:5|10)?)\b/gi, '').trim();
    if (city.length >= 3 && !PHRASE_STOP.test(city) && city.toLowerCase() !== String(currentName ?? '').toLowerCase() && !CITY_STOP.has(city.replace(/\b\w/g, (m) => m.toUpperCase()))) {
      cities.push(city);
    }
  };
  // Devanagari metro names → their ASCII geocoder names (longest first)
  for (const [dv, ascii] of DEV_CITIES) if (text.includes(dv)) push(ascii);
  // "weather in X", "temp at X", "forecast for X"
  const rx1 = /\b(?:weather|mausam|forecast|temperature|temp|rain)\s+(?:in|at|for)\s+([A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F\s.]{2,30}?)(?=[?.,!]|$|\s+(?:tomorrow|today|now|kal))/gi;
  let m;
  while ((m = rx1.exec(text))) push(m[1]);
  // "in Mumbai" / "at Mumbai" with a capitalised proper noun
  const rx2 = /\b(?:in|at)\s+([A-Z][a-zA-Z]{2,})\b/g;
  while ((m = rx2.exec(text))) push(m[1]);
  // compare: "X vs Y"
  const rx3 = /([A-Z][a-zA-Z]{2,})\s+(?:vs\.?|versus)\s+([A-Z][a-zA-Z]{2,})/g;
  while ((m = rx3.exec(text))) { push(m[1]); push(m[2]); }
  // capitalised proper nouns not at sentence start (fallback)
  if (!cities.length) {
    const words = text.split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      const w = words[i].replace(/[^A-Za-z]/g, '');
      if (/^[A-Z][a-zA-Z]{2,}$/.test(w) && !CITY_STOP.has(w)) push(w);
    }
  }
  return [...new Set(cities)].slice(0, 3);
}

/* ---------------- data helpers ---------------- */

/** "tomorrow"|"sunday"|… → day index in s.days (0=today). */
function dayIndex(kw, days) {
  const k = kw.trim().toLowerCase();
  if (k === 'tomorrow' || k === 'kal') return 1;
  if (k === 'day after') return 2;
  const map = { sunday: 'Sun', saturday: 'Sat', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri' };
  const want = map[k];
  if (want) {
    const i = days.findIndex((d) => d.label && d.label.toLowerCase().startsWith(want.toLowerCase()));
    if (i >= 0) return i;
  }
  return 0;
}

function nextHours(state, n) { return (state?.snapshot?.hours ?? []).slice(0, n); }

function rainStory(state) {
  const hours = nextHours(state, 18);
  if (!hours.length) return null;
  const pops = hours.map((h) => h.precipitation_probability ?? 0);
  const maxPop = Math.max(...pops);
  const firstWet = hours.find((h) => (h.precipitation_probability ?? 0) >= 40);
  const wetCount = pops.filter((p) => p >= 40).length;
  const peak = hours[pops.indexOf(maxPop)];
  return { maxPop, firstWet, peak, wetCount, hours };
}

function verdictRain(rs) {
  if (!rs) return tr('mt_rain_none');
  if (rs.maxPop >= 70) return tr('mt_rain_likely70');
  if (rs.maxPop >= 45) return tr('mt_rain_likely');
  if (rs.maxPop >= 25) return tr('mt_rain_pass');
  return tr('mt_rain_none');
}

function wearItems(state) {
  const s = state?.snapshot;
  if (!s) return [];
  const items = [];
  const h12 = nextHours(state, 12);
  const maxPop = Math.max(0, ...h12.map((h) => h.precipitation_probability ?? 0));
  const aqi = s.currentAqi?.aqi;
  const uv = s.now.uv;
  const hi = s.now.hi ?? s.now.feels;
  if (maxPop >= 40) items.push({ icon: 'umbrella', name: maxPop >= 70 ? tr('mt_w_umb_sure') : tr('mt_w_umb'), why: tr('mt_w_umb_why', { p: Math.round(maxPop) }) });
  if (hi >= 36) items.push({ icon: 'sun', name: tr('mt_w_sun'), why: tr('mt_w_sun_why', { t: t(hi, true) }) });
  if (hi >= 40) items.push({ icon: 'sun', name: tr('mt_w_cap'), why: tr('mt_w_cap_why') });
  if ((s.now.temp ?? 30) <= 12) items.push({ icon: 'shirt', name: tr('mt_w_warm'), why: tr('mt_w_warm_why', { t: t(s.now.temp, true) }) });
  else if ((s.days?.[1]?.temp_min ?? 99) <= 10) items.push({ icon: 'shirt', name: tr('mt_w_jacket'), why: tr('mt_w_jacket_why', { t: t(s.days[1].temp_min, true) }) });
  if (aqi != null && aqi >= 150) items.push({ icon: 'haze', name: tr('mt_w_mask'), why: tr('mt_w_mask_why', { a: aqi, cat: aqiCat(aqi, getLang()) }) });
  if (uv != null && uv >= 6) items.push({ icon: 'sun', name: tr('mt_w_shades'), why: tr('mt_w_shades_why', { u: Math.round(uv), l: s.uvNow?.label ? tr(UV_KEY[s.uvNow.label] ?? 'mt_uv_high') : tr('mt_uv_high') }) });
  if (!items.length) items.push({ icon: 'check', name: tr('mt_w_none'), why: tr('mt_w_none_why') });
  return items.slice(0, 5);
}

function windowsFor(state, scoreFn, span = 2, count = 2, horizon = 16) {
  const hours = nextHours(state, horizon).map((h) => ({ ...h, score: scoreFn(h) }));
  return bestWindows(hours, count, span).map((win) => {
    const a = hours[win.startIdx], b = hours[win.endIdx];
    const bd = band(win.avg);
    const reasons = [];
    reasons.push(tr('mt_reason_rain', { p: Math.round(a.precipitation_probability ?? 0) }));
    reasons.push(`${t(a.temperature_2m)}–${t(b.temperature_2m)}`);
    if ((a.aqi ?? 0) <= 100) reasons.push(`AQI ${a.aqi ?? '—'}`);
    if ((a.uv_index ?? 0) < 5) reasons.push(tr('mt_reason_lowuv'));
    return {
      slot: `${hourLabel(a.time)} – ${hourLabel(b.time)}`,
      rating: bd.label,
      color: bd.color,
      reason: reasons.join(' · '),
    };
  });
}

function commuteVerdict(state, startH, endH) {
  const list = nextHours(state, 24).filter((h) => {
    const hh = Number(h.time.slice(11, 13));
    return hh >= startH && hh <= endH;
  });
  if (!list.length) return null;
  const avg = Math.round(list.reduce((a, h) => a + driveScore(h), 0) / list.length);
  const maxRain = Math.max(...list.map((h) => h.precipitation_probability ?? 0));
  const minVis = Math.min(...list.map((h) => h.visibility ?? 99999));
  const storm = list.some((h) => [95, 96, 99].includes(h.weather_code));
  let mode;
  if (storm) mode = tr('mt_cm_storm');
  else if (maxRain >= 60) mode = tr('mt_cm_rain');
  else if (maxRain >= 35) mode = tr('mt_cm_showers');
  else if (minVis < 2000) mode = tr('mt_cm_vis');
  else mode = tr('mt_cm_smooth');
  return { slot: `${String(startH).padStart(2, '0')}:00–${String(endH).padStart(2, '0')}:00`, rating: band(avg).label, color: band(avg).color, reason: tr('mt_comm_reason', { p: maxRain, w: w(list[0].wind) }) , mode };
}

/* ---------------- answer builders ---------------- */

function buildGreet(state, you) {
  const n = state?.snapshot?.now;
  const hour = new Date().getHours();
  const gd = hour < 12 ? tr('mt_greet_morning') : hour < 17 ? tr('mt_greet_afternoon') : tr('mt_greet_evening');
  const name = you?.name ? `, ${you.name}` : '';
  if (!n) return { text: tr('mt_greet_load', { N: name }), comps: [] };
  return {
    text: tr('mt_greet_now', { N: name, gd, place: placeName(state), t: t(n.temp, true), wx: esc(wxText(n.wx, LANG())).toLowerCase() }),
    comps: [fence('chips', { items: [tr('sugg_rain'), tr('sugg_run'), tr('sugg_air')] })],
  };
}

function buildHelp() {
  return {
    text: tr('mt_help_intro'),
    /* v0.8.55 — the compound example rides second, teaching the
       two-topics-one-turn power right where the capabilities are listed. */
    comps: [fence('chips', { items: [tr('sugg_rain'), tr('mt_sugg_compound'), tr('mt_sugg_hours12'), tr('sugg_wear'), tr('sugg_run'), tr('mt_sugg_aqinow'), tr('sugg_city'), tr('mt_sugg_picnic'), tr('mt_sugg_sunset')] })],
  };
}

function buildThanks(_state) {
  return { text: tr('mt_thanks'), comps: [] };
}

function buildRain(state) {
  const rs = rainStory(state);
  if (!rs) return buildDefault(state);
  const comps = [];
  let text;
  if (rs.maxPop < 25) {
    text = tr('mt_rain_dry', { v: verdictRain(rs), place: placeName(state), p: Math.round(rs.maxPop), time: hourLabel(rs.peak.time) });
  } else {
    const v = verdictRain(rs);
    text = tr('mt_rain_wet', {
      V: LANG() === 'hi' ? v : v[0].toUpperCase() + v.slice(1),
      place: placeName(state), p: Math.round(rs.maxPop), time: hourLabel(rs.peak.time),
      first: rs.firstWet ? tr('mt_rain_first', { time: hourLabel(rs.firstWet.time) }) : '',
    });
  }
  comps.push(fence('rain-bars', {
    labels: rs.hours.slice(0, 12).map((h) => hourLabel(h.time, 'h12')),
    pops: rs.hours.slice(0, 12).map((h) => Math.round(h.precipitation_probability ?? 0)),
  }, tr('mt_card_rain12')));
  if (rs.maxPop >= 45) {
    comps.push(fence('advice', {
      tone: rs.maxPop >= 70 ? 'warn' : 'info',
      title: tr('mt_adv_quick'),
      items: [
        tr('mt_rain_adv1', { time: rs.firstWet ? hourLabel(rs.firstWet.time) : tr('mt_rain_noon') }),
        tr('mt_rain_adv2'),
        rs.peak?.precipitation != null && rs.peak.precipitation >= 2.5 ? tr('mt_rain_adv3h') : tr('mt_rain_adv3l'),
      ],
    }));
  }
  comps.push(fence('chips', { items: [tr('mt_sugg_hourly'), tr('mt_sugg_out'), tr('sugg_wear')] }));
  return { text, comps };
}

function buildTemp(state, q = '') {
  const s = state?.snapshot;
  if (!s) return buildDefault(state);
  const h24 = nextHours(state, 24);
  const feels = s.now.hi ?? s.now.feels;
  const explain = EXPLAIN_RX.test(q) && /feel/i.test(q) ? `${tr('mt_feels_def')} ` : '';
  const maxH = h24.reduce((a, h) => ((h.temperature_2m ?? -99) > (a.temperature_2m ?? -99) ? h : a), h24[0] ?? {});
  const minH = h24.reduce((a, h) => ((h.temperature_2m ?? 99) < (a.temperature_2m ?? 99) ? h : a), h24[0] ?? {});
  let verdict;
  if ((s.now.temp ?? 0) >= 38) verdict = tr('mt_temp_hot', { t: t(s.now.temp, true), f: t(feels, true) });
  else if ((s.now.temp ?? 99) <= 10) verdict = tr('mt_temp_cold', { t: t(s.now.temp, true), f: t(feels, true) });
  else verdict = tr('mt_temp_norm', { place: placeName(state), t: t(s.now.temp, true), f: t(feels, true), wx: esc(wxText(s.now.wx, LANG())).toLowerCase() });
  verdict = explain + verdict;
  if (maxH?.time && minH?.time && maxH.time !== minH.time) {
    verdict += tr('mt_temp_range', { lo: t(minH.temperature_2m), t1: hourLabel(minH.time), hi: t(maxH.temperature_2m), t2: hourLabel(maxH.time) });
  }
  const comps = [fence('temp-chart', {
    labels: h24.filter((_, i) => i % 3 === 0).map((h) => hourLabel(h.time, 'h12')),
    temps: h24.filter((_, i) => i % 3 === 0).map((h) => (h.temperature_2m != null ? Math.round(h.temperature_2m * 10) / 10 : null)),
    feels: h24.filter((_, i) => i % 3 === 0).map((h) => (h.feels != null ? Math.round(h.feels * 10) / 10 : null)),
    unit: unit() === 'imperial' ? '°F' : '°C',
  }, tr('mt_card_temp24'))];
  if ((s.now.uv ?? 0) >= 7 && (s.now.temp ?? 0) >= 33) {
    comps.push(fence('advice', { tone: 'warn', title: tr('mt_heat_title'), items: [tr('mt_heat1'), tr('mt_heat2'), tr('mt_heat3', { time: hourLabel(maxH.time) })] }));
  }
  return { text: verdict, comps };
}

function buildWear(state) {
  const items = wearItems(state);
  if (!items.length) return buildDefault(state);
  const s = state?.snapshot;
  return {
    text: tr('mt_wear_intro', { place: placeName(state), wx: esc(wxText(s?.now?.wx, LANG())).toLowerCase(), t: t(s?.now?.temp, true) }),
    comps: [fence('wear-list', { items }, tr('mt_card_wear')), fence('chips', { items: [tr('sugg_rain'), tr('mt_sugg_aqinow'), tr('sugg_run')] })],
  };
}

function buildPlan(state, text0) {
  const q = text0.toLowerCase();
  const s = state?.snapshot;
  if (!s) return buildDefault(state);

  const dayMatch = q.match(/sunday|saturday|monday|tuesday|wednesday|thursday|friday|tomorrow|kal |weekend|day after/);
  const isSport = /run|jog|cycl|hike|trek|workout|exercise|walk/.test(q);

  // activity + specific day → best windows within that day's hourly slice
  if (dayMatch && isSport) {
    const dIdx = dayIndex(dayMatch[0], s.days);
    const dayHours = dIdx === 0
      ? s.hours.slice(0, 24)
      : dIdx === 1
        ? s.hours.filter((h) => dIdx === 1 && s.days[1] && h.time.slice(0, 10) === s.days[1].date)
        : [];
    const target = s.days[dIdx];
    if (dayHours.length >= 3 && target) {
      const scored = dayHours.map((h) => ({ ...h, score: runScore(h) }));
      const wins = bestWindows(scored, 2, 2).map((w0) => {
        const a = scored[w0.startIdx], b = scored[w0.endIdx];
        const bd = band(w0.avg);
        return { slot: `${hourLabel(a.time)} – ${hourLabel(b.time)}`, rating: bd.label, color: bd.color, reason: `${tr('mt_reason_rain', { p: Math.round(a.precipitation_probability ?? 0) })} · ${t(a.temperature_2m)}–${t(b.temperature_2m)}${(a.aqi ?? 999) <= 150 ? ` · AQI ${a.aqi}` : ''}` };
      });
      return {
        text: tr('mt_run_check', { day: dayLab(target, dIdx), wx: esc(wxText(target.wx, LANG())).toLowerCase(), lo: t(target.temp_min), hi: t(target.temp_max), p: Math.round(target.precip_prob_max ?? 0), best: wins.length ? tr('mt_run_best', { slot: wins[0].slot }) : '' }),
        comps: [fence('window-card', { verdict: tr('mt_winverdict_sport'), windows: wins }, tr('mt_card_runwin', { day: dayLab(target, dIdx) }))],
      };
    }
    if (target) {
      const bd = band(dayScore(target));
      return {
        text: tr('mt_day_run', { day: dayLab(target, dIdx), wx: esc(wxText(target.wx, LANG())).toLowerCase(), lo: t(target.temp_min), hi: t(target.temp_max), p: Math.round(target.precip_prob_max ?? 0), band: tr(BAND_KEY[bd.label] ?? 'mt_band_fair') }),
        comps: [fence('chips', { items: [tr('mt_sugg_besttoday'), tr('sugg_wear')] })],
      };
    }
  }

  // laundry special
  if (/laundry|wash|dry clothes/.test(q)) {
    const dryHours = nextHours(state, 14).filter((h) => (h.precipitation_probability ?? 0) < 30 && (h.relative_humidity_2m ?? 100) < 70);
    const verdict = dryHours.length >= 6
      ? tr('mt_laundry_good', { n: dryHours.length })
      : dryHours.length >= 3 ? tr('mt_laundry_tight', { n: dryHours.length })
      : tr('mt_laundry_skip');
    return { text: verdict, comps: [fence('rain-bars', { labels: nextHours(state, 12).map((h) => hourLabel(h.time, 'h12')), pops: nextHours(state, 12).map((h) => Math.round(h.precipitation_probability ?? 0)) }, tr('mt_card_rain12'))] };
  }

  // day-picking (weekend / specific day)
  if (dayMatch && !/hour|time of day/.test(q)) {
    const d = s.days;
    const scored = d.map((x, i) => ({ ...x, i, score: dayScore(x) }));
    let target;
    if (/weekend/.test(q)) target = [...scored].filter((x) => /Sat|Sun/i.test(x.label) || x.i <= 6).sort((a, b) => b.score - a.score)[0];
    else {
      const kw = dayMatch[0];
      target = scored.find((x) => (kw === 'tomorrow' && x.i === 1) || (kw === 'day after' && x.i === 2) || (x.label && x.label.toLowerCase().includes(kw.slice(0, 3)))) ?? [...scored].sort((a, b) => b.score - a.score)[0];
    }
    const best = [...scored].sort((a, b) => b.score - a.score)[0];
    let text = tr('mt_day_pick', { day: dayLab(target, target.i), wx: esc(wxText(target.wx, LANG())).toLowerCase(), lo: t(target.temp_min), hi: t(target.temp_max), p: Math.round(target.precip_prob_max ?? 0) });
    text += target.i === best.i ? tr('mt_day_bestpick') : tr('mt_day_flex', { day: dayLab(best, best.i), wx: esc(wxText(best.wx, LANG())).toLowerCase(), p: Math.round(best.precip_prob_max ?? 0) });
    return {
      text,
      comps: [fence('daily-list', { days: d.slice(0, 7).map((x, i) => ({ label: dayLab(x, i), date: x.date, icon: x.wx?.icon, hi: Math.round(x.temp_max ?? 0), lo: Math.round(x.temp_min ?? 0), pop: Math.round(x.precip_prob_max ?? 0) })) }, tr('mt_card_week7')),
              fence('chips', { items: [tr('mt_sugg_beston', { d: dayLab(target, target.i) }), tr('sugg_wear')] })],
    };
  }

  // generic outdoor plan → windows
  const wins = windowsFor(state, isSport ? runScore : eventScore, 2, 2);
  const bd = band(wins[0]?.slot ? 70 : 50);
  return {
    text: wins.length
      ? tr(isSport ? 'mt_plan_win_sport' : 'mt_plan_win_out', { slot: wins[0].slot, tail: bd.label === 'Good' ? tr('mt_plan_tail_good') : tr('mt_plan_tail_ok') })
      : tr('mt_plan_thin'),
    comps: [fence('window-card', { verdict: isSport ? tr('mt_winverdict_sport') : tr('mt_winverdict_out'), windows: wins }, isSport ? tr('mt_card_train') : tr('mt_card_out')),
            fence('chips', { items: [tr('sugg_wear'), tr('sugg_rain')] })],
  };
}

function buildCommute(state, you) {
  const s = state?.snapshot;
  if (!s) return buildDefault(state);
  const parse = (v, fb) => {
    const m = String(v ?? '').match(/(\d{1,2})/);
    return m ? Math.max(0, Math.min(23, Number(m[1]))) : fb;
  };
  const am = parse(you?.commute?.am, 8);
  const pm = parse(you?.commute?.pm, 18);
  const morning = commuteVerdict(state, am, am + 1);
  const evening = commuteVerdict(state, pm, pm + 1);
  const windows = [morning, evening].filter(Boolean).map((c) => ({ slot: c.slot, rating: c.rating, reason: c.mode }));
  let text;
  if (!windows.length) text = tr('mt_comm_none');
  else {
    const rainAhead = nextHours(state, 12).some((h) => (h.precipitation_probability ?? 0) >= 50);
    text = rainAhead
      ? tr('mt_comm_rain', { slots: windows.map((x) => tr('mt_comm_slot', { slot: x.slot, rating: x.rating })).join(' · ') })
      : tr('mt_comm_ok', { slots: windows.map((x) => tr('mt_comm_slot', { slot: x.slot, rating: x.rating })).join(' · ') });
  }
  return { text, comps: [fence('window-card', { verdict: tr('mt_winverdict_commute'), windows }, tr('mt_card_commute')), fence('chips', { items: [tr('sugg_rain'), tr('sugg_wear')] })] };
}

/* v0.8.50 — "what is X?" teach-first mode: definition rides in front of
   the live value, so the keyless engine explains concepts the way the
   models do. Only fires on explicit explain phrasings. */
const EXPLAIN_RX = /\b(what is|what's|whats|explain|meaning of|kya hai|kya hota|samjhao|samjha)\b/i;

function buildAqi(state, q = '') {
  const s = state?.snapshot;
  if (!s) return buildDefault(state);
  const a = s.currentAqi;
  if (a?.aqi == null) return { text: tr('mt_aqi_none'), comps: [] };
  const explain = EXPLAIN_RX.test(q) ? `${tr('mt_aqi_def')} ` : '';
  const advice = [];
  if (a.aqi >= 200) advice.push(tr('mt_aqi_adv200'));
  if (a.aqi >= 300) advice.push(tr('mt_aqi_adv300'));
  if (a.aqi < 100) advice.push(tr('mt_aqi_advok'));
  /* v0.8.24: name the estimate for what it is. Oct–Feb, the CAMS model runs
     far below official CPCB stations around Indian cities — say so whenever
     it matters (any low-ish reading in the season), not as a footnote. */
  if (a.aqi < 150 && isPollutionSeason()) advice.push(tr('mt_aqi_advlow'));
  advice.push(tr('mt_aqi_dominant', { p: a.dominant ?? '—' }));
  /* v0.8.45: when the live CPCB monitor spoke, the air answer leads with
     the ground truth — number, distance and the SAME receipt grammar the
     board and the verify ledger use — instead of quoting only the model. */
  const st = state.station ?? s.bundle?.station ?? null;
  if (st?.ok && st.aqi != null) {
    let line = tr('mt_aqi_station', { name: st.station.name, km: st.station.distanceKm, st: st.aqi });
    const fresh = freshAgo(st.ageMin);
    if (fresh) line += ` · ${fresh}`;
    advice.unshift(line);
  }
  return {
    text: `${explain}${tr('mt_aqi_text', { place: placeName(state), a: a.aqi, cat: aqiCat(a.aqi, getLang()) })}`,
    comps: [fence('aqi-card', { aqi: a.aqi, category: a.category, dominant: a.dominant, advice: a.advice }, tr('mt_card_aqi')),
            fence('advice', { tone: a.aqi >= 250 ? 'danger' : a.aqi >= 150 ? 'warn' : 'good', items: advice }),
            fence('chips', { items: [tr('sugg_run'), tr('sugg_wear')] })],
  };
}

function buildSun(state) {
  const s = state?.snapshot;
  const sun = s?.sun;
  if (!sun) return buildDefault(state);
  const fmt = (iso) => (iso ? iso.slice(11, 16) : '—');
  const imd = state?.imd;
  return {
    text: tr('mt_sun_text', { place: placeName(state), sr: fmt(sun.sunrise), ss: fmt(sun.sunset), dl: sun.dayLength ? tr('mt_sun_dl', { n: sun.dayLength }) : '' }),
    comps: [fence('sun-card', { sunrise: fmt(sun.sunrise), sunset: fmt(sun.sunset), dayLength: sun.dayLength, source: imd?.ok ? imd.station?.name : undefined }, tr('mt_card_sun'))],
  };
}

function buildHours(state) {
  const hours = nextHours(state, 12);
  if (!hours.length) return buildDefault(state);
  const s = state?.snapshot;
  const nowWx = s?.now?.wx;
  const trend = hours.length > 3 && hours[8] && hours[0]
    ? (hours[8].temperature_2m - hours[0].temperature_2m)
    : null;
  let text = tr('mt_hours_text', { place: placeName(state), wx: esc(wxText(nowWx, LANG())).toLowerCase(), t: t(s?.now?.temp, true), trend: trend != null && Math.abs(trend) >= 2 ? tr(trend > 0 ? 'mt_hours_warm' : 'mt_hours_cool', { t: t(hours[8].temperature_2m), time: hourLabel(hours[8].time) }) : '' });
  return {
    text,
    comps: [fence('hourly-timeline', { hours: hours.map((h) => ({ time: hourLabel(h.time, 'h12'), temp: h.temperature_2m != null ? Math.round(h.temperature_2m) : null, pop: Math.round(h.precipitation_probability ?? 0), icon: h.wx?.icon })) }, tr('mt_card_hours')),
            fence('chips', { items: [tr('sugg_rain'), tr('mt_sugg_out')] })],
  };
}

function buildWeek(state) {
  const s = state?.snapshot;
  if (!s?.days?.length) return buildDefault(state);
  const scored = s.days.map((d, i) => ({ ...d, i, sc: dayScore(d) }));
  const best = [...scored].sort((a, b) => b.sc - a.sc)[0];
  const worst = [...scored].sort((a, b) => a.sc - b.sc)[0];
  const wettest = [...s.days].sort((a, b) => (b.precip_prob_max ?? 0) - (a.precip_prob_max ?? 0))[0];
  const wettestI = s.days.indexOf(wettest);
  let text = tr('mt_week_text', { d: dayLab(best, best.i), wx: esc(wxText(best.wx, LANG())).toLowerCase(), lo: t(best.temp_min), hi: t(best.temp_max), rest: (worst.i !== best.i ? tr('mt_week_rough', { d: dayLab(worst, worst.i) }) : '') + ((wettest.precip_prob_max ?? 0) >= 40 ? tr('mt_week_wet', { d: dayLab(wettest, wettestI), p: Math.round(wettest.precip_prob_max) }) : '') });
  return {
    text,
    comps: [fence('daily-list', { days: s.days.map((d, i) => ({ label: dayLab(d, i), date: d.date, icon: d.wx?.icon, hi: Math.round(d.temp_max ?? 0), lo: Math.round(d.temp_min ?? 0), pop: Math.round(d.precip_prob_max ?? 0) })) }, tr('mt_card_week7')),
            fence('chips', { items: [tr('sugg_weekend'), tr('mt_week_pack', { d: dayLab(worst, worst.i) })] })],
  };
}

/* ---------------- v0.8.50 — Mausam Core grows up ----------------
   Three answer builders the live models had but the keyless engine
   never did: field/agronomy (soil moisture + spray windows), UV
   exposure, and day-over-day trend. All draw from the SAME snapshot
   fields the system prompt teaches the models, through the SAME
   MausamUI contract — one brain, two sizes. */

function soilNow(state) {
  const h0 = state?.snapshot?.hours?.[0];
  if (!h0 || h0.soil_moisture_0_to_1cm == null) return null;
  return {
    top: h0.soil_moisture_0_to_1cm,
    root: h0.soil_moisture_3_to_9cm ?? h0.soil_moisture_0_to_1cm,
    tempC: h0.soil_temperature_0_to_7cm,
    et0: h0.et0_fao_evapotranspiration,
  };
}

/** Spray-window score: calm wind + dry hours + the cooler edges of the
    day. Same bestWindows() machinery the sport/outing planners use. */
function sprayScore(h) {
  const wind = h.wind ?? 99;
  const pop = h.precipitation_probability ?? 0;
  const hr = Number(String(h.time ?? '').slice(11, 13));
  let sc = 0;
  if (wind <= 15) sc += 55; else if (wind <= 25) sc += 20;
  if (pop < 30) sc += 40;
  if (hr >= 6 && hr <= 10) sc += 8;
  else if (hr >= 16 && hr <= 19) sc += 6;
  return sc;
}

function buildFarm(state) {
  const s = state?.snapshot;
  if (!s) return buildDefault(state);
  const soil = soilNow(state);
  const hours = nextHours(state, 12);
  const wins = hours.length >= 3 ? windowsFor(state, sprayScore, 2, 2, 12) : [];
  const maxPop12 = Math.max(0, ...hours.map((h) => h.precipitation_probability ?? 0));
  const comps = [];
  let text;
  if (soil) {
    const top = soil.top.toFixed(2);
    const root = soil.root.toFixed(2);
    if (soil.top < 0.15) text = tr('mt_farm_dry', { top, root });
    else if (soil.top > 0.35) text = tr('mt_farm_wet', { top });
    else text = tr('mt_farm_ok', { top, root });
    comps.push(fence('metrics-grid', { items: [
      { label: tr('mt_m_soiltop'), value: top, icon: 'droplet' },
      { label: tr('mt_m_soilroot'), value: root, icon: 'droplet' },
      ...(soil.tempC != null ? [{ label: tr('mt_m_soiltemp'), value: t(soil.tempC), icon: 'thermo' }] : []),
      ...(soil.et0 != null ? [{ label: tr('mt_m_et0'), value: `${soil.et0.toFixed(2)} mm/h`, icon: 'sun' }] : []),
    ] }, tr('mt_card_soil')));
  } else {
    text = tr('mt_farm_nosoil');
  }
  comps.push(fence('advice', { tone: 'info', title: tr('mt_farm_spray_title'), items: [
    tr('mt_farm_adv_wind', { w: w(15) }),
    tr('mt_farm_adv_rain', { p: 30, p2: Math.round(maxPop12) }),
    soil && soil.top < 0.15 ? tr('mt_farm_adv_irr', { time: tr('mt_farm_evening') }) : tr('mt_farm_adv_hold'),
  ] }));
  if (wins.length) comps.push(fence('window-card', { verdict: tr('mt_farm_winverdict'), windows: wins }, tr('mt_card_spray')));
  comps.push(fence('chips', { items: [tr('sugg_rain'), tr('sugg_air')] }));
  return { text, comps };
}

function buildUv(state, q = '') {
  const s = state?.snapshot;
  if (!s) return buildDefault(state);
  const uv = s.now.uv;
  const uvMax = s.days?.[0]?.uv_max ?? uv;
  if (uv == null && uvMax == null) return buildDefault(state);
  const lead = uv ?? uvMax;
  const bandKey = lead >= 11 ? 'mt_uv_extreme' : lead >= 8 ? 'mt_uv_vhigh' : lead >= 6 ? 'mt_uv_high' : lead >= 3 ? 'mt_uv_moderate' : 'mt_uv_low';
  const one = (v) => (v == null ? '—' : String(Math.round(v * 10) / 10));
  const text = `${EXPLAIN_RX.test(q) ? `${tr('mt_uv_def')} ` : ''}${tr('mt_uv_text', { place: placeName(state), u: one(uv), m: one(uvMax), band: tr(bandKey) })}`;
  return {
    text,
    comps: [fence('metrics-grid', { items: [
      { label: tr('mt_m_uv'), value: one(uv), icon: 'sun' },
      { label: tr('mt_m_uvmax'), value: one(uvMax), icon: 'sun' },
    ] }, tr('mt_card_uv')),
      fence('advice', { tone: lead >= 8 ? 'warn' : 'info', title: tr('mt_card_uv'), items: [tr('mt_uv_adv1'), tr('mt_uv_adv2')] }),
      fence('chips', { items: [tr('sugg_wear'), tr('sugg_run')] })],
  };
}

function buildTrend(state) {
  const s = state?.snapshot;
  const days = s?.days;
  if (!days || days.length < 2) return buildDefault(state);
  const a = days[0];
  const b = days[1];
  const dMax = Math.round((b.temp_max ?? 0) - (a.temp_max ?? 0));
  const dMin = Math.round((b.temp_min ?? 0) - (a.temp_min ?? 0));
  const dPop = Math.round((b.precip_prob_max ?? 0) - (a.precip_prob_max ?? 0));
  const sign = (v) => `${v > 0 ? '+' : ''}${v}°`;
  const head = Math.abs(dMax) < 2 ? tr('mt_trend_same') : dMax > 0 ? tr('mt_trend_warm', { d: sign(dMax) }) : tr('mt_trend_cool', { d: sign(dMax) });
  const text = `${head} ${tr('mt_trend_text', { lo: sign(dMin), p: sign(dPop) })}`;
  return {
    text,
    comps: [fence('compare-table', {
      columns: ['', tr('today'), tr('tomorrow')],
      rows: [
        [tr('mt_trend_high'), t(a.temp_max), t(b.temp_max)],
        [tr('mt_trend_low'), t(a.temp_min), t(b.temp_min)],
        [tr('mt_trend_rain'), `${Math.round(a.precip_prob_max ?? 0)}%`, `${Math.round(b.precip_prob_max ?? 0)}%`],
      ],
    }, tr('mt_card_trend')),
      fence('chips', { items: [tr('sugg_weekend'), tr('sugg_run')] })],
  };
}

function buildWind(state) {
  const s = state?.snapshot;
  if (!s) return buildDefault(state);
  const dir = s.now.wind_dir;
  const compass = dir != null ? ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(dir / 22.5) % 16] : '';
  return {
    text: tr('mt_wind_text', { w: w(s.now.wind), dir: compass || '—', gusts: s.now.gusts ? tr('mt_wind_gust', { g: w(s.now.gusts) }) : '', h: Math.round(s.now.humidity ?? 0), feel: (s.now.humidity ?? 0) > 70 ? tr('mt_wind_humid') : (s.now.humidity ?? 0) < 30 ? tr('mt_wind_dry') : tr('mt_wind_ok') }),
    comps: [fence('metrics-grid', { items: [
      { label: tr('mt_m_wind'), value: w(s.now.wind), icon: 'wind' },
      { label: tr('mt_m_gusts'), value: s.now.gusts ? w(s.now.gusts) : '—', icon: 'wind' },
      { label: tr('mt_m_humidity'), value: `${Math.round(s.now.humidity ?? 0)}%`, icon: 'droplet' },
      { label: tr('mt_m_pressure'), value: s.now.pressure ? `${Math.round(s.now.pressure)} hPa` : '—', icon: 'compass' },
    ] }, tr('mt_card_conditions'))],
  };
}

async function buildCity(state, text0) {
  const cities = extractCities(text0, state?.location?.name);
  if (!cities.length) return null;
  /* v0.8.54 — a city answer's provenance is the CITY snapshot it fetched
     (its own fetchedAt), not the home snapshot the chips would otherwise
     quote. Composed here because answerReceipts() reads the HOME state. */
  const cityReceipt = (snap) => (snap?.fetchedAt != null
    ? [receiptChip('forecast', relativeTime(snap.fetchedAt))]
    : []);
  if (/compare|vs|versus|better|and\b/i.test(text0) && cities.length >= 2) {
    const [a, b] = cities;
    const [sa, sb] = await Promise.all([
      fetchCitySnapshot(a).catch(() => null),
      fetchCitySnapshot(b).catch(() => null),
    ]);
    if (!sa || !sb) return { text: tr('mt_city_fail', { c: !sa ? a : b }), comps: [] };
    const rows = [
      [tr('mt_cr_now'), `${t(sa.now.temp)} ${wxText(sa.now.wx, LANG())}`, `${t(sb.now.temp)} ${wxText(sb.now.wx, LANG())}`],
      [tr('mt_cr_feels'), t(sa.now.feels, true), t(sb.now.feels, true)],
      [tr('mt_cr_rain'), tr('mt_cr_rainv', { p: Math.round(Math.max(0, ...sa.hours.slice(0, 12).map((h) => h.precipitation_probability ?? 0))) }), tr('mt_cr_rainv', { p: Math.round(Math.max(0, ...sb.hours.slice(0, 12).map((h) => h.precipitation_probability ?? 0))) })],
      [tr('mt_cr_today'), `${t(sa.days?.[0]?.temp_min)}–${t(sa.days?.[0]?.temp_max)}`, `${t(sb.days?.[0]?.temp_min)}–${t(sb.days?.[0]?.temp_max)}`],
      ['AQI', sa.currentAqi?.aqi != null ? `${sa.currentAqi.aqi} ${aqiCat(sa.currentAqi.aqi, getLang())}` : '—', sb.currentAqi?.aqi != null ? `${sb.currentAqi.aqi} ${aqiCat(sb.currentAqi.aqi, getLang())}` : '—'],
    ];
    return {
      text: tr('mt_city_vs', { a: sa.locationLabel, b: sb.locationLabel }),
      comps: [fence('compare-table', { columns: ['', sa.locationLabel.split(',')[0], sb.locationLabel.split(',')[0]], rows }, tr('mt_card_compare')),
              fence('chips', { items: [tr('mt_sugg_weatherof', { c: sa.locationLabel.split(',')[0] }), tr('mt_sugg_weatherof', { c: sb.locationLabel.split(',')[0] })] })],
      receipts: cityReceipt(sa),
    };
  }
  const snap = await fetchCitySnapshot(cities[0]).catch(() => null);
  if (!snap) return { text: tr('mt_city_notfound', { c: cities[0] }), comps: [] };
  const n = snap.now;
  const pop12 = Math.round(Math.max(0, ...snap.hours.slice(0, 12).map((h) => h.precipitation_probability ?? 0)));
  return {
    text: tr('mt_city_now', { place: snap.locationLabel, t: t(n.temp, true), wx: esc(wxText(n.wx, LANG())).toLowerCase(), f: t(n.feels, true), p: pop12, lo: t(snap.days?.[0]?.temp_min), hi: t(snap.days?.[0]?.temp_max) }),
    comps: [fence('now-card', {
      place: snap.locationLabel, temp: n.temp != null ? Math.round(n.temp) : null, feels: n.feels != null ? Math.round(n.feels) : null,
      cond: wxText(n.wx, LANG()), icon: n.wx?.icon, hi: snap.days?.[0]?.temp_max != null ? Math.round(snap.days[0].temp_max) : null, lo: snap.days?.[0]?.temp_min != null ? Math.round(snap.days[0].temp_min) : null,
      humidity: n.humidity, wind: n.wind,
    }, tr('mt_card_rightnow', { c: cities[0] })),
      fence('chips', { items: [tr('mt_sugg_cmpwith', { a: cities[0], b: state?.location?.name ?? tr('mt_place_fallback') }), tr('mt_sugg_rainthere')] })],
    receipts: cityReceipt(snap),
  };
}

/* ---------------- v0.8.42 — the conversation vouches ---------------- */
/* "Is this verified?" gets the SAME answer the board's Cross-checked
   ledger shows: temperature against the NASA POWER × ERA5 settled-day
   pair, air quality against the live CPCB station — compareAqi() is the
   SAME function the board calls, so the chat can never contradict the
   card. Rows exist only when their witness spoke; a warning row pulls
   the matching "who wins" rule into the prose, exactly when it matters. */
/* v0.8.43 "every provider draws the ledger" — the row builder is a pure
   export now: the offline engine, the Gemini tool path and the Z.ai
   preview path all draw the SAME rows from the SAME state through the
   SAME compareAqi(), so a provider can no longer skip (or invent)
   verification evidence. Rows exist only when their witness spoke. */
export function verifyLedgerRows(state) {
  const s = state?.snapshot;
  if (!s) return [];
  const witness = state.witness ?? s.bundle?.witness ?? null;
  const station = state.station ?? s.bundle?.station ?? null;
  const modelAqi = s.currentAqi?.aqi ?? null;
  const stOk = Boolean(station?.ok && station.aqi != null);

  const rows = [];
  if (witness?.ok) {
    const agree = Boolean(witness.agree);
    rows.push({
      label: tr('xcheck_temp_label', { date: dateLabel(witness.day) }),
      detail: agree
        ? tr('xcheck_temp_ok', { a: Number(witness.powerT).toFixed(1), b: Number(witness.era5T).toFixed(1), d: witness.delta })
        : tr('xcheck_temp_split', { a: Number(witness.powerT).toFixed(1), b: Number(witness.era5T).toFixed(1), d: witness.delta }),
      verdict: agree ? 'ok' : 'warn',
    });
  }
  if (modelAqi != null && stOk) {
    const v = compareAqi(modelAqi, station.aqi);
    if (v.ok) {
      /* v0.8.45: the receipt rides along — a station answer is only as
         convincing as its age, and the board's own row shows the same. */
      const fresh = freshAgo(station.ageMin);
      rows.push({
        label: tr('xcheck_aqi_label'),
        detail: (v.verdict === 'agree'
          ? tr('xcheck_aqi_ok', { m: modelAqi, name: station.station.name, st: station.aqi, d: v.delta })
          : tr('xcheck_aqi_mild', { m: modelAqi, name: station.station.name, st: station.aqi }))
          + (fresh ? ` · ${fresh}` : ''),
        verdict: v.verdict === 'agree' ? 'ok' : 'warn',
      });
    }
  } else if (modelAqi != null && station?.error?.kind === 'stale') {
    rows.push({ label: tr('xcheck_aqi_label'), detail: tr('xcheck_aqi_only', { m: modelAqi }), verdict: 'info' });
  }
  return rows;
}

/** v0.8.43 — the whole ledger as ONE streamable mausam-ui fence; '' when
    no witness has spoken (callers show the honest "still landing" state
    instead — never an empty card). Title and rows localize through the
    same tr() keys the offline engine and the board already use. */
export function verifyCardFence(state) {
  const rows = verifyLedgerRows(state);
  if (!rows.length) return '';
  return fence('verify-card', { rows }, tr('xcheck_title'));
}

function buildVerify(state, q) {
  const s = state?.snapshot;
  if (!s) return { text: tr('mt_verify_wait'), comps: [] };
  const rows = verifyLedgerRows(state);
  /* No witness has spoken yet (checks still landing / all unavailable):
     say so honestly — never draw an empty ledger. */
  if (!rows.length) return { text: tr('mt_verify_wait'), comps: [] };

  const witness = state.witness ?? s.bundle?.witness ?? null;
  /* Prose leads with the claim, then — only when the reader's question is
     about trust, or a witness actually warned — the "who wins" rule. */
  const asksTrust = /disagree|trust|wins|source|conflict|भरोसा|किसकी|स्रोत/i.test(q);
  let text = tr('mt_verify_text', { place: placeName(state) });
  const warnedTemp = witness?.ok && !witness.agree;
  const warnedAqi = rows.some((r) => r.verdict === 'warn' && r.label === tr('xcheck_aqi_label'));
  if (asksTrust || warnedTemp) text += ` ${tr('mt_verify_trust_temp')}`;
  if (asksTrust || warnedAqi) text += ` ${tr('mt_verify_trust_aqi')}`;

  return {
    text,
    comps: [
      fence('verify-card', { rows }, tr('xcheck_title')),
      fence('chips', { items: [tr('sugg_air'), tr('sugg_rain')] }),
    ],
  };
}

function buildDefault(state) {
  const s = state?.snapshot;
  if (!s) return { text: tr('mt_def_loading'), comps: [] };
  const n = s.now;
  const rs = rainStory(state);
  return {
    text: tr('mt_def_text', { place: placeName(state), t: t(n.temp, true), wx: esc(wxText(n.wx, LANG())).toLowerCase(), f: t(n.feels, true), v: verdictRain(rs), aqi: s.currentAqi?.aqi != null ? `AQI ${s.currentAqi.aqi} (${aqiCat(s.currentAqi.aqi, getLang())})` : '—' }),
    comps: [fence('now-card', {
      place: state.location?.name, temp: n.temp != null ? Math.round(n.temp) : null, feels: n.feels != null ? Math.round(n.feels) : null,
      cond: wxText(n.wx, LANG()), icon: n.wx?.icon, hi: s.days?.[0]?.temp_max != null ? Math.round(s.days[0].temp_max) : null, lo: s.days?.[0]?.temp_min != null ? Math.round(s.days[0].temp_min) : null,
      humidity: n.humidity, wind: n.wind,
    }),
      fence('chips', { items: [tr('sugg_rain'), tr('sugg_run'), tr('mt_sugg_aqinow'), tr('sugg_wear')] })],
  };
}

/* ---------------- public API ---------------- */

/**
 * Local answer pipeline — same shape as the model providers.
 * @param {Object} opts {userText, onText, signal, getState}
 */
export async function offlineChat(opts) {
  const { userText, onText, signal, getState } = opts;
  const state = getState?.() ?? {};
  const q = String(userText ?? '');

  const intent = classify(q);
  let built = null;
  let builtIds = null; // intents the final answer actually served (→ receipts)

  // city questions override topical intents — a Devanagari metro name in the
  // question is just as cityish as "weather in Mumbai" (v0.8.27)
  const cityish = /\b(?:vs\.?|versus|compare)\b/i.test(q) ||
    /\b(?:weather|mausam|forecast|temp|temperature|rain)\s+(?:in|at|for)\s+\S/i.test(q) ||
    DEV_CITIES.some(([dv]) => q.includes(dv)) ||
    (() => { const w = q.split(/\s+/); for (let i = 1; i < w.length; i++) { const x = w[i].replace(/[^A-Za-z]/g, ''); if (/^[A-Z][a-zA-Z]{2,}$/.test(x) && !CITY_STOP.has(x)) return true; } return false; })();
  if (cityish && !/^(greet|help|thanks|farm|uv)$/.test(intent.id)) {
    try {
      built = await buildCity(state, q);
    } catch { built = null; }
  }

  /* v0.8.54 — compound mode: ≥2 distinct topical clauses compose one answer.
     verify keeps supremacy (evidence is not a second topic); greet/help/
     thanks clauses are dropped by TOPICAL, never amplified. */
  if (!built && intent.id !== 'verify') {
    const found = compoundIntents(q);
    if (found.length >= 2) {
      built = buildCompound(state, q, found);
      if (built) builtIds = found.map((f) => f.id);
    }
  }

  if (!built) {
    // v1-shape shim so buildGreet/buildCommute keep working with the v2 profile
    const p = state.profile ?? state.you ?? null;
    const youShim = p ? { name: p.name, commute: { am: p.schedule?.leaveAm ?? p.commute?.am, pm: p.schedule?.backPm ?? p.commute?.pm } } : null;
    switch (intent.id) {
      case 'greet': built = buildGreet(state, youShim); break;
      case 'help': built = buildHelp(); break;
      case 'thanks': built = buildThanks(state); break;
      case 'verify': built = buildVerify(state, q); break;
      default: built = singleBuild(intent.id, state, q) ?? buildDefault(state); break;
    }
    builtIds = [intent.id];
  }

  const full = `${built.text}\n${built.comps.filter(Boolean).join('\n')}`;
  await stream(full, onText, signal);
  /* v0.8.54 — the receipt strip: exactly the sources this answer used.
     A city build quotes its own snapshot's freshness; verify draws its
     ledger card (the chips would repeat it). */
  const receipts = Array.isArray(built.receipts)
    ? built.receipts
    : answerReceipts(state, builtIds ?? []);
  return { usedTools: [], receipts };
}

export function offlineErrorCopy() {
  return { title: tr('mt_err_title'), text: tr('mt_err_text') };
}

/** Keep runTool reachable for future expansions. */
export { runTool };
