/**
 * insights.js — universal insight engine + the additive "For You" layer.
 *
 * The dashboard shows EVERYTHING to EVERYONE. Personalisation only adds:
 *   - computeAlerts()   → the one banner worth interrupting for
 *   - computeInsights() → "Mausam Says" cards (same for all users)
 *   - computeForYou()   → name greeting, commute verdicts, activity
 *                         windows, sensitivity callouts — only if the
 *                         user filled the 30-second "Make it yours" sheet
 */

import { temp as fmtTemp, wind as fmtWind, hourLabel, heatIndex } from '../utils/format.js';
import { runScore, eventScore, driveScore, dayScore, bestWindows, band } from './scoring.js';
import { uvLabel } from './aqi-cpcb.js';

const hh = (iso) => Number(iso?.slice(11, 13));
const clampRound = (v) => Math.round(Math.max(0, Math.min(100, v ?? 0)));

/* ================================================================
   ALERTS — at most one, only when it genuinely matters
================================================================ */

export function computeAlerts(s) {
  if (!s) return null;
  const h12 = s.hours.slice(0, 12);
  const h6 = s.hours.slice(0, 6);

  const storm = h12.find((h) => [95, 96, 99].includes(h.weather_code));
  if (storm) {
    return { kind: 'danger', icon: '⛈️', title: 'Thunderstorm likely today', text: `Around ${hourLabel(storm.time)} — avoid open fields and two-wheelers, unplug sensitive electronics.` };
  }
  const aqi = s.currentAqi?.aqi;
  if (aqi != null && aqi >= 300) {
    return { kind: 'danger', icon: '😷', title: `Air is severe (AQI ${aqi})`, text: 'Limit time outdoors, N95 mask helps; skip outdoor workouts today.' };
  }
  const hi = s.now.hi ?? s.now.feels;
  if (hi != null && hi >= 41) {
    return { kind: 'danger', icon: '🥵', title: `Dangerous heat — feels like ${fmtTemp(hi, true)}`, text: 'Hydrate aggressively, shade between 12–4 PM, never leave anyone in a parked car.' };
  }
  const heavyRain = h6.find((h) => (h.precipitation_probability ?? 0) >= 75 || (h.precipitation ?? 0) >= 7.5);
  if (heavyRain) {
    return { kind: 'warn', icon: '🌧️', title: 'Heavy rain expected soon', text: `Around ${hourLabel(heavyRain.time)} — expect waterlogging and slow traffic; carry rain gear.` };
  }
  if (aqi != null && aqi >= 200) {
    return { kind: 'warn', icon: '😷', title: `Air quality poor (AQI ${aqi})`, text: 'Sensitive groups should limit prolonged outdoor exertion.' };
  }
  if (hi != null && hi >= 37) {
    return { kind: 'warn', icon: '☀️', title: `Very hot — feels like ${fmtTemp(hi, true)}`, text: 'Water bottle, light colours, and shade after noon.' };
  }
  if ((s.now.temp ?? 99) <= 6) {
    return { kind: 'warn', icon: '🥶', title: `Near-freezing morning — ${fmtTemp(s.now.temp, true)}`, text: 'Layer up; black ice possible on bridges early morning.' };
  }
  return null;
}

/* ================================================================
   INSIGHTS — "Mausam Says" (identical for everyone)
================================================================ */

