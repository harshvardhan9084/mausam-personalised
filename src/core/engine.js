/**
 * engine.js — the persona advisory engine.
 *
 * Takes a raw Open-Meteo bundle and computes EVERYTHING the five
 * dashboards show: CPCB AQI, heat index, per-hour scores, run windows,
 * commute risk, irrigation plans, packing lists and event suitability.
 * No hardcoded weather numbers — only rules.
 */

import { computeCPCBAqi, uvLabel } from './aqi-cpcb.js';
import { heatIndex } from '../utils/format.js';
import { describeWeather } from '../api/wmo.js';
import { runScore, eventScore, driveScore, dayScore, fieldScore, bestWindows, worstStretch, band } from './scoring.js';

/** Is an ISO hour between sunrise/sunset? */
function isNightHour(iso, days) {
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  const day = days.find((d) => d.date === date);
  if (!day) return false;
  const sr = day.sunrise.slice(11, 16);
  const ss = day.sunset.slice(11, 16);
  return time < sr || time >= ss;
}

/** Compute CPCB AQI + derived fields for every hour. */
function enrichHours(hours, days) {
  return hours.map((h) => {
    const aqi = h.air ? computeCPCBAqi(h.air) : null;
    const night = isNightHour(h.time, days);
    return {
      ...h,
      aqi: aqi?.aqi ?? null,
      aqiFull: aqi,
      hi: heatIndex(h.temperature_2m, h.relative_humidity_2m),
      night,
      wx: describeWeather(h.weather_code, night),
    };
  });
}

/**
 * Build the full advisory snapshot from a raw weather bundle.
 * @param {Object} bundle result of fetchWeatherBundle()
 */
export function buildSnapshot(bundle) {
  const hours = enrichHours(bundle.hours, bundle.days);
  const nowHour = hours[0];
  const currentAqi = nowHour?.aqiFull ?? { aqi: null, category: 'Unknown', color: '#8b8fa8', advice: '', dominant: null, subIndices: {} };

  const days = bundle.days.map((d, i) => ({
    ...d,
    score: dayScore(d),
    wx: describeWeather(d.weather_code, false),
    label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' }),
  }));

  return {
    bundle,
    fetchedAt: bundle.fetchedAt,
    timezone: bundle.timezone,
    now: {
      ...bundle.current,
      hi: heatIndex(bundle.current.feels, bundle.current.humidity),
      wx: describeWeather(bundle.current.weather_code, !bundle.current.is_day),
    },
    currentAqi, // CPCB AQI at the current hour
    uvNow: { value: nowHour?.uv_index ?? null, label: uvLabel(nowHour?.uv_index) },
    hours,
    days,
  };
}

