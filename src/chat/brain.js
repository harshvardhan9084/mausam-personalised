/**
 * brain.js — Mausam Mitra's answer builder.
 *
 * Turns {intent, entities} + LIVE app state (profile, snapshot, IMD data,
 * units, connectivity) into a response: an ordered list of components the
 * UI renders as rich chat cards. Answers are data-backed or explicitly
 * honest about what is missing — it never invents numbers.
 *
 * Reuses the same advisory maths as the dashboards (scoring.js, engine.js)
 * so the chatbot and the dashboard never disagree.
 */

import { INTENTS, detectFollowup } from './nlu.js';
import { runScore, eventScore, driveScore, bestWindows, band, dayScore } from '../core/scoring.js';
import { uvLabel } from '../core/aqi-cpcb.js';
import { thresholds } from '../core/personalise.js';
import { geocodeSearch, fetchWeatherBundle } from '../api/open-meteo.js';
import { buildSnapshot } from '../core/engine.js';
import { temp as fmtTemp, wind as fmtWind } from '../utils/format.js';

/* ================= state contract ================= */

let getState = () => ({});

/**
 * Wire the brain to live app state.
 * @param {() => {snapshot:object|null, profile:object|null, units:string,
 *                 location:object|null, imd:object|null, loading:boolean,
 *                 online:boolean, destBundles:Map|null}} fn
 */
export function setStateGetter(fn) {
  getState = fn;
}

/* ================= helpers ================= */

const MORNING = [5, 11];
const AFTERNOON = [12, 16];
const EVENING = [17, 20];
const NIGHT = [21, 4];

function timeWindow(timeOfDay) {
  switch (timeOfDay) {
    case 'morning': return MORNING;
    case 'afternoon': return AFTERNOON;
    case 'evening': return EVENING;
    case 'night': return NIGHT;
    default: return null;
  }
}

/** Hours of a given day (ISO date) inside the 36h hourly window. */
function hoursForDate(snapshot, dateISO) {
  return (snapshot.hours ?? []).filter((h) => h.time.slice(0, 10) === dateISO);
}

/** Resolve entities.dayIndex → {day, idx, label} using snapshot.days. */
function resolveDay(snapshot, entities) {
  const days = snapshot.days ?? [];
  if (!days.length) return null;
  let raw = entities?.dayIndex ?? 0;
  if (raw === 'weekend') {
    const idx = days.findIndex((d) => [6, 0].includes(new Date(`${d.date}T12:00:00`).getDay()));
    raw = idx >= 0 ? idx : 0;
  } else if (raw && typeof raw === 'object' && raw.weekday != null) {
    const idx = days.findIndex((d) => new Date(`${d.date}T12:00:00`).getDay() === raw.weekday);
    raw = idx >= 0 ? idx : -1;
  }
  raw = Number(raw) || 0;
  if (raw < 0 || raw >= days.length) return null;
  const d = days[raw];
  const label = raw === 0 ? 'today' : raw === 1 ? 'tomorrow' : entities?.dayLabel ?? d.label;
  return { day: d, idx: raw, label };
}

function hoursOfDay(snapshot, resolved) {
  if (!resolved) return [];
  const idx = resolved.idx;
  if (idx <= 1) {
    const hrs = hoursForDate(snapshot, resolved.day.date);
    if (hrs.length) return hrs;
  }
  // Days beyond the 36h window: synthesise a pseudo-hour from daily aggregates.
  const d = resolved.day;
  return [{
    time: `${d.date}T12:00`,
    temperature_2m: (d.temp_max + d.temp_min) / 2,
    apparent_temperature: d.feels_max ?? (d.temp_max + d.temp_min) / 2,
    relative_humidity_2m: null,
    precipitation_probability: d.precip_prob_max ?? 0,
    precipitation: d.precipitation_sum,
    weather_code: d.weather_code,
    wind_speed_10m: d.wind_max,
    wind_gusts_10m: d.gusts_max ?? d.wind_max,
    uv_index: d.uv_max,
    visibility: null,
    aqi: null,
    hi: d.feels_max,
    wx: d.wx,
    pseudo: true,
  }];
}

function filterWindow(hours, win) {
  if (!win) return hours;
  const [lo, hi] = win;
  return hours.filter((h) => {
    const hh = Number(h.time.slice(11, 13));
    return lo <= hi ? hh >= lo && hh <= hi : hh >= lo || hh <= hi;
  });
}

const t = (v, units) => fmtTemp(v, units, true);

/** Replace the {loc} placeholder with the active location name. */
const withLoc = (comps, locName) =>
  comps.map((c) => (c?.type === 'text' && c.text?.includes('{loc}') ? { ...c, text: c.text.replace(/\{loc\}/g, locName) } : c));

/* ================= per-intent builders ================= */