export function computeInsights(s) {
  if (!s) return [];
  const out = [];
  const h24 = s.hours.slice(0, 24);
  const h12 = s.hours.slice(0, 12);

  /* rain story */
  const pops = h12.map((h) => h.precipitation_probability ?? 0);
  const maxPop = Math.max(0, ...pops);
  const firstWet = h12.find((h) => (h.precipitation_probability ?? 0) >= 40);
  if (maxPop >= 40 && firstWet) {
    out.push({ icon: '🌧️', tone: 'info', title: 'Rain window', text: `First real chance near **${hourLabel(firstWet.time)}** (peak ${Math.round(maxPop)}%). Keep the umbrella from around then.` });
  } else if (maxPop < 20) {
    out.push({ icon: '🌤️', tone: 'good', title: 'Dry day ahead', text: `Rain chance stays ≤ ${Math.round(maxPop)}% through the next 12 hours — plans are safe.` });
  }

  /* heat / comfort arc */
  if (h24.length > 6) {
    const maxH = h24.reduce((a, h) => ((h.temperature_2m ?? -99) > (a.temperature_2m ?? -99) ? h : a), h24[0]);
    const minH = h24.reduce((a, h) => ((h.temperature_2m ?? 99) < (a.temperature_2m ?? 99) ? h : a), h24[0]);
    if (maxH.time && minH.time) {
      const swing = Math.round((maxH.temperature_2m ?? 0) - (minH.temperature_2m ?? 0));
      out.push({
        icon: swing >= 10 ? '🌡️' : '📊', tone: swing >= 12 ? 'warn' : 'info', title: `Swing of ${swing}°`,
        text: `From **${fmtTemp(minH.temperature_2m)} at ${hourLabel(minH.time)}** up to **${fmtTemp(maxH.temperature_2m)} near ${hourLabel(maxH.time)}**. Dress in layers if you're out all day.`,
      });
    }
  }

  /* best outdoor windows */
  const scored = s.hours.slice(0, 16).map((h) => ({ ...h, score: eventScore(h) }));
  const wins = bestWindows(scored, 1, 2);
  if (wins.length) {
    const w = wins[0];
    const a = scored[w.startIdx], b = scored[w.endIdx];
    const bd = band(w.avg);
    out.push({
      icon: '🪟', tone: bd.label === 'Good' ? 'good' : 'info', title: `Best outdoor slot: ${bd.label.toLowerCase()}`,
      text: `**${hourLabel(a.time)} – ${hourLabel(b.time)}** — ${Math.round(a.precipitation_probability ?? 0)}% rain, ${fmtTemp(a.temperature_2m)}–${fmtTemp(b.temperature_2m)}${(a.uv_index ?? 0) < 5 ? ', UV still easy' : ''}.`,
    });
  }

  /* UV */
  if ((s.uvNow.value ?? 0) >= 7) {
    out.push({ icon: '🧴', tone: 'warn', title: `UV ${Math.round(s.uvNow.value)} — ${s.uvNow.label}`, text: 'Sunscreen SPF 30+ and sunglasses if you cross open ground today.' });
  }

  /* wind / gust */
  const gustMax = Math.max(0, ...h12.map((h) => h.wind_gusts_10m ?? 0));
  if (gustMax >= 40) {
    out.push({ icon: '💨', tone: 'warn', title: 'Gusty hours ahead', text: `Gusts up to **${fmtWind(gustMax)}** — secure balconies, careful on two-wheelers.` });
  }

  /* AQI */
  const aqi = s.currentAqi?.aqi;
  if (aqi != null) {
    if (aqi >= 150) out.push({ icon: '😷', tone: aqi >= 300 ? 'danger' : 'warn', title: `AQI ${aqi} — ${s.currentAqi.category}`, text: `${s.currentAqi.advice} Dominant: ${s.currentAqi.dominant ?? '—'}.` });
    else if (aqi <= 60) out.push({ icon: '🌿', tone: 'good', title: `Clean air — AQI ${aqi}`, text: 'Great window for outdoor activity; lungs will thank you.' });
  }

  /* fog / visibility */
  const fog = h12.find((h) => [45, 48].includes(h.weather_code) || (h.visibility ?? 99999) < 1000);
  if (fog) {
    out.push({ icon: '🌫️', tone: 'warn', title: 'Fog risk', text: `Visibility drops near ${hourLabel(fog.time)} — headlights on, extra braking distance.` });
  }

  return out.slice(0, 6);
}

/* ================================================================
   FOR YOU — strictly additive, only when a profile exists
================================================================ */

