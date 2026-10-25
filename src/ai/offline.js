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

import { temp as fmtTemp, wind as fmtWind, hourLabel } from '../utils/format.js';
import { runScore, eventScore, driveScore, dayScore, bestWindows, band } from '../core/scoring.js';
import { runTool, fetchCitySnapshot } from './tools.js';

/* ---------------- tiny utils ---------------- */

const esc = (s) => String(s ?? '');
const unit = () => window.__mausamState?.units ?? 'metric';
const t = (c, w = false) => fmtTemp(c, unit(), w);
const w = (k) => fmtWind(k, unit());

function placeName(state) {
  return state?.location?.name ?? 'your area';
}

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
  { id: 'greet', kw: ['hello', 'hi ', 'hey', 'namaste', 'namaskar', 'yo ', 'kaise', 'kya haal', 'good morning', 'good evening', 'good night'] },
  { id: 'help', kw: ['help', 'what can you do', 'kya kar sakte', 'options', 'who are you', 'tum kaun', 'commands'] },
  { id: 'thanks', kw: ['thank', 'thanks', 'shukriya', 'dhanyavad', 'great job', 'nice work', 'awesome'] },
  { id: 'rain', kw: ['rain', 'barish', 'baarish', 'umbrella', 'chhata', 'chatri', 'shower', 'drizzle', 'wet', ' precipitation', 'mm'] },
  { id: 'temp', kw: ['temperature', 'temp ', 'degree', 'hot', 'garmi', 'cold', 'thand', 'thandi', 'chill', 'warm', 'heat'] },
  { id: 'wear', kw: ['wear', 'clothes', 'clothing', 'kapde', 'dress', 'jacket', 'sweater', 'carry', 'pack', 'footwear', 'shoes', 'sunscreen', 'mask'] },
  { id: 'plan', kw: ['plan', 'picnic', 'outing', 'hangout', 'party', 'event', 'function', 'match', 'game', 'cricket', 'football', 'run', 'jog', 'walk', 'cycling', 'cycle', 'hike', 'trek', 'outdoor', 'workout', 'exercise', 'laundry', 'wash clothes', 'dry clothes', 'photoshoot'] },
  { id: 'commute', kw: ['commute', 'office', 'work ', 'drive', 'driving', 'traffic', 'bike', 'scooter', 'metro', 'cab', 'bus ', 'train ', 'reach'] },
  { id: 'aqi', kw: ['aqi', 'air', 'pollution', 'smog', 'pm2', 'pm10', 'quality', 'polluted', 'mask '] },
  { id: 'sun', kw: ['sunrise', 'sunset', 'sun', 'moon', 'daylight', 'golden hour', 'dark'] },
  { id: 'hours', kw: ['hourly', 'hours', 'timeline', 'next few hours', 'abhi ka', 'right now', 'ab ', 'this evening', 'this morning', 'tonight', 'afternoon'] },
  { id: 'week', kw: ['week', 'weekend', 'tomorrow', 'kal ', 'day after', 'sunday', 'saturday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'forecast', '7 day', 'seven day', 'outlook', 'next few days'] },
  { id: 'wind', kw: ['wind', 'gust', 'hawa', 'humidity', 'sticky', 'muggy', 'nami'] },
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
  // question even when it also mentions "tomorrow" or "weekend".
  const STRONG_ACTIVITY = /\b(run|jog|jogging|cycl|cycling|hike|trek|workout|exercise|picnic|cricket|football|match|photoshoot|laundry)\b/;
  if (best.id !== 'plan' && STRONG_ACTIVITY.test(q)) best = { id: 'plan', score: 99 };
  return best;
}

/* --- city extraction for weather-in-X / compare questions --- */
const CITY_STOP = new Set(['Best', 'Tomorrow', 'Today', 'Will', 'What', 'How', 'Is', 'It', 'Hey', 'Hello', 'Mausam', 'IMD', 'The', 'And', 'For', 'Should', 'Air', 'Rain', 'Plan', 'Weekend', 'Week', 'Carry', 'Umbrella', 'Good', 'Thanks', 'Please', 'Can', 'Could', 'Do', 'Does', 'Am', 'PM', 'When', 'Where', 'Why', 'If', 'My', 'Me', 'We', 'Us', 'This', 'That', 'There', 'Then', 'Now', 'Kal', 'Aaj', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
const PHRASE_STOP = /\b(run|walk|time|hour|day|week|me|my|i|you|today|tomorrow|evening|morning|night|out|clothes|wear|umbrella|air|rain|laundry|commute|office|plan|picnic|jacket|mask|sunscreen)\b/i;

function extractCities(text, currentName) {
  const cities = [];
  const push = (c) => {
    const city = String(c ?? '').replace(/\b(weather|mausam|forecast|temp|temperature|rain)\b/gi, '').trim();
    if (city.length >= 3 && !PHRASE_STOP.test(city) && city.toLowerCase() !== String(currentName ?? '').toLowerCase() && !CITY_STOP.has(city.replace(/\b\w/g, (m) => m.toUpperCase()))) {
      cities.push(city);
    }
  };
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
  if (!rs) return 'no data';
  if (rs.maxPop >= 70) return 'rain is very likely';
  if (rs.maxPop >= 45) return 'rain is likely';
  if (rs.maxPop >= 25) return 'a passing shower can’t be ruled out';
  return 'no meaningful rain expected';
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
  if (maxPop >= 40) items.push({ icon: '☂️', name: maxPop >= 70 ? 'Umbrella — carry it for sure' : 'Compact umbrella or light raincoat', why: `${Math.round(maxPop)}% rain chance in the next 12 hours` });
  if (hi >= 36) items.push({ icon: '🧴', name: 'Sunscreen + light cottons', why: `Feels like ${t(hi, true)} — loose, breathable fabrics` });
  if (hi >= 40) items.push({ icon: '🧢', name: 'Cap / shade', why: 'Heat index is high around midday' });
  if ((s.now.temp ?? 30) <= 12) items.push({ icon: '🧥', name: 'Warm layer or jacket', why: `${t(s.now.temp, true)} right now — mornings colder` });
  else if ((s.days?.[1]?.temp_min ?? 99) <= 10) items.push({ icon: '🧥', name: 'Light jacket for evening', why: `Tomorrow dips to ${t(s.days[1].temp_min, true)}` });
  if (aqi != null && aqi >= 150) items.push({ icon: '😷', name: 'N95/FFP2 mask', why: `CPCB AQI ${aqi} (${s.currentAqi.category})` });
  if (uv != null && uv >= 6) items.push({ icon: '🕶️', name: 'Sunglasses', why: `UV index ${Math.round(uv)} — ${s.uvNow?.label ?? 'high'}` });
  if (!items.length) items.push({ icon: '✅', name: 'Nothing special', why: 'Regular day — normal clothes work fine' });
  return items.slice(0, 5);
}

function windowsFor(state, scoreFn, span = 2, count = 2, horizon = 16) {
  const hours = nextHours(state, horizon).map((h) => ({ ...h, score: scoreFn(h) }));
  return bestWindows(hours, count, span).map((win) => {
    const a = hours[win.startIdx], b = hours[win.endIdx];
    const bd = band(win.avg);
    const reasons = [];
    if ((a.precipitation_probability ?? 0) <= 25) reasons.push(`${Math.round(a.precipitation_probability ?? 0)}% rain`);
    else reasons.push(`${Math.round(a.precipitation_probability ?? 0)}% rain`);
    reasons.push(`${t(a.temperature_2m)}–${t(b.temperature_2m)}`);
    if ((a.aqi ?? 0) <= 100) reasons.push(`AQI ${a.aqi ?? '—'}`);
    if ((a.uv_index ?? 0) < 5) reasons.push('low UV');
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
  if (storm) mode = '⛈️ Thunderstorm risk — skip two-wheelers if you can';
  else if (maxRain >= 60) mode = '🌧️ High rain probability — carry rain gear, extra time';
  else if (maxRain >= 35) mode = '🌦️ Showers possible — keep rain gear handy';
  else if (minVis < 2000) mode = '🌫️ Reduced visibility — headlights on';
  else mode = '✅ Smooth commute conditions';
  return { slot: `${String(startH).padStart(2, '0')}:00–${String(endH).padStart(2, '0')}:00`, rating: band(avg).label, color: band(avg).color, reason: `${maxRain}% peak rain · ${w(list[0].wind)} wind` , mode };
}

/* ---------------- answer builders ---------------- */

function buildGreet(state, you) {
  const n = state?.snapshot?.now;
  const hour = new Date().getHours();
  const partOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const name = you?.name ? `, ${you.name}` : '';
  if (!n) return { text: `Namaste${name}! 🙏 Still connecting to the weather service — give me a few seconds and ask me anything.`, comps: [] };
  return {
    text: `Namaste${name}! Good ${partOfDay} — ${placeName(state)} is at **${t(n.temp, true)}** with ${esc(n.wx?.label).toLowerCase()}. Ask me about rain, air quality, timing a plan, or any city you like.`,
    comps: [fence('chips', { items: ['Will it rain today?', 'Best time to run?', 'Air quality right now?'] })],
  };
}

function buildHelp() {
  return {
    text: `I'm **Mausam Mitra** — I answer from live weather data, with real charts and cards when they help. Try things like:`,
    comps: [fence('chips', { items: ['Will it rain today?', 'Hourly forecast for 12 hours', 'What should I wear?', 'Best time for a run?', 'Air quality now', 'Weather in Mumbai?', 'Plan my Sunday picnic', 'When is sunset?'] })],
  };
}

function buildThanks(state) {
  return { text: 'Anytime! 🙌 Ping me before you step out — I\'ll keep an eye on the sky for you.', comps: [] };
}

function buildRain(state) {
  const rs = rainStory(state);
  if (!rs) return buildDefault(state);
  const comps = [];
  let text;
  if (rs.maxPop < 25) {
    text = `Good news — ${verdictRain(rs)} for the next several hours in ${placeName(state)}. Peak chance is just **${Math.round(rs.maxPop)}%** around ${hourLabel(rs.peak.time)}.`;
  } else {
    text = `${verdictRain(rs)[0].toUpperCase() + verdictRain(rs).slice(1)} in ${placeName(state)} — peak **${Math.round(rs.maxPop)}% around ${hourLabel(rs.peak.time)}**`;
    if (rs.firstWet) text += `, with the first real chance near ${hourLabel(rs.firstWet.time)}`;
    text += '.';
  }
  comps.push(fence('rain-bars', {
    labels: rs.hours.slice(0, 12).map((h) => hourLabel(h.time, 'h12')),
    pops: rs.hours.slice(0, 12).map((h) => Math.round(h.precipitation_probability ?? 0)),
  }, 'Rain chance — next 12 hours'));
  if (rs.maxPop >= 45) {
    comps.push(fence('advice', {
      tone: rs.maxPop >= 70 ? 'warn' : 'info',
      title: 'Quick takes',
      items: [
        'Carry an umbrella if you step out after ' + (rs.firstWet ? hourLabel(rs.firstWet.time) : 'noon'),
        'Traffic slows down in rain — leave 10–15 min early',
        rs.peak?.precipitation != null && rs.peak.precipitation >= 2.5 ? 'Heavy spells possible — avoid waterlogged stretches' : 'Mostly light-to-moderate intensity expected',
      ],
    }));
  }
  comps.push(fence('chips', { items: ['Hourly forecast', 'Best time to be outdoors?', 'What should I wear?'] }));
  return { text, comps };
}

function buildTemp(state) {
  const s = state?.snapshot;
  if (!s) return buildDefault(state);
  const h24 = nextHours(state, 24);
  const feels = s.now.hi ?? s.now.feels;
  const maxH = h24.reduce((a, h) => ((h.temperature_2m ?? -99) > (a.temperature_2m ?? -99) ? h : a), h24[0] ?? {});
  const minH = h24.reduce((a, h) => ((h.temperature_2m ?? 99) < (a.temperature_2m ?? 99) ? h : a), h24[0] ?? {});
  let verdict;
  if ((s.now.temp ?? 0) >= 38) verdict = `It's a **hot** one — ${t(s.now.temp, true)} right now, feels like ${t(feels, true)}.`;
  else if ((s.now.temp ?? 99) <= 10) verdict = `It's **cold** — ${t(s.now.temp, true)}, feels like ${t(feels, true)}. Layer up.`;
  else verdict = `${placeName(state)} is at **${t(s.now.temp, true)}** (feels ${t(feels, true)}), ${esc(s.now.wx?.label).toLowerCase()}.`;
  if (maxH?.time && minH?.time && maxH.time !== minH.time) {
    verdict += ` Today ranges from **${t(minH.temperature_2m)} around ${hourLabel(minH.time)}** to **${t(maxH.temperature_2m)} near ${hourLabel(maxH.time)}**.`;
  }
  const comps = [fence('temp-chart', {
    labels: h24.filter((_, i) => i % 3 === 0).map((h) => hourLabel(h.time, 'h12')),
    temps: h24.filter((_, i) => i % 3 === 0).map((h) => (h.temperature_2m != null ? Math.round(h.temperature_2m * 10) / 10 : null)),
    feels: h24.filter((_, i) => i % 3 === 0).map((h) => (h.feels != null ? Math.round(h.feels * 10) / 10 : null)),
    unit: unit() === 'imperial' ? '°F' : '°C',
  }, 'Temperature — next 24 hours')];
  if ((s.now.uv ?? 0) >= 7 && (s.now.temp ?? 0) >= 33) {
    comps.push(fence('advice', { tone: 'warn', title: 'Heat watch', items: ['Hydrate before you feel thirsty', 'Shade breaks if you\'re out past 30 minutes', 'Peak heat hits around ' + hourLabel(maxH.time)] }));
  }
  return { text: verdict, comps };
}

function buildWear(state) {
  const items = wearItems(state);
  if (!items.length) return buildDefault(state);
  const s = state?.snapshot;
  return {
    text: `For ${placeName(state)} right now — ${esc(s?.now?.wx?.label).toLowerCase()}, ${t(s?.now?.temp, true)}:`,
    comps: [fence('wear-list', { items }, 'Wear & carry'), fence('chips', { items: ['Will it rain today?', 'Air quality now', 'Best time to run?'] })],
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
        return { slot: `${hourLabel(a.time)} – ${hourLabel(b.time)}`, rating: bd.label, color: bd.color, reason: `${Math.round(a.precipitation_probability ?? 0)}% rain · ${t(a.temperature_2m)}–${t(b.temperature_2m)}${(a.aqi ?? 999) <= 150 ? ` · AQI ${a.aqi}` : ''}` };
      });
      return {
        text: `**${target.label}** run check: ${esc(target.wx?.label).toLowerCase()}, ${t(target.temp_min)}–${t(target.temp_max)}, rain up to ${Math.round(target.precip_prob_max ?? 0)}%. ${wins.length ? `Best slots: **${wins[0].slot}**.` : ''}`,
        comps: [fence('window-card', { verdict: 'Temp, humidity, UV, rain and AQI scored per hour', windows: wins }, `Best run windows — ${target.label}`)],
      };
    }
    if (target) {
      const bd = band(dayScore(target));
      return {
        text: `**${target.label}**: ${esc(target.wx?.label).toLowerCase()}, ${t(target.temp_min)}–${t(target.temp_max)}, rain **${Math.round(target.precip_prob_max ?? 0)}%** — looks ${bd.label.toLowerCase()} for a run. Hourly detail for that day isn't in range yet; ask me again that morning for exact windows.`,
        comps: [fence('chips', { items: ['Best time today?', 'What should I wear?'] })],
      };
    }
  }

  // laundry special
  if (/laundry|wash|dry clothes/.test(q)) {
    const dryHours = nextHours(state, 14).filter((h) => (h.precipitation_probability ?? 0) < 30 && (h.relative_humidity_2m ?? 100) < 70);
    const verdict = dryHours.length >= 6
      ? `Good drying day — around **${dryHours.length} hours** of dry, sub-70% humidity air ahead.`
      : dryHours.length >= 3 ? `Tight but workable — only **${dryHours.length} dryish hours**. Indoors + fan recommended.`
      : 'Skip laundry today — rain risk and humidity are against you.';
    return { text: verdict, comps: [fence('rain-bars', { labels: nextHours(state, 12).map((h) => hourLabel(h.time, 'h12')), pops: nextHours(state, 12).map((h) => Math.round(h.precipitation_probability ?? 0)) }, 'Rain chance — next 12 hours')] };
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
    const bd = band(target.score);
    let text = `**${target.label}**: ${esc(target.wx?.label).toLowerCase()}, ${t(target.temp_min)}–${t(target.temp_max)}, rain **${Math.round(target.precip_prob_max ?? 0)}%**.`;
    text += target.i === best.i ? ' That’s actually the pick of the week. 👌' : ` If you can flex, **${best.label}** looks better (${esc(best.wx?.label).toLowerCase()}, ${Math.round(best.precip_prob_max ?? 0)}% rain).`;
    return {
      text,
      comps: [fence('daily-list', { days: d.slice(0, 7).map((x) => ({ label: x.label, icon: x.wx?.icon, hi: Math.round(x.temp_max ?? 0), lo: Math.round(x.temp_min ?? 0), pop: Math.round(x.precip_prob_max ?? 0) })) }, '7-day outlook'),
              fence('chips', { items: [`Best time on ${target.label}?`, 'What should I wear?'] })],
    };
  }

  // generic outdoor plan → windows
  const wins = windowsFor(state, isSport ? runScore : eventScore, 2, 2);
  const bd = band(wins[0]?.slot ? 70 : 50);
  const verb = isSport ? 'Move' : 'Plan';
  return {
    text: wins.length
      ? `${verb} windows look best around **${wins[0].slot}**. ${bd.label === 'Good' ? 'Conditions line up nicely there.' : 'It’s the least-bad slot available.'}`
      : `Data is thin right now — check again in a bit.`,
    comps: [fence('window-card', { verdict: isSport ? 'Best slots for exertion (temp, UV, AQI, rain all factored in)' : 'Best outdoor slots (rain, heat, wind, UV factored in)', windows: wins }, isSport ? 'Best time to train' : 'Best time to be out'),
            fence('chips', { items: ['What should I wear?', 'Will it rain today?'] })],
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
  if (!windows.length) text = `I don't have enough hourly detail for your commute right now.`;
  else {
    const rainAhead = nextHours(state, 12).some((h) => (h.precipitation_probability ?? 0) >= 50);
    text = rainAhead
      ? `Heads up — rain is in play during commute hours. ${windows.map((x) => `${x.slot}: ${x.rating}`).join(' · ')}`
      : `Commute check: ${windows.map((x) => `${x.slot} looks ${x.rating.toLowerCase()}`).join(', ')}.`;
  }
  return { text, comps: [fence('window-card', { verdict: 'Rain, visibility, gusts and storm codes scored per hour', windows }, 'Commute windows'), fence('chips', { items: ['Will it rain today?', 'What should I wear?'] })] };
}

function buildAqi(state) {
  const s = state?.snapshot;
  if (!s) return buildDefault(state);
  const a = s.currentAqi;
  if (a?.aqi == null) return { text: 'Air-quality data isn’t available for your area right now — the feed came back empty. Try refreshing in a few minutes.', comps: [] };
  const advice = [];
  if (a.aqi >= 200) advice.push('Limit outdoor exertion — indoor gym beats a run today');
  if (a.aqi >= 300) advice.push('N95 mask outdoors, air purifier indoors if you have one');
  if (a.aqi < 100) advice.push('Air is fine for outdoor activity');
  advice.push(`Dominant pollutant: ${a.dominant ?? '—'}`);
  return {
    text: `CPCB AQI for ${placeName(state)} is **${a.aqi} — ${a.category}**.`,
    comps: [fence('aqi-card', { aqi: a.aqi, category: a.category, dominant: a.dominant, advice: a.advice }, 'Air quality'),
            fence('advice', { tone: a.aqi >= 250 ? 'danger' : a.aqi >= 150 ? 'warn' : 'good', items: advice }),
            fence('chips', { items: ['Best time to run?', 'What should I wear?'] })],
  };
}

function buildSun(state) {
  const s = state?.snapshot;
  const sun = s?.sun;
  if (!sun) return buildDefault(state);
  const fmt = (iso) => (iso ? iso.slice(11, 16) : '—');
  const imd = state?.imd;
  return {
    text: `In ${placeName(state)}: sunrise **${fmt(sun.sunrise)}**, sunset **${fmt(sun.sunset)}**${sun.dayLength ? ` — about **${sun.dayLength}** of daylight` : ''}.`,
    comps: [fence('sun-card', { sunrise: fmt(sun.sunrise), sunset: fmt(sun.sunset), dayLength: sun.dayLength, source: imd?.ok ? imd.station?.name : undefined }, 'Sun & day length')],
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
  let text = `Next 12 hours in ${placeName(state)}: ${esc(nowWx?.label).toLowerCase()}, ${t(s?.now?.temp, true)} now`;
  if (trend != null && Math.abs(trend) >= 2) text += `, ${trend > 0 ? 'warming to' : 'cooling to'} **${t(hours[8].temperature_2m)}** by ${hourLabel(hours[8].time)}`;
  text += '.';
  return {
    text,
    comps: [fence('hourly-timeline', { hours: hours.map((h) => ({ time: hourLabel(h.time, 'h12'), temp: h.temperature_2m != null ? Math.round(h.temperature_2m) : null, pop: Math.round(h.precipitation_probability ?? 0), icon: h.wx?.icon })) }, 'Hour by hour'),
            fence('chips', { items: ['Will it rain today?', 'Best time to be outdoors?'] })],
  };
}

function buildWeek(state) {
  const s = state?.snapshot;
  if (!s?.days?.length) return buildDefault(state);
  const scored = s.days.map((d) => ({ ...d, sc: dayScore(d) }));
  const best = [...scored].sort((a, b) => b.sc - a.sc)[0];
  const worst = [...scored].sort((a, b) => a.sc - b.sc)[0];
  const wettest = [...s.days].sort((a, b) => (b.precip_prob_max ?? 0) - (a.precip_prob_max ?? 0))[0];
  let text = `The week ahead: best day **${best.label}** (${esc(best.wx?.label).toLowerCase()}, ${t(best.temp_min)}–${t(best.temp_max)})`;
  if (worst.label !== best.label) text += `, roughest **${worst.label}**`;
  if ((wettest.precip_prob_max ?? 0) >= 40) text += ` — keep an umbrella handy around ${wettest.label} (${Math.round(wettest.precip_prob_max)}% rain)`;
  text += '.';
  return {
    text,
    comps: [fence('daily-list', { days: s.days.map((d) => ({ label: d.label, icon: d.wx?.icon, hi: Math.round(d.temp_max ?? 0), lo: Math.round(d.temp_min ?? 0), pop: Math.round(d.precip_prob_max ?? 0) })) }, '7-day outlook'),
            fence('chips', { items: ['Plan my weekend?', `What to pack for ${worst.label}?`] })],
  };
}

function buildWind(state) {
  const s = state?.snapshot;
  if (!s) return buildDefault(state);
  const dir = s.now.wind_dir;
  const compass = dir != null ? ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(dir / 22.5) % 16] : '';
  return {
    text: `Wind is **${w(s.now.wind)}** from the ${compass || '—'}${s.now.gusts ? `, gusting to **${w(s.now.gusts)}**` : ''}. Humidity **${Math.round(s.now.humidity ?? 0)}%** — ${(s.now.humidity ?? 0) > 70 ? 'that sticky, muggy feel' : (s.now.humidity ?? 0) < 30 ? 'quite dry air' : 'comfortable range'}.`,
    comps: [fence('metrics-grid', { items: [
      { label: 'Wind', value: w(s.now.wind), icon: '🌬' },
      { label: 'Gusts', value: s.now.gusts ? w(s.now.gusts) : '—', icon: '💨' },
      { label: 'Humidity', value: `${Math.round(s.now.humidity ?? 0)}%`, icon: '💧' },
      { label: 'Pressure', value: s.now.pressure ? `${Math.round(s.now.pressure)} hPa` : '—', icon: '🧭' },
    ] }, 'Conditions detail')],
  };
}

async function buildCity(state, text0) {
  const cities = extractCities(text0, state?.location?.name);
  if (!cities.length) return null;
  if (/compare|vs|versus|better|and\b/i.test(text0) && cities.length >= 2) {
    const [a, b] = cities;
    const [sa, sb] = await Promise.all([
      fetchCitySnapshot(a).catch(() => null),
      fetchCitySnapshot(b).catch(() => null),
    ]);
    if (!sa || !sb) return { text: `I couldn't fetch reliable data for ${!sa ? a : b} right now. Give me a moment and try again?`, comps: [] };
    const rows = [
      ['Now', `${t(sa.now.temp)} ${sa.now.wx?.label ?? ''}`, `${t(sb.now.temp)} ${sb.now.wx?.label ?? ''}`],
      ['Feels like', t(sa.now.feels, true), t(sb.now.feels, true)],
      ['Rain next', `${Math.round(Math.max(0, ...sa.hours.slice(0, 12).map((h) => h.precipitation_probability ?? 0)))}% peak 12h`, `${Math.round(Math.max(0, ...sb.hours.slice(0, 12).map((h) => h.precipitation_probability ?? 0)))}% peak 12h`],
      ['Today', `${t(sa.days?.[0]?.temp_min)}–${t(sa.days?.[0]?.temp_max)}`, `${t(sb.days?.[0]?.temp_min)}–${t(sb.days?.[0]?.temp_max)}`],
      ['AQI', sa.currentAqi?.aqi != null ? `${sa.currentAqi.aqi} ${sa.currentAqi.category}` : '—', sb.currentAqi?.aqi != null ? `${sb.currentAqi.aqi} ${sb.currentAqi.category}` : '—'],
    ];
    return {
      text: `${sa.locationLabel} vs ${sb.locationLabel}, side by side:`,
      comps: [fence('compare-table', { columns: ['', sa.locationLabel.split(',')[0], sb.locationLabel.split(',')[0]], rows }, 'City comparison'),
              fence('chips', { items: [`Weather in ${sa.locationLabel.split(',')[0]}?`, `Weather in ${sb.locationLabel.split(',')[0]}?`] })],
    };
  }
  const snap = await fetchCitySnapshot(cities[0]).catch(() => null);
  if (!snap) return { text: `I couldn't find or fetch weather for “${cities[0]}” just now — check the spelling, or try again in a minute.`, comps: [] };
  const n = snap.now;
  const pop12 = Math.round(Math.max(0, ...snap.hours.slice(0, 12).map((h) => h.precipitation_probability ?? 0)));
  return {
    text: `**${snap.locationLabel}**: ${t(n.temp, true)}, ${esc(n.wx?.label).toLowerCase()} (feels ${t(n.feels, true)}). Rain chance next 12h peaks at **${pop12}%**; today ${t(snap.days?.[0]?.temp_min)}–${t(snap.days?.[0]?.temp_max)}.`,
    comps: [fence('now-card', {
      place: snap.locationLabel, temp: n.temp != null ? Math.round(n.temp) : null, feels: n.feels != null ? Math.round(n.feels) : null,
      cond: n.wx?.label, icon: n.wx?.icon, hi: snap.days?.[0]?.temp_max != null ? Math.round(snap.days[0].temp_max) : null, lo: snap.days?.[0]?.temp_min != null ? Math.round(snap.days[0].temp_min) : null,
      humidity: n.humidity, wind: n.wind,
    }, `${cities[0]} right now`),
      fence('chips', { items: [`Compare ${cities[0]} with ${state?.location?.name ?? 'my city'}`, 'Will it rain there today?'] })],
  };
}

function buildDefault(state) {
  const s = state?.snapshot;
  if (!s) return { text: 'Weather data is still loading — one sec and ask me again. ⏳', comps: [] };
  const n = s.now;
  const rs = rainStory(state);
  return {
    text: `${placeName(state)} right now: **${t(n.temp, true)}**, ${esc(n.wx?.label).toLowerCase()} (feels ${t(n.feels, true)}), ${verdictRain(rs)}. Air: ${s.currentAqi?.aqi != null ? `AQI ${s.currentAqi.aqi} (${s.currentAqi.category})` : 'n/a'}.`,
    comps: [fence('now-card', {
      place: state.location?.name, temp: n.temp != null ? Math.round(n.temp) : null, feels: n.feels != null ? Math.round(n.feels) : null,
      cond: n.wx?.label, icon: n.wx?.icon, hi: s.days?.[0]?.temp_max != null ? Math.round(s.days[0].temp_max) : null, lo: s.days?.[0]?.temp_min != null ? Math.round(s.days[0].temp_min) : null,
      humidity: n.humidity, wind: n.wind,
    }),
      fence('chips', { items: ['Will it rain today?', 'Best time to run?', 'Air quality now', 'What should I wear?'] })],
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

  // city questions override topical intents
  const cityish = /\b(?:vs\.?|versus|compare)\b/i.test(q) ||
    /\b(?:weather|mausam|forecast|temp|temperature|rain)\s+(?:in|at|for)\s+\S/i.test(q) ||
    (() => { const w = q.split(/\s+/); for (let i = 1; i < w.length; i++) { const x = w[i].replace(/[^A-Za-z]/g, ''); if (/^[A-Z][a-zA-Z]{2,}$/.test(x) && !CITY_STOP.has(x)) return true; } return false; })();
  if (cityish && !/^(greet|help|thanks)$/.test(intent.id)) {
    try {
      built = await buildCity(state, q);
    } catch { built = null; }
  }

  if (!built) {
    // v1-shape shim so buildGreet/buildCommute keep working with the v2 profile
    const p = state.profile ?? state.you ?? null;
    const youShim = p ? { name: p.name, commute: { am: p.schedule?.leaveAm ?? p.commute?.am, pm: p.schedule?.backPm ?? p.commute?.pm } } : null;
    switch (intent.id) {
      case 'greet': built = buildGreet(state, youShim); break;
      case 'help': built = buildHelp(); break;
      case 'thanks': built = buildThanks(state); break;
      case 'rain': built = buildRain(state); break;
      case 'temp': built = buildTemp(state); break;
      case 'wear': built = buildWear(state); break;
      case 'plan': built = buildPlan(state, q); break;
      case 'commute': built = buildCommute(state, youShim); break;
      case 'aqi': built = buildAqi(state); break;
      case 'sun': built = buildSun(state); break;
      case 'hours': built = buildHours(state); break;
      case 'week': built = buildWeek(state); break;
      case 'wind': built = buildWind(state); break;
      default: built = buildDefault(state); break;
    }
  }

  const full = `${built.text}\n${built.comps.filter(Boolean).join('\n')}`;
  await stream(full, onText, signal);
  return { usedTools: [] };
}

export function offlineErrorCopy() {
  return { title: 'Mausam Core hit a snag', text: 'The local answer engine failed unexpectedly — retry, or rephrase the question.' };
}

/** Keep runTool reachable for future expansions. */
export { runTool };