function nowSummary(s, profile, units) {
  const n = s.now;
  const lines = [];
  lines.push(`${n.wx.label}, ${t(n.temp, units)} (feels ${t(n.feels, units)}).`);
  const hrs = s.hours ?? [];
  const wet = hrs.slice(0, 12).find((h) => (h.precipitation_probability ?? 0) >= (profile?.sensitivities?.rain ? 40 : 55));
  if (wet) lines.push(`Rain chance picks up around ${wet.time.slice(11, 16)} (${Math.round(wet.precipitation_probability)}%).`);
  else lines.push('No rain expected in the next 12 hours.');
  return lines;
}

function buildNow(s, profile, units, entities) {
  const out = [{ type: 'text', text: `Right now in **{loc}**: ${nowSummary(s, profile, units).join(' ')}` }];
  out.push({ type: 'nowCard' });
  const placeNote = entities?.place ? ` (that's the live feed for ${entities.place} — switch your home from 📍 if you're staying)` : null;
  if (placeNote) out[0].text = `Right now in **${entities.place}**: ${nowSummary(s, profile, units).join(' ')}`;
  out.push({ type: 'quick', chips: ['Will it rain today?', 'How is the air?', 'What should I wear?'] });
  return out;
}

function buildRain(s, profile, units, entities, imd) {
  const thr = profile?.sensitivities?.rain ? 40 : 55;
  const resolved = resolveDay(s, entities);
  if (!resolved) return [{ type: 'text', text: "I only hold a 7-day forecast, and that day is outside it. Try today, tomorrow, or 'this week'." }];
  const { day, label } = resolved;
  const hrs = hoursOfDay(s, resolved);
  const real = hrs.filter((h) => !h.pseudo);

  if (resolved.idx === 0 || (resolved.idx === 1 && real.length)) {
    const startHour = resolved.idx === 0 ? Number(((s.hours?.[0]?.time ?? '').slice(11, 13) || '0')) : 0;
    const upcoming = real.filter((h) => resolved.idx > 0 || Number(h.time.slice(11, 13)) >= startHour);
    const first = upcoming.find((h) => (h.precipitation_probability ?? 0) >= thr);
    const maxProb = Math.max(...upcoming.map((h) => h.precipitation_probability ?? 0), 0);
    const text = first
      ? `Yes — rain is likely **${label}** around ${first.time.slice(11, 16)} (${Math.round(first.precipitation_probability)}% chance). ${first.wx?.label ?? ''}.`
      : maxProb >= 30
        ? `Nothing solid ${label}. Peak chance is ${Math.round(maxProb)}% — a stray shower isn't impossible, but I wouldn't plan around it.`
        : `No rain expected ${label} — peak chance just ${Math.round(maxProb)}%. Leave the umbrella at home.`;
    return [
      { type: 'text', text },
      { type: 'rainStrip', hours: upcoming.slice(0, 12) },
      ...(imd?.ok ? [{ type: 'note', text: `IMD's official wording: ${imd.days?.[resolved.idx]?.text ?? 'not issued for this period'}` }] : []),
      { type: 'quick', chips: ['Best time to run?', 'What about tomorrow?', 'How is the air?'] },
    ];
  }

  // beyond 36h window — daily aggregates only
  const prob = day.precip_prob_max ?? 0;
  const mm = day.precipitation_sum ?? 0;
  const text = prob >= thr || mm >= 5
    ? `**${label}** looks wet: ${Math.round(prob)}% chance, ~${mm.toFixed(1)} mm expected. ${day.wx?.label ?? ''}.`
    : mm >= 0.2
      ? `Light shower risk **${label}** (${Math.round(prob)}%, ~${mm.toFixed(1)} mm).`
      : `**${label}** looks dry — ${Math.round(prob)}% chance, ${day.wx?.label ?? ''}.`;
  return [
    { type: 'text', text },
    { type: 'note', text: 'Hourly detail is available for the next ~36 hours; this answer uses daily aggregates.' },
    { type: 'quick', chips: ['How does this week look?', 'Best day for an event?', 'Right now?'] },
  ];
}

function buildTemp(s, profile, units, entities) {
  const n = s.now;
  const resolved = resolveDay(s, entities);
  const thr = thresholds(profile);
  const lines = [];

  if (entities?.hour != null && resolved?.idx === 0) {
    const target = (s.hours ?? []).find((h) => Number(h.time.slice(11, 13)) === entities.hour);
    if (target) {
      lines.push(`Around ${target.time.slice(11, 16)}: ${t(target.temperature_2m, units)} (feels ${t(target.hi ?? target.apparent_temperature, units)}), ${target.wx?.label?.toLowerCase() ?? ''}.`);
    }
  } else if (resolved && resolved.idx > 0) {
    const d = resolved.day;
    lines.push(`**${resolved.label}**: ${t(d.temp_min, units)} → ${t(d.temp_max, units)} (max feels ${t(d.feels_max, units)}). ${d.wx?.label ?? ''}.`);
  } else {
    lines.push(`It's ${t(n.temp, units)} right now (feels ${t(n.hi ?? n.feels, units)}) — ${n.wx.label.toLowerCase()}.`);
    const today = s.days?.[0];
    if (today) lines.push(`Today ranges ${t(today.temp_min, units)} → ${t(today.temp_max, units)}.`);
  }

  if (n.hi != null && n.hi >= thr.heatIndex) {
    lines.push(profile?.sensitivities?.heat
      ? '🥵 This is in YOUR heat-stress zone — hydrate before going out and avoid 12–4 PM exertion.'
      : 'It will feel hot in the sun — keep water handy.');
  } else if (n.temp != null && n.temp <= thr.coldTemp && (entities?.hour == null)) {
    lines.push(profile?.sensitivities?.cold ? '🥶 Cold by your standards — take the extra layer.' : 'A light layer would help.');
  }
  return [
    { type: 'text', text: lines.join(' ') },
    { type: 'nowCard' },
    { type: 'quick', chips: ['What should I wear?', 'Will it rain today?', 'How is the air?'] },
  ];
}

