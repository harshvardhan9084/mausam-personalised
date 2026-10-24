/**
 * prompt.js — system prompt builder for Mausam Mitra.
 *
 * Injects: identity, the MausamUI contract, a compact live-data snapshot,
 * the user's personalisation context, and strict honesty rules.
 * The AI decides presentation: text when text is enough, rich cards when
 * they genuinely communicate better.
 */

import { CONTRACT_VERSION } from './contract.js';

const round = (v, d = 0) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(d)));
const hhmm = (iso) => (iso ? iso.slice(11, 16) : null);
const hh = (iso) => {
  const h = Number(iso?.slice(11, 13));
  return Number.isFinite(h) ? (h % 12 === 0 ? 12 : h % 12) + (h >= 12 ? ' PM' : ' AM') : null;
};

/**
 * Compact the app snapshot into a token-cheap, factual JSON the model can
 * reason over. Metric units only (the prompt tells the model how to convert).
 */
export function compactSnapshot(state) {
  const s = state.snapshot;
  if (!s) return null;
  const loc = state.location;
  const next24 = s.hours.slice(0, 24);
  const pops = next24.map((h) => h.precipitation_probability ?? 0);

  const wetHours = next24
    .filter((h) => (h.precipitation_probability ?? 0) >= 40)
    .slice(0, 6)
    .map((h) => ({ at: hh(h.time), pop: Math.round(h.precipitation_probability), mm: round(h.precipitation, 1) }));

  return {
    place: [loc?.name, loc?.admin1, loc?.country].filter(Boolean).join(', ') || 'unknown location',
    localTime: new Date().toLocaleString('en-IN', { timeZone: s.timezone, hour: 'numeric', minute: '2-digit', hour12: true }),
    now: {
      tempC: round(s.now.temp, 1),
      feelsC: round(s.now.feels, 1),
      condition: s.now.wx?.label,
      icon: s.now.wx?.icon,
      humidity: round(s.now.humidity),
      windKmh: round(s.now.wind),
      windDir: s.now.wind_dir,
      gustKmh: round(s.now.gusts),
      isDay: s.now.is_day,
      uvIndex: round(s.now.uv, 1),
      visibilityKm: s.now.visibility != null ? Math.round(s.now.visibility / 100) / 10 : null,
      cloudPct: round(s.now.cloud),
    },
    aqi: s.currentAqi?.aqi != null
      ? { cpcbAqi: s.currentAqi.aqi, category: s.currentAqi.category, dominant: s.currentAqi.dominant }
      : null,
    rainToday: {
      maxPop: pops.length ? Math.max(...pops) : null,
      nextWetHours: wetHours,
    },
    next24h: next24.filter((_, i) => i % 2 === 0).map((h) => ({
      at: hh(h.time),
      tempC: round(h.temperature_2m),
      feelsC: round(h.feels ?? h.hi),
      pop: Math.round(h.precipitation_probability ?? 0),
      cond: h.wx?.label,
    })),
    next7days: s.days.map((d) => ({
      day: d.label,
      icon: d.wx?.icon,
      cond: d.wx?.label,
      maxC: round(d.temp_max),
      minC: round(d.temp_min),
      rainPop: Math.round(d.precip_prob_max ?? 0),
      rainMm: round(d.precipitation_sum, 1),
      uvMax: round(d.uv_max, 1),
      windMaxKmh: round(d.wind_max),
      sunrise: hhmm(d.sunrise),
      sunset: hhmm(d.sunset),
    })),
    sun: s.sun ? { sunrise: hhmm(s.sun.sunrise), sunset: hhmm(s.sun.sunset), dayLength: s.sun.dayLength } : null,
    dataSource: state.imd?.ok ? 'IMD official (enriched) + Open-Meteo' : 'Open-Meteo',
  };
}

/** Personalisation block — additive context only. */
function personalBlock(you) {
  if (!you) return '';
  const bits = [];
  if (you.name) bits.push(`Name: ${you.name}`);
  if (you.commute?.am) bits.push(`Morning commute: ~${you.commute.am}`);
  if (you.commute?.pm) bits.push(`Evening commute: ~${you.commute.pm}`);
  if (Array.isArray(you.activities) && you.activities.length) bits.push(`Interests: ${you.activities.join(', ')}`);
  const sens = Object.entries(you.sensitive ?? {}).filter(([, v]) => v).map(([k]) => k);
  if (sens.length) bits.push(`Sensitive to: ${sens.join(', ')} — add one considerate, concrete tip when relevant`);
  return `\n\n## User context (personalisation — ADDITIVE, optional to use)\n${bits.join('\n')}`;
}

/**
 * Build the full system prompt.
 * @param {Object} state window.__mausamState-like
 */
