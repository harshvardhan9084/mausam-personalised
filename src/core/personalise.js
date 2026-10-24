/**
 * personalise.js — turns a raw snapshot + profile into PERSONAL insight.
 *
 * The dashboards answer "what is the weather doing?".
 * This module answers "what does the weather mean for THIS person?"
 * Sensitivities shift the thresholds; the lens picks the headline insight.
 */

import { runScore, eventScore, driveScore, bestWindows, band } from './scoring.js';
import { temp as fmtTemp } from '../utils/format.js';

/** Sensitivity-adjusted thresholds. */
export function thresholds(profile) {
  const s = profile?.sensitivities ?? {};
  return {
    heatIndex: s.heat ? 32 : 38,          // feels-like °C that starts to hurt
    coldTemp: s.cold ? 16 : 8,            // °C that starts to bite
    rainProb: s.rain ? 40 : 60,           // % chance worth warning about
    aqi: s.air ? 100 : 150,               // CPCB AQI worth a mask
  };
}

/** "Good evening, Harsh" — time-of-day greeting. */
export function greeting(profile, now = new Date()) {
  const h = now.getHours();
  const part = h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Late evening';
  return profile?.name ? `${part}, ${profile.name}` : part;
}

/**
 * The single most important personal alert for right now, or null.
 * Priority: severe air > heat > storm/rain > cold > lens insight.
 */
export function personalAlert(snapshot, profile, units = 'metric') {
  if (!snapshot || !profile) return null;
  const t = thresholds(profile);
  const n = snapshot.now;
  const sens = profile.sensitivities ?? {};
  const hours = snapshot.hours ?? [];

  // --- air quality (respiratory-sensitive users escalate earlier) ---
  const aqi = snapshot.currentAqi?.aqi;
  if (aqi != null && aqi >= t.aqi) {
    const severe = aqi >= 250;
    return {
      kind: severe ? 'danger' : 'warn',
      icon: '😷',
      title: `Air quality ${aqi} — ${snapshot.currentAqi.category}${sens.air ? ' (you are air-sensitive)' : ''}`,
      text: sens.air
        ? `This air is rough for you. Carry a mask, keep inhaler handy, and prefer indoor workouts today.`
        : `Sensitive groups should take it easy outdoors today.`,
    };
  }

  // --- heat ---
  if (n.hi != null && n.hi >= t.heatIndex) {
    return {
      kind: 'warn',
      icon: '🥵',
      title: `Feels like ${fmtTemp(n.hi, units, true)} — heat stress zone`,
      text: sens.heat
        ? 'You feel heat more than most: hydrate before stepping out, shade your errands, and avoid 12–4 PM exertion.'
        : 'Hydrate well and plan outdoor tasks for morning or evening.',
    };
  }

  // --- rain/storm inside the warning horizon ---
  const horizon = hours.slice(0, 10);
  const wet = horizon.find((h) => (h.precipitation_probability ?? 0) >= t.rainProb);
  if (wet) {
    const hh = wet.time.slice(11, 16);
    const stormy = [95, 96, 99].includes(wet.weather_code);
    return {
      kind: stormy ? 'danger' : 'info',
      icon: stormy ? '⛈️' : '☔',
      title: `${stormy ? 'Thunderstorm' : 'Rain'} likely around ${hh} (${Math.round(wet.precipitation_probability)}%)`,
      text: sens.rain
        ? 'Carry the umbrella even if the sky looks clear — getting soaked is not an option for you today.'
        : 'Keep rain gear handy if you are heading out.',
    };
  }

  // --- cold ---
  if (n.temp != null && n.temp <= t.coldTemp) {
    return {
      kind: 'info',
      icon: '🧥',
      title: `${fmtTemp(n.temp, units, true)} right now — layer up`,
      text: sens.cold
        ? 'You feel the cold quickly: take the extra layer, especially after sunset.'
        : 'A light layer will keep the chill out.',
    };
  }

  // --- lens headline (only when nothing urgent) ---
  return lensInsight(snapshot, profile, units);
}