function buildWear(s, profile, units) {
  const n = s.now;
  const thr = thresholds(profile);
  const items = [];
  const hrs = (s.hours ?? []).slice(0, 12);
  const rainMax = Math.max(...hrs.map((h) => h.precipitation_probability ?? 0), 0);
  const coldMin = Math.min(...hrs.map((h) => h.temperature_2m ?? n.temp ?? 20));
  if (rainMax >= thr.rainProb) items.push(['☔', 'Umbrella / raincoat', `Rain chance hits ${Math.round(rainMax)}% in the next 12h`]);
  if ((s.currentAqi?.aqi ?? 0) >= thr.aqi) items.push(['😷', 'Mask (N95 ideal)', `AQI ${s.currentAqi.aqi} — ${s.currentAqi.category}${profile?.sensitivities?.air ? ' and you are air-sensitive' : ''}`]);
  if ((s.uvNow?.value ?? 0) >= 6) items.push(['🧴', 'Sunscreen SPF 30+', `UV index ${Math.round(s.uvNow.value)} — ${s.uvNow.label}`]);
  if (n.hi != null && n.hi >= thr.heatIndex) items.push(['🧢', 'Cap + breathable fabric', `Feels like ${t(n.hi, units)}`]);
  if (coldMin <= thr.coldTemp) items.push(['🧥', 'Warm layer', `Drops to ${t(coldMin, units)} later today`]);
  if ((n.wind ?? 0) >= 30) items.push(['💨', 'Windproof outer', `Wind ${fmtWind(n.wind, units)} right now`]);
  if (!items.length) items.push(['✅', 'Whatever you like', 'No weather-specific demands in the next 12 hours']);
  return [
    { type: 'text', text: `For the next 12 hours in **{loc}**, here's what matters:` },
    { type: 'wearList', items },
    { type: 'quick', chips: ['Will it rain?', 'How is the air?', 'Best time to run?'] },
  ];
}

function buildAir(s, profile, units) {
  const aqiInfo = s.currentAqi;
  if (aqiInfo?.aqi == null) {
    return [
      { type: 'text', text: "I couldn't load air-quality data for your area just now — the AQI service may be offline. Weather data still works; try again in a few minutes." },
      { type: 'quick', chips: ['Right now?', 'Will it rain today?'] },
    ];
  }
  const thr = thresholds(profile);
  const hrs = (s.hours ?? []).slice(0, 12).filter((h) => h.aqi != null);
  const best = hrs.length ? hrs.reduce((a, b) => (b.aqi < a.aqi ? b : a)) : null;
  const lines = [];
  lines.push(`CPCB AQI is **${aqiInfo.aqi} — ${aqiInfo.category}**.`);
  if (best && best.aqi < aqiInfo.aqi - 15) lines.push(`Cleanest window: ${best.time.slice(11, 16)} (AQI ~${best.aqi}).`);
  if (aqiInfo.aqi >= thr.aqi) {
    lines.push(profile?.sensitivities?.air
      ? '😷 For you specifically: mask on, inhaler within reach, skip outdoor workouts.'
      : 'Sensitive groups should limit outdoor exertion.');
  } else {
    lines.push('Air is acceptable for outdoor plans.');
  }
  return [
    { type: 'text', text: lines.join(' ') },
    { type: 'aqiCard' },
    { type: 'quick', chips: ['Best time to run?', 'What should I wear?', 'Right now?'] },
  ];
}

function buildUv(s, profile, units) {
  const uv = s.uvNow;
  const today = s.days?.[0];
  if (uv?.value == null && (today?.uv_max ?? 0) === 0) {
    return [{ type: 'text', text: 'UV data is unavailable right now — sorry. General rule in India: 11 AM–3 PM sun is the harshest.' }];
  }
  const peak = Math.max(today?.uv_max ?? 0, uv?.value ?? 0);
  const lines = [];
  lines.push(`UV index right now: **${uv?.value != null ? uv.value.toFixed(1) : '—'} (${uv?.label ?? '—'})**.`);
  if (today) lines.push(`Today's peak: ~${today.uv_max?.toFixed?.(1) ?? '—'} .`);
  if (peak >= 6) lines.push('Sunscreen SPF 30+ every 2–3 h, sunglasses, and shade between 11 AM and 3 PM.');
  else lines.push('Low burn risk — normal exposure is fine.');
  return [
    { type: 'text', text: lines.join(' ') },
    { type: 'quick', chips: ['What should I wear?', "Today's forecast?"] },
  ];
}