export function buildSystemPrompt(state) {
  const snap = compactSnapshot(state);
  const unitLine = state.units === 'imperial'
    ? 'The user prefers imperial units — convert °C→°F and km/h→mph in ALL text you write.'
    : 'The user prefers metric units (°C, km/h).';

  return `You are **Mausam Mitra**, the weather assistant inside the Mausam app — warm, sharp, a little playful, and completely honest about data. You talk like a knowledgeable Indian friend: short sentences, everyday words, Hinglish welcome if the user uses it.

## Hard rules
1. ${unitLine}
2. NEVER invent weather numbers. Use ONLY the DATA block below and tool results. If something isn't in the data, say so plainly and offer what you do have.
3. Keep prose SHORT — 2–5 sentences unless the user asks for depth. No headings, no tables in markdown. Bold key numbers with **…**.
4. If the user asks about another city, call the \`get_city_weather\` tool first; then answer. If a tool fails, say what happened and answer from what you have.
5. You are data-aware: the DATA block is the live situation for ${snap?.place ?? 'the user\'s location'}. Treat it as ground truth for "now".
6. Never give medical advice; frame heat/air warnings practically (shade, hydration, masks, timing).

## MausamUI — rich response contract (v${CONTRACT_VERSION})
Choose presentation deliberately: **plain text when text is enough, a visual component when it communicates better.** Most short answers need zero or one card. Never repeat the same numbers twice (prose + card both listing everything is noise).

To emit a card, drop this fenced block anywhere between your sentences:

\`\`\`${'mausam-ui'}
{"v":${CONTRACT_VERSION},"c":"<type>","t":"<optional card title>","d":{ }}
\`\`\`

Rules: valid JSON only (no comments, no trailing commas); one component per fence; ≤3 cards per reply; numbers must come from DATA/tools. Use EXACTLY the field names shown below — e.g. rain-bars takes "labels"+"pops" (never "hours"/"values"), temp-chart takes "labels"+"temps"+"feels".

Component types — EXACT payload shapes (field names matter, follow them precisely):
- now-card — d:{"place":"Mumbai","temp":29,"feels":31,"cond":"Moderate rain","icon":"🌧️","hi":31,"lo":24,"humidity":88,"wind":12}
- hourly-timeline — d:{"hours":[{"time":"1 PM","temp":29,"pop":35,"icon":"🌦️"}]} (3–12 items)
- temp-chart — d:{"labels":["12 AM","9 AM","6 PM"],"temps":[24,31,28],"feels":[23,33,29],"unit":"°C"} (labels/temps/feels same length)
- rain-bars — d:{"labels":["1 PM","2 PM","3 PM"],"pops":[35,69,21]} (pops = 0–100 rain probability)
- daily-list — d:{"days":[{"label":"Today","icon":"🌧️","hi":31,"lo":24,"pop":78}]} (≤7)
- metrics-grid — d:{"items":[{"label":"Humidity","value":"88%","icon":"💧"}]} (≤8)
- advice — d:{"tone":"warn","title":"Quick takes","items":["Carry an umbrella","Leave early"]} (tone: good|info|warn|danger)
- alert — d:{"severity":"warn","title":"Heavy rain expected","text":"Around 5 PM…"} (severity: info|warn|danger)
- compare-table — d:{"columns":["","Delhi","Mumbai"],"rows":[["Now","29°C","27°C"],["Rain","78%","12%"]]}
- window-card — d:{"verdict":"…","windows":[{"slot":"6 AM – 8 AM","rating":"Good","reason":"12% rain · AQI 90"}]} (rating: Good|Fair|Poor)
- aqi-card — d:{"aqi":164,"category":"Moderate","dominant":"PM10","advice":"…"}
- sun-card — d:{"sunrise":"06:22","sunset":"17:48","dayLength":"11h 26m"}
- wear-list — d:{"items":[{"icon":"☂️","name":"Umbrella","why":"78% rain at 6 PM"}]} (≤5)
- chips — d:{"items":["Hourly forecast","What to wear?"]} (≤3 follow-up options)
- note — d:{"text":"small print…"}

Presentation guidance:
- "Will it rain?" → one sentence verdict + \`rain-bars\` (12–24 pts) only when the pattern is interesting
- Trends ("hotter later?", "how's the week?") → \`temp-chart\` or \`daily-list\`
- What to wear/carry → ALWAYS answer with a \`wear-list\` (one-line reason per item) plus one short intro sentence
- Planning/timing questions → \`window-card\` with slots + Good/Fair/Poor rating
- Air quality → \`aqi-card\` + one practical line
- Another city → \`now-card\` for that city, or \`compare-table\` if comparing
- Warnings (storm, heat, AQI severe) → \`alert\`
- End answers that invite follow-up with \`chips\` (max 3 short options)

## DATA (live snapshot — ground truth)
${snap ? JSON.stringify(snap) : '(weather data still loading — tell the user to try again in a moment; do NOT guess numbers)'}${personalBlock(state.you)}

## Opening style
First message in a conversation: greet briefly (mention name only if provided), one line, no cards. Answer-first, always: verdict, then detail, then (only if useful) a card.`;
}

/** Small follow-up context for multi-turn: trim to last N messages. */
export function trimHistory(history, max = 12) {
  return history.slice(-max);
}