export function computeForYou(s, you) {
  if (!s || !you) return null;
  const cards = [];

  /* commute verdicts */
  const parseH = (v, fb) => {
    const m = String(v ?? '').match(/(\d{1,2})/);
    return m ? Math.max(0, Math.min(23, Number(m[1]))) : fb;
  };
  const commute = (startH, label) => {
    const list = s.hours.filter((h) => hh(h.time) >= startH && hh(h.time) <= startH + 1).map((h) => ({ ...h, score: driveScore(h) }));
    if (!list.length) return null;
    const avg = Math.round(list.reduce((a, h) => a + h.score, 0) / list.length);
    const maxRain = Math.max(...list.map((h) => h.precipitation_probability ?? 0));
    const bd = band(avg);
    let note;
    if ([95, 96, 99].includes(list[0]?.weather_code)) note = 'storm risk — two-wheeler not advised';
    else if (maxRain >= 55) note = `${Math.round(maxRain)}% rain — pack the raincoat`;
    else if (maxRain >= 30) note = 'showers possible, keep gear handy';
    else if (avg >= 70) note = 'clear roads conditions-wise';
    else note = 'mixed conditions, leave a buffer';
    return { icon: '🚗', tone: bd.label === 'Good' ? 'good' : bd.label === 'Fair' ? 'info' : 'warn', title: label, text: `${bd.label} · ${note} (avg score ${avg}).` };
  };
  const amCard = commute(parseH(you.commute?.am, 8), `Morning commute ~${you.commute?.am ?? '8 AM'}`);
  if (amCard) cards.push(amCard);
  const pmCard = commute(parseH(you.commute?.pm, 18), `Evening commute ~${you.commute?.pm ?? '6 PM'}`);
  if (pmCard) cards.push(pmCard);

  /* activity windows */
  const ACT = {
    run: { label: 'Running / jogging', fn: runScore, icon: '🏃' },
    walk: { label: 'Walking', fn: runScore, icon: '🚶' },
    cycling: { label: 'Cycling', fn: runScore, icon: '🚴' },
    outdoor: { label: 'Outdoor plans', fn: eventScore, icon: '🧺' },
    cricket: { label: 'Cricket / field sports', fn: eventScore, icon: '🏏' },
    photography: { label: 'Photography', fn: eventScore, icon: '📷' },
  };
  for (const act of you.activities ?? []) {
    const spec = ACT[act];
    if (!spec) continue;
    const scored = s.hours.slice(0, 16).map((h) => ({ ...h, score: spec.fn(h) }));
    const wins = bestWindows(scored, 1, 2);
    if (!wins.length) continue;
    const w0 = wins[0];
    const a = scored[w0.startIdx], b = scored[w0.endIdx];
    const bd = band(w0.avg);
    cards.push({
      icon: spec.icon, tone: bd.label === 'Good' ? 'good' : 'info', title: spec.label,
      text: `Best: **${hourLabel(a.time)} – ${hourLabel(b.time)}** (${bd.label.toLowerCase()}) — ${Math.round(a.precipitation_probability ?? 0)}% rain, ${fmtTemp(a.temperature_2m)}–${fmtTemp(b.temperature_2m)}.`,
    });
    if (cards.length >= 4) break;
  }

  /* laundry / drying */
  if ((you.activities ?? []).includes('laundry')) {
    const dry = s.hours.slice(0, 14).filter((h) => (h.precipitation_probability ?? 0) < 30 && (h.relative_humidity_2m ?? 100) < 68).length;
    cards.push({
      icon: '👕', tone: dry >= 6 ? 'good' : dry >= 3 ? 'info' : 'warn', title: 'Laundry',
      text: dry >= 6 ? `${dry} dry hours ahead — good drying day.` : dry >= 3 ? `Only ${dry} dryish hours — indoors + fan smarter.` : 'Humidity and rain risk say: not today.',
    });
  }

  /* sensitivity callouts */
  const hi = s.now.hi ?? s.now.feels;
  const sens = you.sensitive ?? {};
  if (sens.heat && hi != null && hi >= 36) {
    cards.push({ icon: '🥵', tone: 'warn', title: 'Heat sensitivity', text: `Feels like ${fmtTemp(hi, true)} — you flagged heat: hydrate early, shade 12–4 PM.` });
  }
  if (sens.cold && (s.now.temp ?? 99) <= 14) {
    cards.push({ icon: '🧣', tone: 'info', title: 'Cold sensitivity', text: `${fmtTemp(s.now.temp, true)} now and dropping — the layer you hate carrying is the one you'll want.` });
  }
  if (sens.rain) {
    const firstWet = s.hours.slice(0, 12).find((h) => (h.precipitation_probability ?? 0) >= 45);
    if (firstWet) cards.push({ icon: '☔', tone: 'info', title: 'Rain sensitivity', text: `${Math.round(firstWet.precipitation_probability)}% around ${hourLabel(firstWet.time)} — umbrella non-negotiable.` });
  }
  if (sens.air && (s.currentAqi?.aqi ?? 0) >= 120) {
    cards.push({ icon: '😷', tone: (s.currentAqi.aqi >= 200) ? 'warn' : 'info', title: 'Air sensitivity', text: `AQI ${s.currentAqi.aqi} (${s.currentAqi.category}) — mask on for longer exposure.` });
  }

  return {
    greeting: you.name ? `${you.name}` : null,
    cards: cards.slice(0, 5),
  };
}