function buildSun(s, profile, units, entities, imd, ctx) {
  const today = s.days?.[0];
  const tomorrow = s.days?.[1];
  if (!today?.sunrise) return [{ type: 'text', text: "I don't have sunrise/sunset data loaded right now." }];
  const day = entities?.dayIndex === 1 && tomorrow ? tomorrow : today;
  const label = entities?.dayIndex === 1 && tomorrow ? 'tomorrow' : 'today';
  const out = [{ type: 'text', text: `**${label.charAt(0).toUpperCase() + label.slice(1)}** in **{loc}**: sunrise ${day.sunrise.slice(11, 16)}, sunset ${day.sunset.slice(11, 16)}.` }];
  out.push({
    type: 'sunCard',
    sunrise: day.sunrise.slice(11, 16),
    sunset: day.sunset.slice(11, 16),
    moonrise: imd?.ok ? imd.obs?.moonrise : null,
    moonset: imd?.ok ? imd.obs?.moonset : null,
    source: imd?.ok ? 'IMD' : null,
  });
  if (imd?.ok && imd.obs?.sunrise && entities?.dayIndex !== 1) {
    out.push({ type: 'note', text: `IMD records: sunrise ${imd.obs.sunrise}, sunset ${imd.obs.sunset} (station: ${imd.station.name}).` });
  }
  out.push({ type: 'quick', chips: ['Best time to run?', "Tomorrow's weather?"] });
  return out;
}

function buildActivity(s, profile, units, entities) {
  const win = timeWindow(entities?.timeOfDay);
  const slice = (s.hours ?? []).slice(0, 24);
  const scoped = filterWindow(slice, win);
  if (!scoped.length) {
    return [{ type: 'text', text: "I couldn't find hours matching that window in my 36-hour detail. Try 'today', 'tomorrow', or a time like 'evening'." }];
  }
  const scored = scoped.map((h) => ({ ...h, score: runScore(h) }));
  const windows = bestWindows(scored, 2, 2).map((w) => {
    const a = scored[w.startIdx];
    const b = scored[w.endIdx];
    const bd = band(w.avg);
    return { slot: `${a.time.slice(11, 16)} – ${b.time.slice(11, 16)}`, rating: bd.label, color: bd.color, reason: `${a.wx?.label ?? ''} · ${Math.round(a.temperature_2m)}–${Math.round(b.temperature_2m)}°C · rain ${a.precipitation_probability ?? 0}%` };
  });
  const bestW = windows[0];
  const lines = [];
  const actName = entities?.activity ?? (profile?.lens === 'fitness' ? 'workout' : 'outdoor activity');
  if (bestW && bestW.rating !== 'Poor') {
    lines.push(`Best ${actName} windows in the next 24h:`);
  } else {
    lines.push(`Honestly, the next 24h are rough for ${actName}. The least-bad slots:`);
    const bestDay = [...(s.days ?? [])].map((d, i) => ({ ...d, i })).sort((a, b) => (dayScore(b) ?? 0) - (dayScore(a) ?? 0))[0];
    if (bestDay) lines.push(`If you can move it, **${bestDay.label.toLowerCase()}** scores best this week.`);
  }
  return [
    { type: 'text', text: lines.join(' ') },
    { type: 'windows', windows },
    { type: 'quick', chips: ['Will it rain during that time?', 'How is the air?', 'What should I wear?'] },
  ];
}

function buildLaundry(s, profile, units) {
  const hrs = (s.hours ?? []).slice(0, 14);
  const dryish = (h) => (h.precipitation_probability ?? 0) < 30 && (h.relative_humidity_2m ?? 100) < 70;
  const good = hrs.filter(dryish);
  if (good.length >= 4) {
    const start = good[0].time.slice(11, 16);
    const end = good[good.length - 1].time.slice(11, 16);
    return [
      { type: 'text', text: `Yes — put the clothes out **${start}–${end}**. Low rain chance and humidity stays manageable.` },
      { type: 'rainStrip', hours: hrs.slice(0, 12) },
      { type: 'quick', chips: ['Will it rain today?', 'Right now?'] },
    ];
  }
  const semi = hrs.filter((h) => (h.precipitation_probability ?? 0) < 50);
  if (semi.length >= 4) {
    return [
      { type: 'text', text: `Risky. There's a shower chance (up to ${Math.round(Math.max(...hrs.map((h) => h.precipitation_probability ?? 0)))}%). If you must, ${semi[0].time.slice(11, 16)}–${semi[semi.length - 1].time.slice(11, 16)} is the least wet gap — keep an eye out.` },
      { type: 'rainStrip', hours: hrs.slice(0, 12) },
    ];
  }
  return [
    { type: 'text', text: "Not today — rain probability is high through the window I can see. Indoor drying is the safe call." },
    { type: 'rainStrip', hours: hrs.slice(0, 12) },
  ];
}

