/**
 * prompt.js — system prompt builder for Mausam Mitra.
 *
 * Injects: identity, the MausamUI contract, a compact live-data snapshot,
 * the user's personalisation context, and strict honesty rules.
 * The AI decides presentation: text when text is enough, rich cards when
 * they genuinely communicate better.
 */

import { CONTRACT_VERSION } from './contract.js';
import { profileForAI } from '../core/profile.js';
import { store } from '../core/storage.js';
import { skyBucket } from '../ui/shared.js';
/* v0.8.42 — the DATA block carries the witnesses with the SAME agreement
   math the board's Cross-checked ledger uses. */
import { compareAqi } from '../core/crosscheck.js';

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
    timezone: s.timezone,
    localTime: new Date().toLocaleString('en-IN', { timeZone: s.timezone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }),
    now: {
      tempC: round(s.now.temp, 1),
      feelsC: round(s.now.feels, 1),
      condition: s.now.wx?.label,
      sky: s.now.weather_code != null ? skyBucket(s.now.weather_code, s.now.is_day) : undefined,
      humidity: round(s.now.humidity),
      windKmh: round(s.now.wind),
      windDir: s.now.wind_dir,
      gustKmh: round(s.now.gusts),
      isDay: s.now.is_day,
      uvIndex: round(s.now.uv, 1),
      visibilityKm: s.now.visibility != null ? Math.round(s.now.visibility / 100) / 10 : null,
      cloudPct: round(s.now.cloud),
    },
    soilNow: s.hours[0]?.soil_moisture_0_to_1cm != null
      ? {
          moistureTopM3m3: round(s.hours[0].soil_moisture_0_to_1cm, 2),
          moistureRootM3m3: round(s.hours[0].soil_moisture_3_to_9cm, 2),
          soilTempC: round(s.hours[0].soil_temperature_0_to_7cm, 1),
          et0MmPerHour: round(s.hours[0].et0_fao_evapotranspiration, 2),
        }
      : null,
    airNow: s.hours[0]?.air && (s.hours[0].air.dust != null || s.hours[0].air.aerosol_optical_depth != null)
      ? { dustUgm3: round(s.hours[0].air.dust, 1), aerosolOpticalDepth: round(s.hours[0].air.aerosol_optical_depth, 2) }
      : null,
    extras: state.extras ?? null,
    aqi: s.currentAqi?.aqi != null
      ? { cpcbAqi: s.currentAqi.aqi, category: s.currentAqi.category, dominant: s.currentAqi.dominant, source: 'cams-model-estimate' }
      : null,
    /* v0.8.42 "the conversation vouches" — the independent witnesses ride
       with the snapshot so EVERY LLM path (preview, Gemini) can answer
       "is this verified?" from the same evidence the board's ledger shows.
       Absent witness = field stays absent — the model is told never to
       claim verification the evidence doesn't show. */
    verification: (() => {
      const witness = state.witness ?? s.bundle?.witness ?? null;
      const station = state.station ?? s.bundle?.station ?? null;
      const modelAqi = s.currentAqi?.aqi ?? null;
      const out = {};
      if (witness?.ok) {
        out.temperature = {
          settledDay: witness.day,
          nasaPowerC: witness.powerT,
          era5C: witness.era5T,
          deltaC: witness.delta,
          agree: Boolean(witness.agree),
          sources: 'NASA POWER (MERRA-2) and Open-Meteo archive (ERA5) — independent satellite reanalyses',
        };
      }
      if (modelAqi != null) {
        if (station?.ok && station.aqi != null) {
          const v = compareAqi(modelAqi, station.aqi);
          if (v.ok) {
            out.airQuality = {
              modelAqi,
              liveStation: { name: station.station.name, distanceKm: station.station.distanceKm, aqi: station.aqi },
              verdict: v.verdict,
              delta: v.delta,
              rule: v.verdict === 'agree' ? 'same CPCB band within tolerance' : 'the live station is ground truth — trust it over the model',
            };
          }
        } else if (station?.error?.kind === 'stale') {
          out.airQuality = { modelAqi, liveStation: null, rule: 'no fresh monitor within 25 km — this AQI is the model estimate only' };
        }
      }
      return Object.keys(out).length ? out : null;
    })(),
    rainToday: {
      maxPop: pops.length ? Math.max(...pops) : null,
      nextWetHours: wetHours,
    },
    next24h: next24.filter((_, i) => i % 2 === 0).map((h) => ({
      at: hh(h.time),
      date: h.time.slice(0, 10),
      tempC: round(h.temperature_2m),
      feelsC: round(h.feels ?? h.hi),
      pop: Math.round(h.precipitation_probability ?? 0),
      cond: h.wx?.label,
    })),
    next10days: s.days.map((d) => ({
      day: d.label,
      date: d.date,
      sky: d.weather_code != null ? skyBucket(d.weather_code, true) : undefined,
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

/** Personalisation block — the full volatile profile, additive only. */
function personalBlock(profile) {
  const lines = profileForAI(profile, store.aiLang.get() ?? 'auto');
  if (!lines) return '';
  return `\n\n## User context (personalisation — ADDITIVE, optional to use)\n${lines}`;
}

/**
 * Language block — how Mitra picks the reply language.
 * 'auto' mirrors the user's message; explicit settings override.
 */
function languageBlock(explicit) {
  /* v0.8.27 — CARDS_READ_IN_YOUR_LANGUAGE: the prose rule used to cover only
     the message text; card titles/chips inside ```mausam-ui blocks kept their
     English examples ("RAIN PROBABILITY TODAY") under a Hindi paragraph —
     the one surface a Hindi reader stares at, still in English. Titles and
     chip labels now follow the reply language; component names, icons and
     numbers stay exactly as documented (the parser needs them). */
  const CARDS = ' Inside ```mausam-ui blocks, write human-readable strings (card titles, advice lines, chip labels, verdicts) in the SAME reply language — keep component names, icon keys and numbers exactly as documented.';
  if (explicit === 'hi') {
    return '\n\n## LANGUAGE\nReply in **हिंदी (Devanagari)**. Keep numbers and unit symbols in Latin script (29°C, km/h). Everyday words, no heavy Sanskritised Hindi.' + CARDS;
  }
  if (explicit === 'hinglish') {
    return '\n\n## LANGUAGE\nReply in **natural Hinglish** — Roman-script Hindi mixed with English words, exactly the way Indian friends text each other ("Baarish ho sakti hai shaam ko, umbrella le lo").' + CARDS;
  }
  if (explicit === 'en') {
    return '\n\n## LANGUAGE\nReply in English.' + CARDS;
  }
  return '\n\n## LANGUAGE\nReply in the SAME language the user writes in — English, Hindi (Devanagari) or Hinglish. If they type Roman-script Hindi, answer in Hinglish.' + CARDS;
}

/**
 * Build the time block — the AI's clock. Without it "today", "tonight",
 * "tomorrow morning" and "in 2 hours" are unanswerable.
 */
function timeBlock(state) {
  const s = state.snapshot;
  const tz = s?.timezone;
  const now = new Date();
  const fmt = (opts) => {
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone: tz ?? undefined, ...opts }).format(now);
    } catch {
      return new Intl.DateTimeFormat('en-GB', opts).format(now);
    }
  };
  const full = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  const tzName = fmt({ timeZoneName: 'short' }).split(', ').pop() ?? '';
  const todayISO = (() => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: tz ?? undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    } catch {
      return now.toISOString().slice(0, 10);
    }
  })();
  const tomorrowISO = (() => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: tz ?? undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now.getTime() + 86400000));
    } catch {
      return new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
    }
  })();
  return `## TIME (authoritative — resolve every relative phrase against this)
Right now at the place above: **${full} ${tzName}** (timezone ${tz ?? 'unknown'}). Today's date: **${todayISO}**.
In the DATA block, "Today" = ${todayISO} and "Tomorrow" = ${tomorrowISO}; day rows carry their exact dates — trust the dates, not just labels.
When the user says today/tonight/tomorrow/morning/evening/later, restate the concrete day you mean (e.g. "tomorrow, ${tomorrowISO}"). Times of day: morning < 12 PM, afternoon 12–5 PM, evening 5–9 PM, night after 9 PM.`;
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
  const aiLang = store.aiLang.get() ?? 'auto';

  return `You are **Mausam Mitra**, the weather assistant inside the Mausam app — warm, sharp, a little playful, and completely honest about data. You talk like a knowledgeable Indian friend: short sentences, everyday words, Hinglish welcome if the user uses it.

## Hard rules
1. ${unitLine}
2. NEVER invent weather numbers. Use ONLY the DATA block below and tool results. If something isn't in the data, say so plainly and offer what you do have.
3. Answer with REAL substance — usually 2–3 short paragraphs (roughly 80–150 words): verdict first, then the why, then what to actually do about it. For planning, comparisons or "explain" questions, go deeper: 3–4 short paragraphs (up to ~250 words). Never reply with a single bare sentence unless the user literally asked for yes/no. Bold the key numbers with **…**. No markdown headings or tables in prose.
4. If the user asks about another city, call the \`get_city_weather\` tool first; then answer. If a tool fails, say what happened and answer from what you have. If the user asks whether the data is verified/accurate or which source to trust, call \`verify_numbers\` — never claim verification without it.
5. You are data-aware: the DATA block is the live situation for ${snap?.place ?? 'the user\'s location'}. Treat it as ground truth for "now". The TIME block below tells you the current date and time — use it to resolve every "today", "tonight", "tomorrow" and "this morning".
6. Never give medical advice; frame heat/air warnings practically (shade, hydration, masks, timing).
7. NEVER write raw JSON outside a \`\`\`mausam-ui fence. Never wrap JSON in prose, quotes or \`\`\`json fences.

## MausamUI — rich response contract (v${CONTRACT_VERSION})
Choose presentation deliberately: **plain text when text is enough, a visual component when it communicates better.** Most short answers need zero or one card. Never repeat the same numbers twice (prose + card both listing everything is noise). ALWAYS write at least 2–3 sentences of prose around every card — a card alone is never a complete answer; the card carries the numbers, your prose carries the verdict, the why and the advice.

To emit a card, drop this fenced block anywhere between your sentences:

\`\`\`${'mausam-ui'}
{"v":${CONTRACT_VERSION},"c":"<type>","t":"<optional card title>","d":{ }}
\`\`\`

Rules: valid JSON only (no comments, no trailing commas); one component per fence; ≤3 cards per reply; numbers must come from DATA/tools. Use EXACTLY the field names shown below — e.g. rain-bars takes "labels"+"pops" (never "hours"/"values"), temp-chart takes "labels"+"temps"+"feels". Icon fields take a glyph KEY, never emoji — weather: clear-day | clear-night | partly-day | cloudy | fog | drizzle | rain | snow | storm; objects: umbrella | shirt | droplet | wind | compass | thermo | sun | haze | check | clock.

Component types — EXACT payload shapes (field names matter, follow them precisely):
- now-card — d:{"place":"Mumbai","temp":29,"feels":31,"cond":"Moderate rain","icon":"rain","hi":31,"lo":24,"humidity":88,"wind":12}
- hourly-timeline — d:{"hours":[{"time":"1 PM","temp":29,"pop":35,"icon":"drizzle"}]} (3–12 items)
- temp-chart — d:{"labels":["12 AM","9 AM","6 PM"],"temps":[24,31,28],"feels":[23,33,29],"unit":"°C"} (labels/temps/feels same length)
- rain-bars — d:{"labels":["1 PM","2 PM","3 PM"],"pops":[35,69,21]} (pops = 0–100 rain probability)
- daily-list — d:{"days":[{"label":"Today","icon":"rain","hi":31,"lo":24,"pop":78}]} (≤7)
- metrics-grid — d:{"items":[{"label":"Humidity","value":"88%","icon":"droplet"}]} (≤8)
- advice — d:{"tone":"warn","title":"Quick takes","items":["Carry an umbrella","Leave early"]} (tone: good|info|warn|danger)
- alert — d:{"severity":"warn","title":"Heavy rain expected","text":"Around 5 PM…"} (severity: info|warn|danger)
- compare-table — d:{"columns":["","Delhi","Mumbai"],"rows":[["Now","29°C","27°C"],["Rain","78%","12%"]]}
- window-card — d:{"verdict":"…","windows":[{"slot":"6 AM – 8 AM","rating":"Good","reason":"12% rain · AQI 90"}]} (rating: Good|Fair|Poor)
- aqi-card — d:{"aqi":164,"category":"Moderate","dominant":"PM10","advice":"…"}
- sun-card — d:{"sunrise":"06:22","sunset":"17:48","dayLength":"11h 26m"}
- wear-list — d:{"items":[{"icon":"umbrella","name":"Umbrella","why":"78% rain at 6 PM"}]} (≤5)
- chips — d:{"items":["Hourly forecast","What to wear?"]} (≤3 follow-up options)
- note — d:{"text":"small print…"}

Presentation guidance:
- "Will it rain?" → one sentence verdict + \`rain-bars\` (12–24 pts) only when the pattern is interesting
- Trends ("hotter later?", "how's the week?") → \`temp-chart\` or \`daily-list\`
- What to wear/carry → ALWAYS answer with a \`wear-list\` (one-line reason per item) plus one short intro sentence
- Planning/timing questions → \`window-card\` with slots + Good/Fair/Poor rating
- Air quality → \`aqi-card\` + one practical line. The AQI you get is a CAMS MODEL ESTIMATE, not an official reading — around Indian cities it reads FAR below real CPCB stations (Delhi in Oct–Feb: model often ~30 while stations read 200+ Poor). ALWAYS call it a "model estimate", never present it as the official number, and point users to official station data for health decisions when it matters
- "Is this verified / accurate?" or any trust question → use the \`verification\` block: it carries the independent witnesses (settled-day temperature from NASA POWER × ERA5 reanalyses; live CPCB station AQI vs the model). You may draw it with a \`verify-card\` fence — rows of {label, detail, verdict: ok|warn|info}. NEVER claim verification the block doesn't show; when the block is null, say the independent checks have not landed yet. Trust rule: air → the live station wins; temperature → both witnesses are reanalyses, the forecast model leads until a day settles
- Another city → \`now-card\` for that city, or \`compare-table\` if comparing
- Warnings (storm, heat, AQI severe) → \`alert\`
- Farming questions → use the soilNow + next10days blocks: moisture bands (0.0–0.15 dry → irrigate, 0.15–0.35 good, >0.35 wet), spray when wind < 15 km/h and rain < 30%
- End answers that invite follow-up with \`chips\` (max 3 short options)

## DATA (live snapshot — ground truth)
${snap ? JSON.stringify(snap) : '(weather data still loading — tell the user to try again in a moment; do NOT guess numbers)'}

${timeBlock(state)}${personalBlock(state.profile)}${languageBlock(aiLang)}

## Opening style
First message in a conversation: greet briefly (mention name only if provided), one line, no cards. Answer-first, always: verdict, then detail, then (only if useful) a card.`;
}

/** Small follow-up context for multi-turn: trim to last N messages. */
export function trimHistory(history, max = 12) {
  return history.slice(-max);
}