/** Lens-specific good-news insight, or null when nothing notable. */
export function lensInsight(snapshot, profile, units = 'metric') {
  const lens = profile?.lens;
  const hours = snapshot.hours ?? [];
  if (!hours.length) return null;

  const slice = hours.slice(0, 24);
  if (lens === 'fitness') {
    const scored = slice.map((h) => ({ ...h, score: runScore(h) }));
    const w = bestWindows(scored, 1, 2)[0];
    if (!w) return null;
    const b = band(w.avg);
    if (w.avg < 40) return { kind: 'info', icon: '🏃', title: 'No good workout window in the next 24h', text: 'Indoor training is the smarter call today.' };
    return { kind: 'ok', icon: '🏃', title: `Best workout window: ${scored[w.startIdx].time.slice(11, 16)}–${scored[w.endIdx].time.slice(11, 16)}`, text: `${b.label} conditions (${w.avg}/100) — ${scored[w.startIdx].wx.label.toLowerCase()}.` };
  }
  if (lens === 'commuter') {
    const scored = slice.map((h) => ({ ...h, score: driveScore(h) }));
    const morning = scored.filter((h) => Number(h.time.slice(11, 13)) >= 7 && Number(h.time.slice(11, 13)) <= 9);
    const avg = morning.length ? Math.round(morning.reduce((a, b) => a + b.score, 0) / morning.length) : null;
    if (avg == null) return null;
    const b = band(avg);
    return { kind: b.cls === 'safe' ? 'ok' : 'warn', icon: '🚗', title: `Morning commute (7–9): ${b.label.toLowerCase()} driving conditions`, text: b.cls === 'safe' ? 'No fog or rain flagged for the office run.' : 'Leave a few minutes early — check the commute card below.' };
  }
  if (lens === 'event') {
    const scored = slice.map((h) => ({ ...h, score: eventScore(h) }));
    const w = bestWindows(scored, 1, 3)[0];
    if (!w) return null;
    const b = band(w.avg);
    return { kind: b.cls === 'safe' ? 'ok' : 'warn', icon: '🎉', title: `Best event window: ${scored[w.startIdx].time.slice(11, 16)}–${scored[w.endIdx].time.slice(11, 16)}`, text: `${b.label} conditions for outdoor plans (${w.avg}/100).` };
  }
  if (lens === 'traveler') {
    const week = snapshot.days ?? [];
    const best = [...week].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
    if (!best) return null;
    return { kind: 'ok', icon: '✈️', title: `${best.label} looks like the best day this week`, text: `${best.wx.label} · ${fmtTemp(best.temp_min, units)}–${fmtTemp(best.temp_max, units)} · rain ${Math.round(best.precip_prob_max ?? 0)}%.` };
  }
  if (lens === 'agriculture') {
    const soil = hours[0]?.soil_moisture_0_to_1cm;
    if (soil == null) return null;
    const pct = Math.round(soil * 100);
    if (pct < 15) return { kind: 'warn', icon: '💧', title: `Soil moisture is low (${pct}%)`, text: 'Plan irrigation in the early morning or evening — check the 7-day plan below.' };
    if (pct > 42) return { kind: 'info', icon: '⚠️', title: `Soil is wet (${pct}%)`, text: 'Hold irrigation and make sure drainage is clear.' };
    return { kind: 'ok', icon: '🌾', title: `Soil moisture is adequate (${pct}%)`, text: 'No irrigation needed today.' };
  }
  return null;
}

/** What Mausam will watch for this profile — shown at onboarding finish. */
export function watchList(profile) {
  const items = [];
  const s = profile?.sensitivities ?? {};
  if (s.heat) items.push(['🥵', 'Heat stress', 'Warnings trigger earlier for you (feels-like 32°C+)']);
  if (s.cold) items.push(['🥶', 'Cold snaps', 'You get layered-up nudges below 16°C']);
  if (s.rain) items.push(['☔', 'Rain timing', 'Umbrella alerts from 40% probability']);
  if (s.air) items.push(['😷', 'Air quality', 'Mask advice from AQI 100, not 150']);
  if (!items.length) items.push(['🌤️', 'Daily conditions', 'Standard thresholds tuned for Indian climate']);
  const lensItems = {
    fitness: ['🏃', 'Workout windows', 'Best 2-hour slots + hydration risk'],
    commuter: ['🚗', 'Commute risk', '7–9 AM and 5–7 PM driving conditions'],
    agriculture: ['💧', 'Irrigation plan', '7-day schedule from soil + rain forecast'],
    traveler: ['🧳', 'Packing lists', 'Auto-built from your week ahead'],
    event: ['🎉', 'Event windows', 'Best slots + setup warnings'],
  };
  items.push(lensItems[profile?.lens] ?? lensItems.fitness);
  return items;
}