function buildCommute(s, profile, units, entities) {
  const scored = (s.hours ?? []).map((h) => ({ ...h, score: driveScore(h) }));
  const analyse = (lo, hi) => {
    const list = scored.filter((h) => {
      const hh = Number(h.time.slice(11, 13));
      return hh >= lo && hh <= hi;
    });
    if (!list.length) return null;
    const avg = Math.round(list.reduce((a, b) => a + b.score, 0) / list.length);
    const maxRain = Math.max(...list.map((h) => h.precipitation_probability ?? 0));
    const minVis = Math.min(...list.map((h) => h.visibility ?? 99999));
    const fog = list.some((h) => [45, 48].includes(h.weather_code) || minVis < 1000);
    const storm = list.some((h) => [95, 96, 99].includes(h.weather_code));
    const bd = band(avg);
    let verdict = 'Clean run — no weather trouble flagged.';
    if (storm) verdict = '⛈️ Thunderstorm in the window — avoid two-wheelers, expect waterlogging.';
    else if (fog) verdict = '🌫️ Fog risk — low beams, extra following distance.';
    else if (maxRain >= 60) verdict = '🌧️ High rain chance — carry rain gear, budget extra time.';
    else if (maxRain >= 35) verdict = '🌦️ Showers possible — rain gear handy.';
    return { slot: `${String(lo).padStart(2, '0')}:00–${String(hi).padStart(2, '0')}:59`, rating: bd.label, color: bd.color, reason: `${verdict} (rain ${Math.round(maxRain)}%, visibility ${minVis >= 99999 ? 'n/a' : `${(minVis / 1000).toFixed(1)} km`})` };
  };
  const wantsEvening = entities?.timeOfDay === 'evening' || entities?.timeOfDay === 'night';
  const blocks = [analyse(7, 9), analyse(17, 19)].filter(Boolean);
  if (!blocks.length) return [{ type: 'text', text: "The commute windows (7–9 AM, 5–7 PM) have moved out of my 36-hour detail. Ask me again tomorrow morning." }];
  const picked = wantsEvening ? blocks.slice().reverse() : blocks;
  return [
    { type: 'text', text: `Here's the road picture for **{loc}**:` },
    { type: 'windows', windows: picked },
    { type: 'quick', chips: ['Will it rain in the evening?', "Tomorrow morning's drive?", 'Right now?'] },
  ];
}

function buildEvent(s, profile, units, entities) {
  const slice = (s.hours ?? []).slice(0, 16);
  const scored = slice.map((h) => ({ ...h, score: eventScore(h) }));
  const windows = bestWindows(scored, 2, 3).map((w) => {
    const a = scored[w.startIdx];
    const b = scored[w.endIdx];
    const bd = band(w.avg);
    return { slot: `${a.time.slice(11, 16)} – ${b.time.slice(11, 16)}`, rating: bd.label, color: bd.color, reason: `${a.wx?.label ?? ''} · rain ${a.precipitation_probability ?? 0}% · gusts ${Math.round(a.wind_gusts_10m ?? 0)} km/h` };
  });
  const days = (s.days ?? []).map((d, i) => ({ ...d, i, score: dayScore(d) }));
  const bestDay = [...days].sort((a, b) => b.score - a.score)[0];
  const lines = ['Here are the best outdoor-event windows coming up:'];
  if (entities?.dayIndex != null) {
    const resolved = resolveDay(s, entities);
    if (resolved) {
      const sc = band(resolved.day.score ?? dayScore(resolved.day));
      lines.splice(0, 1, `**${resolved.label}** rates **${sc.label}** for an event (${resolved.day.wx?.label ?? ''}, rain ${Math.round(resolved.day.precip_prob_max ?? 0)}%).`);
      if (sc.cls !== 'safe' && bestDay && bestDay.idx !== resolved.idx) {
        lines.push(`If it can move: ${bestDay.label.toLowerCase()} is the strongest day this week.`);
      }
      return [{ type: 'text', text: lines.join(' ') }, { type: 'quick', chips: ['How does this week look?', 'What should I wear?'] }];
    }
  }
  if (bestDay) lines.push(`This week's winner: **${bestDay.label}** (${bestDay.wx.label}, rain ${Math.round(bestDay.precip_prob_max ?? 0)}%).`);
  return [
    { type: 'text', text: lines.join(' ') },
    ...(windows.length ? [{ type: 'windows', windows }] : []),
    { type: 'quick', chips: ['How does this week look?', 'Will it rain today?', 'What should I wear?'] },
  ];
}