/* ================================================================
   FITNESS
================================================================ */
export function fitnessAdvisory(s) {
  const scored = s.hours.map((h) => ({ ...h, score: runScore(h) }));

  const windows = bestWindows(scored.filter((_, i) => i < 24), 2, 2).map((w) => {
    const a = scored[w.startIdx];
    const b = scored[w.endIdx];
    const bd = band(w.avg);
    const reasons = [];
    reasons.push(`${a.wx.label.toLowerCase()} ${Math.round(a.temperature_2m)}–${Math.round(b.temperature_2m)}°C`);
    if ((a.uv_index ?? 0) < 4) reasons.push(`UV ${(a.uv_index ?? 0).toFixed(1)} — low`);
    if ((a.aqi ?? 999) <= 100) reasons.push(`AQI ${a.aqi} — acceptable`);
    if ((a.precipitation_probability ?? 0) < 30) reasons.push(`${a.precipitation_probability ?? 0}% rain`);
    return {
      slot: `${a.time.slice(11, 16)} – ${b.time.slice(11, 16)}`,
      rating: bd.label,
      badge: bd.badge,
      color: bd.color,
      score: w.avg,
      reason: reasons.join(' · '),
    };
  });

  const stretches = worstStretch(scored.slice(0, 24), 40, 3);
  const avoid = stretches.length
    ? `${scored[stretches[0].startIdx].time.slice(11, 16)} – ${scored[stretches[0].endIdx].time.slice(11, 16)} — heat, UV or air quality make exertion risky`
    : null;

  const hiNow = s.now.hi;
  const hydrationTips = [`Start with 400–500 ml water 30 min before your workout`];
  if (hiNow >= 35) hydrationTips.push(`Heat index ${hiNow}°C — add 200–250 ml per 20 min and electrolytes`);
  if ((s.now.humidity ?? 0) > 70) hydrationTips.push('High humidity slows sweat evaporation — do not wait to feel thirsty');

  const gear = [];
  if ((s.currentAqi.aqi ?? 0) >= 150) gear.push(['😷', 'N95 mask', `CPCB AQI ${s.currentAqi.aqi} (${s.currentAqi.category})`]);
  if ((s.uvNow.value ?? 0) >= 6) gear.push(['🧴', 'SPF 30+ sunscreen', `UV index ${Math.round(s.uvNow.value)} — ${s.uvNow.label}`]);
  if (s.hours.slice(0, 12).some((h) => (h.precipitation_probability ?? 0) >= 50)) gear.push(['🧥', 'Light rain jacket', 'Rain likely in the next 12 hours']);
  if (hiNow >= 38) gear.push(['🧢', 'Cap + light clothing', `Feels like ${hiNow}°C`]);
  if (!gear.length) gear.push(['✅', 'Standard kit', 'No special precautions needed right now']);

  const weekBest = [...s.days]
    .map((d, i) => ({ ...d, i }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((d) => ({
      day: `${d.label} (${d.date.slice(5)})`,
      score: d.score,
      note: `${d.wx.label} · ${Math.round(d.temp_min)}–${Math.round(d.temp_max)}°C · rain ${d.precip_prob_max ?? 0}%`,
    }));

  return { scored, windows, avoid, hydrationTips, gear, weekBest };
}

/* ================================================================
   COMMUTER
================================================================ */
export function commuterAdvisory(s) {
  const scored = s.hours.map((h) => ({ ...h, score: driveScore(h) }));

  const analyseWindow = (startH, endH) => {
    const list = scored.filter((h) => {
      const hh = Number(h.time.slice(11, 13));
      return hh >= startH && hh <= endH;
    });
    if (!list.length) return null;
    const avg = Math.round(list.reduce((a, b) => a + b.score, 0) / list.length);
    const minVis = Math.min(...list.map((h) => h.visibility ?? 99999));
    const maxRain = Math.max(...list.map((h) => h.precipitation_probability ?? 0));
    const maxGust = Math.max(...list.map((h) => h.wind_gusts_10m ?? 0));
    const fog = list.some((h) => [45, 48].includes(h.weather_code) || (h.visibility ?? 99999) < 1000);
    const storm = list.some((h) => [95, 96, 99].includes(h.weather_code));

    let mode = '🚗 Good driving conditions expected';
    if (fog) mode = '🌫️ Fog risk — low beams, increase following distance';
    else if (storm) mode = '⛈️ Thunderstorm likely — avoid two-wheelers, expect waterlogging';
    else if (maxRain >= 60) mode = '🌧️ High rain probability — public transport preferred, carry rain gear';
    else if (maxRain >= 35) mode = '🌦️ Showers possible — keep rain gear handy';
    else if (maxGust >= 45) mode = '💨 Strong gusts — caution on two-wheelers and exposed roads';
    else if (minVis < 4000) mode = '🌫️ Reduced visibility — drive with headlights on';

    return {
      time: `${String(startH).padStart(2, '0')}:00 – ${String(endH).padStart(2, '0')}:59`,
      score: avg,
      band: band(avg),
      visibility: minVis,
      rainRisk: maxRain,
      gusts: maxGust,
      fog,
      mode,
      hours: list,
    };
  };

  const morning = analyseWindow(7, 9);
  const evening = analyseWindow(17, 19);

  const tonightFog = s.hours
    .slice(0, 24)
    .filter((h) => Number(h.time.slice(11, 13)) >= 20)
    .find((h) => [45, 48].includes(h.weather_code) || (h.visibility ?? 99999) < 1000);

  const nowBand = band(s.hours[0]?.score ?? 60);
  return { scored, morning, evening, tonightFog, nowBand };
}

/* ================================================================
   AGRICULTURE
================================================================ */
export function agricultureAdvisory(s) {
  const soilPct = s.hours[0]?.soil_moisture_0_to_1cm != null
    ? Math.round(s.hours[0].soil_moisture_0_to_1cm * 100)
    : null;

  const soilStatus = soilPct == null
    ? { label: 'Unknown', color: '#8b8fa8' }
    : soilPct < 15 ? { label: `Dry (${soilPct}%) — irrigation needed`, color: '#e05c5c' }
    : soilPct < 32 ? { label: `Low (${soilPct}%) — plan irrigation`, color: '#f7c44f' }
    : soilPct <= 42 ? { label: `Adequate (${soilPct}%)`, color: '#4caf82' }
    : { label: `Wet (${soilPct}%) — risk of waterlogging`, color: '#6ab0e8' };

  // 7-day irrigation plan from real precipitation forecast
  const rain3 = s.days.slice(0, 3).reduce((a, d) => a + (d.precipitation_sum ?? 0), 0);
  const schedule = s.days.map((d, i) => {
    const rain = d.precipitation_sum ?? 0;
    const prob = d.precip_prob_max ?? 0;
    let action, icon;
    if (rain >= 15 || prob >= 80) { action = prob >= 80 ? `Skip — ${Math.round(prob)}% rain, ${rain.toFixed(0)} mm expected` : 'Skip — heavy rain expected'; icon = '⏭️'; }
    else if (rain >= 5 || prob >= 50) { action = `Skip — showers likely (${rain.toFixed(0)} mm)`; icon = '⏭️'; }
    else if (i === 0 && rain3 >= 10) { action = 'Skip — rain arriving within 3 days'; icon = '⏭️'; }
    else if (soilPct != null && soilPct < 15) { action = 'Irrigate — soil is dry'; icon = '💧'; }
    else if (soilPct != null && soilPct > 42) { action = 'Hold — soil saturated, drain excess'; icon = '⚠️'; }
    else { action = rain >= 1 ? 'Light irrigation only' : 'Normal irrigation'; icon = '✅'; }
    return { day: d.label, date: d.date, rain, prob, action, icon };
  });

  // Fungal / blight risk from humidity + temperature band
  const rhNow = s.now.humidity ?? 0;
  const tNow = s.now.temp ?? 0;
  let fungal = null;
  if (rhNow >= 80 && tNow >= 18 && tNow <= 32) fungal = { level: 'High', cls: 'alert-danger', text: `Humidity ${rhNow}% in the ${Math.round(tNow)}°C band — strong risk of fungal blight. Preventive fungicide advisable.` };
  else if (rhNow >= 68) fungal = { level: 'Moderate', cls: 'alert-warn', text: `Humidity ${rhNow}% — monitor for early blight signs on dense canopy.` };

  const frost = s.days.some((d) => d.temp_min <= 2);
  const fieldScored = s.hours.map((h) => ({ ...h, score: fieldScore(h) }));
  const fieldWindows = bestWindows(fieldScored.slice(0, 24), 2, 3).map((w) => {
    const a = fieldScored[w.startIdx];
    const b = fieldScored[w.endIdx];
    return { slot: `${a.time.slice(11, 16)} – ${b.time.slice(11, 16)}`, score: w.avg, band: band(w.avg) };
  });

  const todayAction =
    soilPct != null && soilPct > 42 ? 'Drain excess water — soil is saturated.'
    : rain3 >= 10 ? `Conserve water — ${rain3.toFixed(0)} mm rain expected in the next 3 days.`
    : soilPct != null && soilPct < 15 ? 'Soil is dry — irrigate today (early morning or evening).'
    : 'Soil moisture adequate — no irrigation needed today.';

  return { soilPct, soilStatus, schedule, fungal, frost, fieldScored, fieldWindows, todayAction, rain3 };
}

/* ================================================================
   TRAVELER
================================================================ */
export function travelerAdvisory(s) {
  const packing = [];
  const weekRain = s.days.some((d) => (d.precip_prob_max ?? 0) >= 50 || (d.precipitation_sum ?? 0) >= 10);
  if (weekRain) {
    const wettest = [...s.days].sort((a, b) => (b.precip_prob_max ?? 0) - (a.precip_prob_max ?? 0))[0];
    packing.push(['☂️', 'Umbrella / raincoat', `Rain up to ${Math.round(wettest.precip_prob_max ?? 0)}% on ${wettest.label}`]);
  }
  if ((s.uvNow.value ?? 0) >= 5 || s.days.some((d) => (d.uv_max ?? 0) >= 6)) {
    packing.push(['🧴', 'Sunscreen SPF 30+', `UV index up to ${Math.round(Math.max(s.uvNow.value ?? 0, ...s.days.map((d) => d.uv_max ?? 0)))}`]);
  }
  if (s.now.hi >= 36) packing.push(['💧', 'Water bottle', `Heat index ${s.now.hi}°C — hydration critical`]);
  if ((s.currentAqi.aqi ?? 0) >= 150) packing.push(['😷', 'N95 mask', `CPCB AQI ${s.currentAqi.aqi} (${s.currentAqi.category})`]);
  if (s.days.some((d) => d.temp_min <= 12)) {
    const coldest = [...s.days].sort((a, b) => a.temp_min - b.temp_min)[0];
    packing.push(['🧥', 'Warm layer', `Drops to ${Math.round(coldest.temp_min)}°C on ${coldest.label}`]);
  }
  if (s.days.some((d) => (d.gusts_max ?? 0) >= 40)) packing.push(['💨', 'Windcheater', 'Gusty days forecast this week']);
  if (!packing.length) packing.push(['✅', 'Standard kit', 'No weather-specific items needed']);

  const best = [...s.days]
    .map((d, i) => ({ ...d, i }))
    .sort((a, b) => b.score - a.score)[0];
  const worst = [...s.days]
    .map((d, i) => ({ ...d, i }))
    .sort((a, b) => a.score - b.score)[0];

  const scored = s.hours.map((h) => ({ ...h, score: eventScore(h) }));
  return { packing, best, worst, scored };
}

/* ================================================================
   EVENT PLANNER
================================================================ */
export function eventAdvisory(s) {
  const scored = s.hours.map((h) => ({ ...h, score: eventScore(h) }));

  const windows = bestWindows(scored.slice(0, 16), 3, 2).map((w) => {
    const a = scored[w.startIdx];
    const b = scored[w.endIdx];
    const bd = band(w.avg);
    const notes = [];
    if ((a.precipitation_probability ?? 0) <= 25) notes.push('low rain risk');
    if ((a.feels ?? 25) < 30) notes.push(`comfortable ${Math.round(a.feels)}°C feels-like`);
    if ((a.uv_index ?? 0) < 3) notes.push('low UV');
    if ((a.wind_gusts_10m ?? 0) < 25) notes.push('light wind');
    return {
      window: `${a.time.slice(11, 16)} – ${b.time.slice(11, 16)}`,
      score: w.avg,
      color: bd.color,
      badge: bd.badge,
      note: notes.length ? notes.join(' · ') : 'check conditions',
    };
  });

  const days = s.days.map((d, i) => ({ ...d, i }));
  const best = days.sort((a, b) => b.score - a.score)[0];
  const worst = days.sort((a, b) => a.score - b.score)[0];

  const h = s.hours[0] ?? {};
  const breakdown = [
    ['Temperature', `${Math.round(s.now.temp)}°C (feels ${Math.round(s.now.feels)}°C)`,
      (s.now.feels ?? 24) < 12 ? 'Cold — arrange heating/shade' : (s.now.feels ?? 24) > 34 ? 'Hot — shade and hydration points needed' : 'Comfortable range'],
    ['Humidity', `${s.now.humidity ?? '—'}%`,
      (s.now.humidity ?? 50) > 75 ? 'Very humid — feels sticky, plan ventilation' : (s.now.humidity ?? 50) < 30 ? 'Dry air' : 'Acceptable'],
    ['Wind', `${Math.round(s.now.wind ?? 0)} km/h`,
      (s.now.wind ?? 0) > 30 ? 'Strong — secure tents/decor' : 'Fine for outdoor setups'],
    ['Rain risk', `${Math.max(...s.hours.slice(0, 12).map((x) => x.precipitation_probability ?? 0))}% next 12h`,
      (s.hours[0]?.precipitation_probability ?? 0) >= 50 ? 'Cover required' : 'Low risk in the near term'],
    ['UV', `${(h.uv_index ?? 0).toFixed(1)} — ${uvLabel(h.uv_index)}`,
      (h.uv_index ?? 0) >= 7 ? 'Daytime shade recommended' : 'Manageable'],
    ['Air quality', s.currentAqi.aqi != null ? `${s.currentAqi.aqi} — ${s.currentAqi.category}` : 'Unavailable',
      s.currentAqi.advice || '—'],
  ];

  return { scored, windows, best, worst, breakdown };
}

/** Dispatch map. */
export const ADVISORS = {
  fitness: fitnessAdvisory,
  commuter: commuterAdvisory,
  agriculture: agricultureAdvisory,
  traveler: travelerAdvisory,
  event: eventAdvisory,
};