function buildTravel(s, profile, units, entities, imd, ctx) {
  const out = [];
  if (ctx?.placeBundle && ctx.placeName) {
    const b = ctx.placeBundle;
    out.push({ type: 'text', text: `**${ctx.placeName}** right now: ${b.now.wx.label}, ${t(b.now.temp, units)} (feels ${t(b.now.feels, units)}).` });
    const week = b.days ?? [];
    if (week.length) {
      const best = [...week].sort((a, b) => (dayScore(b) ?? 0) - (dayScore(a) ?? 0))[0];
      out.push({ type: 'text', text: `Best day there: **${best.label}** (${best.wx.label}, ${t(best.temp_min, units)}–${t(best.temp_max, units)}).` });
    }
    out.push({ type: 'quick', chips: [`What should I pack for ${ctx.placeName}?`, 'Back to my city'] });
    return out;
  }
  if (entities?.place) {
    return [{ type: 'asyncPlace', place: entities.place, followIntent: INTENTS.TRAVEL }];
  }
  const packing = [];
  const days = s.days ?? [];
  const thr = thresholds(profile);
  if (days.some((d) => (d.precip_prob_max ?? 0) >= 50 || (d.precipitation_sum ?? 0) >= 10)) {
    const wettest = [...days].sort((a, b) => (b.precip_prob_max ?? 0) - (a.precip_prob_max ?? 0))[0];
    packing.push(['☂️', 'Umbrella / raincoat', `${Math.round(wettest.precip_prob_max ?? 0)}% rain on ${wettest.label}`]);
  }
  if ((s.uvNow?.value ?? 0) >= 5 || days.some((d) => (d.uv_max ?? 0) >= 6)) packing.push(['🧴', 'Sunscreen SPF 30+', 'High UV days ahead']);
  if (days.some((d) => d.temp_min <= thr.coldTemp - 4)) {
    const coldest = [...days].sort((a, b) => a.temp_min - b.temp_min)[0];
    packing.push(['🧥', 'Warm layer', `${t(coldest.temp_min, units)} on ${coldest.label}`]);
  }
  if ((s.currentAqi?.aqi ?? 0) >= thr.aqi) packing.push(['😷', 'Mask', `AQI ${s.currentAqi.aqi} today`]);
  if (!packing.length) packing.push(['✅', 'Standard kit', 'No weather-specific needs this week']);
  return [
    { type: 'text', text: `Auto-built packing list for the week in **{loc}**:` },
    { type: 'wearList', items: packing },
    { type: 'note', text: 'Tip: ask “weather in Shimla” and I will pull that city live.' },
    { type: 'quick', chips: ['Weather in Delhi?', 'How does this week look?'] },
  ];
}

function buildFarm(s, profile, units) {
  const h0 = (s.hours ?? [])[0];
  const soilPct = h0?.soil_moisture_0_to_1cm != null ? Math.round(h0.soil_moisture_0_to_1cm * 100) : null;
  if (soilPct == null) {
    return [
      { type: 'text', text: "Soil-moisture data isn't available for this location right now, so I can't grade irrigation. Rain forecast for the next 3 days: see below." },
      { type: 'quick', chips: ['Will it rain today?', 'How does this week look?'] },
    ];
  }
  const days = s.days ?? [];
  const rain3 = days.slice(0, 3).reduce((a, d) => a + (d.precipitation_sum ?? 0), 0);
  const soilLine = soilPct < 15 ? `Soil is **dry (${soilPct}%)**.` : soilPct > 42 ? `Soil is **wet (${soilPct}%)** — watch for waterlogging.` : `Soil moisture is **adequate (${soilPct}%)**.`;
  const action = rain3 >= 10
    ? `~${rain3.toFixed(0)} mm rain lands within 3 days — hold irrigation and conserve water.`
    : soilPct < 15
      ? 'Irrigate today, early morning or evening to cut evaporation losses.'
      : soilPct > 42
        ? 'No irrigation needed; make sure field drainage is clear.'
        : 'Normal irrigation schedule is fine.';
  const rows = days.slice(0, 3).map((d) => [d.label, `${(d.precipitation_sum ?? 0).toFixed(1)} mm · ${Math.round(d.precip_prob_max ?? 0)}%`]);
  return [
    { type: 'text', text: `${soilLine} ${action}` },
    { type: 'list', title: 'Rain ahead (daily totals)', rows },
    { type: 'quick', chips: ['Will it rain today?', 'How does this week look?'] },
  ];
}

function buildForecast(s, profile, units, entities, imd) {
  const days = (s.days ?? []).map((d, i) => ({
    label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.label,
    icon: d.wx?.icon ?? '·',
    max: d.temp_max,
    min: d.temp_min,
    rain: Math.round(d.precip_prob_max ?? 0),
  }));
  const best = [...(s.days ?? [])].map((d, i) => ({ ...d, i })).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  return [
    { type: 'text', text: `Here's the 7-day picture for **{loc}**${best ? ` — **${best.label}** looks strongest.` : ''}` },
    { type: 'weekStrip', days },
    ...(imd?.ok ? [{ type: 'note', text: `Source: IMD 7-day city forecast (${imd.station.name}) merged with Open-Meteo hourly detail.` }] : []),
    { type: 'quick', chips: [`Best day for an event?`, 'Will it rain today?', 'What should I pack?'] },
  ];
}

function buildProfile(profile) {
  if (!profile) return [{ type: 'text', text: 'No profile is active — create one from the 👤 switcher.' }];
  const sens = Object.entries(profile.sensitivities ?? {}).filter(([, v]) => v).map(([k]) => k);
  return [
    {
      type: 'profileCard',
      profile,
    },
    {
      type: 'text',
      text: `I tune every answer through this profile${sens.length ? ` (sensitive to: ${sens.join(', ')})` : ''}. Everything stays on this device — no account.`,
    },
    { type: 'quick', chips: [{ label: '✏️ Edit profile', action: 'edit-profile' }, { label: '➕ New profile', action: 'new-profile' }, 'Best time to run?'] },
  ];
}

function buildHelp() {
  return [
    { type: 'text', text: "I'm **Mausam Mitra** — I answer from the same live data and advisory engine the dashboards use. I understand days ('tomorrow', 'Saturday'), times ('evening', 'at 6'), and even a little Hinglish ('baarish?', 'garmi?'). Try:" },
    { type: 'quick', chips: ['Will it rain today?', 'Best time to run tomorrow?', 'What should I wear?', 'How is the air?', 'What should I pack?', 'What time is sunrise?'] },
  ];
}

function buildGreeting(profile) {
  const name = profile?.name;
  const openers = [
    `Hi${name ? ` ${name}` : ''}! ☀️ Ask me anything about your weather — rain timing, air quality, the best window to run…`,
    `Hello${name ? ` ${name}` : ''}! I've got your live conditions ready. What do you need — rain, air, timing?`,
  ];
  return [
    { type: 'text', text: openers[Math.floor(Math.random() * openers.length)] },
    { type: 'quick', chips: ['Right now?', 'Will it rain today?', 'How is the air?', 'What can you do?'] },
  ];
}

function buildThanks(profile) {
  return [
    { type: 'text', text: `Anytime${profile?.name ? `, ${profile.name}` : ''}! 🙌` },
    { type: 'quick', chips: ['Right now?', "Tomorrow's forecast?"] },
  ];
}

function buildUnknown(s, raw) {
  const heard = raw?.length > 40 ? `${raw.slice(0, 40)}…` : raw;
  return [
    { type: 'text', text: `I'm a weather-only assistant, and I didn't fully catch that${heard ? ` ("${heard}")` : ''}. I'm good at rain timing, temperatures, air quality, wear lists, activity windows, packing and farm planning. Try one of these:` },
    { type: 'quick', chips: ['Will it rain today?', 'Best time to run?', 'How is the air?', 'What can you do?'] },
  ];
}

/* ================= place handling ================= */

async function loadPlace(place, ctx) {
  const results = await geocodeSearch(place);
  if (!results.length) {
    return { error: `I couldn't find "${place}". Check the spelling, or set it as your home from the 📍 button.` };
  }
  const r = results[0];
  const bundle = await fetchWeatherBundle(r.latitude, r.longitude);
  // same engine as the dashboards → the mini-card fields match 1:1
  const snap = buildSnapshot(bundle);
  return {
    name: [r.name, r.admin1].filter(Boolean).join(', '),
    snap,
  };
}

/* ================= main entry ================= */

/**
 * Answer a user message.
 * @param {string} raw
 * @param {{intent:string, entities:object}} parsed  from nlu.classify
 * @param {object} ctx  conversation memory {lastIntent, lastEntities, placeName, placeBundle}
 * @returns {Promise<{components:Array, ctx:object}>}
 */
export async function answer(raw, parsed, ctx = {}) {
  const state = getState();
  const { snapshot: s, profile, units = 'metric', location, imd, loading, online } = state;

  // --- conversation memory: follow-ups inherit the last intent ---
  const follow = detectFollowup(raw);
  let intent = parsed.intent;
  const entities = { ...parsed.entities };
  if (follow.isFollowup && ctx.lastIntent && intent !== INTENTS.HELP && intent !== INTENTS.PROFILE) {
    intent = ctx.lastIntent;
    if (!entities.dayIndex && !entities.timeOfDay && ctx.lastEntities) {
      Object.assign(entities, ctx.lastEntities);
    }
  }
  // "there?" / "back to my city"
  if (/\b(there|back)\b/.test(follow.text) && ctx.placeName) {
    if (/\bback\b/.test(follow.text)) {
      delete ctx.placeName;
      delete ctx.placeBundle;
      return {
        components: [{ type: 'text', text: `Back to **${location?.name ?? 'your city'}**.` }, ...(s ? buildNow(s, profile, units, {}) : [])],
        ctx,
      };
    }
    if (ctx.placeBundle) {
      return {
        components: buildTravel(s, profile, units, {}, null, ctx),
        ctx: { ...ctx, lastIntent: intent, lastEntities: entities },
      };
    }
  }

  const nextCtx = { ...ctx, lastIntent: intent, lastEntities: entities };

  // --- global guards (honest errors) ---
  if (!online) {
    return {
      components: withLoc([
        { type: 'text', text: "You're offline. I can still answer from the last cached data — but anything needing a fresh fetch (like other cities) will wait until you're back online." },
        ...(s ? buildNow(s, profile, units, {}) : []),
      ], location?.name ?? 'your city'),
      ctx: nextCtx,
    };
  }
  if (!s || loading) {
    return {
      components: [
        { type: 'text', text: 'I\'m still pulling the latest data for your location — one moment. If this hangs, check the connection and tap the ↻ refresh up top.' },
        { type: 'quick', chips: [{ label: '↻ Try again', message: raw }] },
      ],
      ctx: nextCtx,
    };
  }

  // async place-aware answers
  if (parsed.intent === INTENTS.TRAVEL || parsed.intent === INTENTS.NOW || intent === INTENTS.TRAVEL) {
    const place = parsed.entities?.place ?? entities?.place;
    if (place && place.toLowerCase() !== (location?.name ?? '').toLowerCase()) {
      try {
        const res = await loadPlace(place, ctx);
        if (res.error) {
          return {
            components: [
              { type: 'error', title: `Couldn't check ${place}`, text: res.error },
              { type: 'quick', chips: [{ label: '↻ Try again', message: raw }, 'Right now?'] },
            ],
            ctx: nextCtx,
          };
        }
        nextCtx.placeName = res.name;
        nextCtx.placeBundle = res.snap;
        const comps = intent === INTENTS.TRAVEL
          ? buildTravel(s, profile, units, entities, imd, { placeName: res.name, placeBundle: res.snap })
          : buildNow(res.snap, profile, units, { place: res.name });
        comps.push({ type: 'note', text: `Live fetch for ${res.name} — your saved profile & home city are unchanged.` });
        return { components: comps, ctx: nextCtx };
      } catch (err) {
        return {
          components: [
            { type: 'error', title: `Couldn't fetch weather for ${place}`, text: err?.message ?? 'The weather service did not respond. Check your connection and try again.' },
            { type: 'quick', chips: [{ label: '↻ Try again', message: raw }, 'Right now?'] },
          ],
          ctx: nextCtx,
        };
      }
    }
  }

  let comps;
  switch (intent) {
    case INTENTS.GREETING: comps = buildGreeting(profile); break;
    case INTENTS.THANKS: comps = buildThanks(profile); break;
    case INTENTS.HELP: comps = buildHelp(); break;
    case INTENTS.PROFILE: comps = buildProfile(profile); break;
    case INTENTS.RAIN: comps = buildRain(s, profile, units, entities, imd); break;
    case INTENTS.TEMP: comps = buildTemp(s, profile, units, entities); break;
    case INTENTS.WEAR: comps = buildWear(s, profile, units); break;
    case INTENTS.AIR: comps = buildAir(s, profile, units); break;
    case INTENTS.UV: comps = buildUv(s, profile, units); break;
    case INTENTS.SUN: comps = buildSun(s, profile, units, entities, imd, nextCtx); break;
    case INTENTS.ACTIVITY: comps = buildActivity(s, profile, units, entities); break;
    case INTENTS.LAUNDRY: comps = buildLaundry(s, profile, units); break;
    case INTENTS.COMMUTE: comps = buildCommute(s, profile, units, entities); break;
    case INTENTS.EVENT: comps = buildEvent(s, profile, units, entities); break;
    case INTENTS.TRAVEL: comps = buildTravel(s, profile, units, entities, imd, nextCtx); break;
    case INTENTS.FARM: comps = buildFarm(s, profile, units); break;
    case INTENTS.FORECAST: comps = buildForecast(s, profile, units, entities, imd); break;
    case INTENTS.NOW: comps = buildNow(s, profile, units, entities); break;
    default: comps = buildUnknown(s, raw);
  }

  if (parsed.intent === INTENTS.UNKNOWN && intent !== INTENTS.UNKNOWN) {
    comps.push({ type: 'note', text: 'Answering that as a follow-up to your previous question.' });
  }

  return { components: withLoc(comps, location?.name ?? 'your city'), ctx: nextCtx };
}

/** First-run welcome message when the panel opens with no history. */
export function welcomeMessage() {
  const state = getState();
  const profile = state.profile;
  return [
    { type: 'text', text: `Hi${profile?.name ? ` ${profile.name}` : ''}! I'm **Mausam Mitra** 🌦️ — your weather companion. I read the same live data as your dashboard, tuned to your profile. Ask me anything, or tap a suggestion below.` },
    { type: 'quick', chips: ['Right now?', 'Will it rain today?', 'How is the air?', 'Best time to run?'] },
  ];
}
