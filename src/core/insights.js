/**
 * insights.js — universal insight engine + the additive "For You" layer (v0.5).
 *
 * The dashboard shows EVERYTHING to EVERYONE. Personalisation only adds:
 *   - computeAlerts()       → the banners worth interrupting for
 *   - computeInsights()     → "Mausam says" cards (same for all users)
 *   - computeForYou()       → profile-driven cards, ONLY if a profile exists
 *   - computeDayTimeline()  → the user's day shape with hour weather
 *   - computeBestDays()     → best/worst of the next 10 days
 *   - computeFarmCards()    → spray windows, soil moisture, 7-day rain
 *
 * All user-facing strings come from i18n (English / हिंदी).
 */

import { temp as fmtTemp, wind as fmtWind, hourLabel, dateLabel } from '../utils/format.js';
import { runScore, eventScore, driveScore, dayScore, bestWindows, band } from './scoring.js';
import { t, getLang } from './i18n.js';
import { aqiCat, aqiAdvice } from './aqi-cpcb.js';

const hh = (iso) => Number(iso?.slice(11, 13));
const clampRound = (v) => Math.round(Math.max(0, Math.min(100, v ?? 0)));

/* ================================================================
   ALERTS — stacked, only when it genuinely matters
================================================================ */

export function computeAlerts(s) {
  if (!s) return [];
  const out = [];
  const h12 = s.hours.slice(0, 12);
  const h6 = s.hours.slice(0, 6);

  const storm = h12.find((h) => [95, 96, 99].includes(h.weather_code));
  if (storm) {
    out.push({ kind: 'danger', icon: 'storm', title: t('alert_storm'), text: t('alert_storm_t', { t: hourLabel(storm.time) }) });
  }
  const aqi = s.currentAqi?.aqi;
  if (aqi != null && aqi >= 300) {
    out.push({ kind: 'danger', icon: 'fog', title: t('alert_severe_air', { n: aqi }), text: t('alert_severe_air_t') });
  }
  const hi = s.now.hi ?? s.now.feels;
  if (hi != null && hi >= 41) {
    out.push({ kind: 'danger', icon: 'thermo', title: t('alert_heat', { t: fmtTemp(hi, true) }), text: t('alert_heat_t') });
  }
  const heavyRain = h6.find((h) => (h.precipitation_probability ?? 0) >= 75 || (h.precipitation ?? 0) >= 7.5);
  if (heavyRain) {
    out.push({ kind: 'warn', icon: 'rain', title: t('alert_rain'), text: t('alert_rain_t', { t: hourLabel(heavyRain.time) }) });
  }
  if (aqi != null && aqi >= 200 && aqi < 300) {
    out.push({ kind: 'warn', icon: 'fog', title: t('alert_poor_air', { n: aqi }), text: t('alert_poor_air_t') });
  }
  if (hi != null && hi >= 37 && hi < 41) {
    out.push({ kind: 'warn', icon: 'sun', title: t('alert_warmer', { t: fmtTemp(hi, true) }), text: t('alert_warmer_t') });
  }
  if ((s.now.temp ?? 99) <= 6) {
    out.push({ kind: 'warn', icon: 'snow', title: t('alert_cold', { t: fmtTemp(s.now.temp, true) }), text: t('alert_cold_t') });
  }
  return out.slice(0, 2);
}

/* ================================================================
   INSIGHTS — "Mausam says" (identical for everyone)
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
    out.push({ icon: 'rain', tone: 'info', title: t('ins_rain_window'), text: t('ins_rain_window_t', { t: hourLabel(firstWet.time), p: Math.round(maxPop) }), ask: t('ask_ins_rain', { t: hourLabel(firstWet.time), p: Math.round(maxPop) }) });
  } else if (maxPop < 20) {
    out.push({ icon: 'partly', tone: 'good', title: t('ins_dry_day'), text: t('ins_dry_day_t', { p: Math.round(maxPop) }), ask: t('ask_ins_dry', { p: Math.round(maxPop) }) });
  }

  /* heat / comfort arc */
  if (h24.length > 6) {
    const maxH = h24.reduce((a, h) => ((h.temperature_2m ?? -99) > (a.temperature_2m ?? -99) ? h : a), h24[0]);
    const minH = h24.reduce((a, h) => ((h.temperature_2m ?? 99) < (a.temperature_2m ?? 99) ? h : a), h24[0]);
    if (maxH.time && minH.time) {
      const swing = Math.round((maxH.temperature_2m ?? 0) - (minH.temperature_2m ?? 0));
      out.push({
        icon: swing >= 10 ? 'thermo' : 'trend', tone: swing >= 12 ? 'warn' : 'info', title: t('ins_swing', { n: swing }),
        ask: t('ask_ins_swing', { n: swing }),
        text: t('ins_swing_t', { lo: fmtTemp(minH.temperature_2m), tlo: hourLabel(minH.time), hi: fmtTemp(maxH.temperature_2m), thi: hourLabel(maxH.time) }),
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
      icon: 'calcheck', tone: bd.label === 'Good' ? 'good' : 'info',
      ask: t('ask_ins_slot', { t: `${hourLabel(a.time)} – ${hourLabel(b.time)}` }),
      title: t('ins_best_slot', { s: bd.label === 'Good' ? t('best_run_days') : bd.label === 'Fair' ? t('fair_run_days') : t('poor_run_days') }),
      text: t('ins_best_slot_t', {
        t: `${hourLabel(a.time)} – ${hourLabel(b.time)}`,
        p: Math.round(a.precipitation_probability ?? 0),
        t1: fmtTemp(a.temperature_2m), t2: fmtTemp(b.temperature_2m),
        uv: (a.uv_index ?? 0) < 5 ? t('ins_uv_easy') : '',
      }),
    });
  }

  /* UV */
  if ((s.uvNow.value ?? 0) >= 7) {
    out.push({ icon: 'sun', tone: 'warn', title: t('ins_uv', { n: Math.round(s.uvNow.value), l: s.uvNow.label }), text: t('ins_uv_t'), ask: t('ask_ins_uv', { n: Math.round(s.uvNow.value), l: s.uvNow.label }) });
  }

  /* wind / gust */
  const gustMax = Math.max(0, ...h12.map((h) => h.wind_gusts_10m ?? 0));
  if (gustMax >= 40) {
    out.push({ icon: 'wind', tone: 'warn', title: t('ins_gusts'), text: t('ins_gusts_t', { w: fmtWind(gustMax) }), ask: t('ask_ins_gusts', { w: fmtWind(gustMax) }) });
  }

  /* AQI */
  const aqi = s.currentAqi?.aqi;
  if (aqi != null) {
    if (aqi >= 150) out.push({ icon: 'fog', tone: aqi >= 300 ? 'danger' : 'warn', title: t('ins_aqi_bad', { n: aqi, c: aqiCat(s.currentAqi.aqi, getLang()) }), text: `${aqiAdvice(aqi, getLang())} ${t('aqi_dominant')}: ${s.currentAqi.dominant ?? '—'}.`, ask: t('ask_ins_aqi', { n: aqi, c: aqiCat(s.currentAqi.aqi, getLang()) }) });
    else if (aqi <= 60) out.push({ icon: 'crops', tone: 'good', title: t('ins_clean_air', { n: aqi }), text: t('ins_clean_air_t'), ask: t('ask_ins_clean', { n: aqi }) });
  }

  /* fog / visibility */
  const fog = h12.find((h) => [45, 48].includes(h.weather_code) || (h.visibility ?? 99999) < 1000);
  if (fog) {
    out.push({ icon: 'fog', tone: 'warn', title: t('ins_fog'), text: t('ins_fog_t', { t: hourLabel(fog.time) }), ask: t('ask_ins_fog', { t: hourLabel(fog.time) }) });
  }

  return out.slice(0, 6);
}

/* ================================================================
   DAY TIMELINE — the user's day shape with weather at each beat
================================================================ */

const minutesOf = (hhmm) => {
  const m = String(hhmm ?? '').match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * @returns {Array<{icon, label, time, temp, pop, cls}>|null}
 */
export function computeDayTimeline(s, profile) {
  if (!s || !profile?.scheduleOn) return null;
  const beats = [
    ['sunrise', t('day_wake'), profile.schedule.wake],
    ['scooter', t('day_leave'), profile.schedule.leaveAm],
    ['home', t('day_back'), profile.schedule.backPm],
    ['moon', t('day_sleep'), profile.schedule.sleep],
  ];
  const rows = [];
  for (const [icon, label, timeStr] of beats) {
    const mins = minutesOf(timeStr);
    if (mins == null) continue;
    const target = `${String(Math.floor(mins / 60)).padStart(2, '0')}:00`;
    let hour = s.hours.find((h) => h.time.endsWith(`T${target}`));
    if (!hour) hour = s.hours.reduce((best, h) => {
      const hm = minutesOf(h.time.slice(11, 16));
      return hm != null && (best == null || Math.abs(hm - mins) < Math.abs(best.hm - mins)) ? { h, hm } : best;
    }, null)?.h;
    if (!hour) continue;
    rows.push({
      icon, label, time: timeStr,
      temp: fmtTemp(hour.temperature_2m),
      pop: Math.round(hour.precipitation_probability ?? 0),
      icon2: hour.wx?.icon ?? '·',
      cls: (hour.precipitation_probability ?? 0) >= 50 ? 'wet' : (hour.temperature_2m ?? 0) >= 38 ? 'hot' : '',
    });
  }
  return rows.length ? rows : null;
}

/* ================================================================
   FARM CARDS — spray window, soil, 7-day rain
================================================================ */

export function computeFarmCards(s) {
  if (!s) return [];
  const cards = [];
  const h24 = s.hours.slice(0, 24);

  /* spray window: wind < 15 km/h + rain chance < 30% */
  const calm = h24.find((h) => (h.wind_speed_10m ?? 99) < 15 && (h.precipitation_probability ?? 0) < 30);
  const wet = h24.filter((h) => (h.precipitation_probability ?? 0) >= 40);
  if (calm && wet.length < 8) {
    cards.push({
      icon: 'crops', tone: 'good', title: t('fy_farm_spray'),
      text: t('fy_farm_spray_good', { t: hourLabel(calm.time), w: fmtWind(calm.wind_speed_10m), p: Math.round(calm.precipitation_probability ?? 0) }),
      /* v0.8.37: every advisory carries its own conversation — the question is
         born with the data, so tapping the row asks exactly what the row saw. */
      ask: t('ask_spray_good', { t: hourLabel(calm.time) }),
    });
  } else {
    const maxWind = Math.max(0, ...h24.map((h) => h.wind_speed_10m ?? 0));
    const maxPop = Math.max(0, ...h24.map((h) => h.precipitation_probability ?? 0));
    cards.push({
      icon: 'crops', tone: 'warn', title: t('fy_farm_spray'),
      text: t('fy_farm_spray_bad', { w: fmtWind(maxWind), p: Math.round(maxPop) }),
      ask: t('ask_spray_none'),
    });
  }

  /* soil moisture (m³/m³ → % of field capacity ~0.40) */
  const top = s.hours[0]?.soil_moisture_0_to_1cm;
  if (top != null) {
    const pct = Math.round(Math.min(100, (top / 0.4) * 100));
    const text = top < 0.15 ? t('fy_farm_soil_dry', { v: pct })
      : top > 0.35 ? t('fy_farm_soil_wet', { v: pct })
        : t('fy_farm_soil_ok', { v: pct });
    cards.push({
      icon: 'droplet', tone: top < 0.15 ? 'warn' : top > 0.35 ? 'info' : 'good', title: t('fy_farm_soil'),
      text,
      ask: t('ask_soil', { v: pct }),
    });
  }

  /* 7-day rain total */
  const week = s.days.slice(0, 7);
  const total = week.reduce((a, d) => a + (d.precipitation_sum ?? 0), 0);
  const peakPop = Math.max(0, ...week.map((d) => d.precip_prob_max ?? 0));
  cards.push({
    icon: 'umbrella', tone: total >= 40 ? 'good' : total >= 10 ? 'info' : 'warn', title: t('fy_farm_rain7'),
    text: t('fy_farm_rain7_t', { n: Math.round(total * 10) / 10, p: Math.round(peakPop) }),
    ask: t('ask_rain7', { n: Math.round(total * 10) / 10 }),
  });

  return cards;
}

/* ================================================================
   FOR YOU — strictly additive, only when a profile exists
================================================================ */

export function computeForYou(s, p) {
  if (!s || !p) return null;
  const cards = [];
  const push = (c) => { if (cards.length < 6) cards.push(c); };

  /* commute verdicts from the schedule */
  if (p.scheduleOn) {
    const commute = (startH, label, schedT) => {
      const list = s.hours.filter((h) => hh(h.time) >= startH && hh(h.time) <= startH + 1).map((h) => ({ ...h, score: driveScore(h) }));
      if (!list.length) return;
      const avg = Math.round(list.reduce((a, h) => a + h.score, 0) / list.length);
      const maxRain = Math.max(...list.map((h) => h.precipitation_probability ?? 0));
      const bd = band(avg);
      let note;
      if ([95, 96, 99].includes(list[0]?.weather_code)) note = t('fy_commute_storm');
      else if (maxRain >= 55) note = t('fy_commute_wet', { p: Math.round(maxRain) });
      else if (maxRain >= 30) note = t('fy_commute_shower');
      else if (avg >= 70) note = t('fy_commute_clear');
      else note = t('fy_commute_mixed');
      push({
        icon: 'scooter', tone: bd.label === 'Good' ? 'good' : bd.label === 'Fair' ? 'info' : 'warn', title: label,
        ask: t('ask_commute', { t: schedT }),
        text: `${bd.label === 'Good' ? t('best_run_days') : bd.label === 'Fair' ? t('fair_run_days') : t('poor_run_days')} · ${note}`,
      });
    };
    const parseH = (v, fb) => {
      const m = String(v ?? '').match(/(\d{1,2})/);
      return m ? Math.max(0, Math.min(23, Number(m[1]))) : fb;
    };
    commute(parseH(p.schedule.leaveAm, 8), t('fy_commute_am', { t: p.schedule.leaveAm }), p.schedule.leaveAm);
    commute(parseH(p.schedule.backPm, 18), t('fy_commute_pm', { t: p.schedule.backPm }), p.schedule.backPm);
  }

  /* activity windows */
  const ACT = {
    run: { label: 'fy_run', fn: runScore, icon: 'run' },
    walk: { label: 'fy_walk', fn: runScore, icon: 'walk' },
    cycling: { label: 'fy_cycling', fn: runScore, icon: 'bike' },
    fitness: { label: 'fy_run', fn: runScore, icon: 'run' },
    outdoor: { label: 'fy_outdoor', fn: eventScore, icon: 'basket' },
    cricket: { label: 'fy_cricket', fn: eventScore, icon: 'cricket' },
    photography: { label: 'fy_photography', fn: eventScore, icon: 'camera' },
    events: { label: 'fy_outdoor', fn: eventScore, icon: 'diya' },
    construction: { label: 'fy_outdoor', fn: eventScore, icon: 'bricks' },
  };
  for (const act of p.interests ?? []) {
    const spec = ACT[act];
    if (!spec) continue;
    const scored = s.hours.slice(0, 16).map((h) => ({ ...h, score: spec.fn(h) }));
    const wins = bestWindows(scored, 1, 2);
    if (!wins.length) continue;
    const w0 = wins[0];
    const a = scored[w0.startIdx], b = scored[w0.endIdx];
    const bd = band(w0.avg);
    push({
      icon: spec.icon, tone: bd.label === 'Good' ? 'good' : 'info', title: t(spec.label),
      ask: t('ask_act', { a: t(spec.label), t: `${hourLabel(a.time)} – ${hourLabel(b.time)}` }),
      text: t('fy_best', {
        t: `${hourLabel(a.time)} – ${hourLabel(b.time)}`,
        s: bd.label === 'Good' ? t('best_run_days') : bd.label === 'Fair' ? t('fair_run_days') : t('poor_run_days'),
        p: Math.round(a.precipitation_probability ?? 0),
        t1: fmtTemp(a.temperature_2m), t2: fmtTemp(b.temperature_2m),
      }),
    });
  }

  /* wedding / events → best day of the next 10 */
  if (p.interests.includes('wedding')) {
    const days = s.days.map((d) => ({ ...d, score: dayScore(d) }));
    const best = [...days].sort((a, b) => b.score - a.score)[0];
    const worst = [...days].sort((a, b) => a.score - b.score)[0];
    if (best) {
      push({
        icon: 'ring', tone: 'info', title: t('fy_event'),
        ask: t('ask_event', { d: `${dayName(best)} ${dateLabel(best.date)}` }),
        text: t('fy_event_t', {
          d: `${dayName(best)} ${dateLabel(best.date)}`,
          t1: fmtTemp(best.temp_max), t2: fmtTemp(best.temp_min),
          p: Math.round(best.precip_prob_max ?? 0),
          w: `${dayName(worst)} ${dateLabel(worst.date)}`,
          p2: Math.round(worst.precip_prob_max ?? 0),
        }),
      });
    }
  }

  /* laundry */
  if (p.interests.includes('laundry')) {
    const dry = s.hours.slice(0, 14).filter((h) => (h.precipitation_probability ?? 0) < 30 && (h.relative_humidity_2m ?? 100) < 68).length;
    push({
      icon: 'shirt', tone: dry >= 6 ? 'good' : dry >= 3 ? 'info' : 'warn', title: t('fy_laundry'),
      ask: t('ask_laundry', { n: dry }),
      text: dry >= 6 ? t('fy_laundry_good', { n: dry }) : dry >= 3 ? t('fy_laundry_ok', { n: dry }) : t('fy_laundry_bad'),
    });
  }

  /* farming: NOT here — v0.8.35 gave the farm its own "farm desk" section on
     the board, and the same two cards appearing twice on one screen (For you
     + Farm weather) was a duplication smell. For-you keeps schedule and
     lifestyle insights; the farm section is the single farm home. */

  /* fishing (needs marine extras) */
  if (p.interests.includes('fishing') && s.extras?.marine?.now?.waveHeightM != null) {
    const w = s.extras.marine.now.waveHeightM;
    push({
      icon: 'fish', tone: w <= 1.2 ? 'good' : 'warn', title: t('fy_fishing'),
      text: t('fy_fishing_t', { w: Math.round(w * 10) / 10, p: Math.round(s.extras.marine.now.wavePeriodS ?? 0), v: w <= 1.2 ? t('fy_fishing_ok') : t('fy_fishing_rough') }),
      ask: t('ask_fishing', { w: Math.round(w * 10) / 10 }),
    });
  }

  /* cooking & pickles */
  if (p.interests.includes('cooking')) {
    const hum = Math.round(s.now.humidity ?? 0);
    push({
      icon: 'pan', tone: hum <= 55 ? 'good' : 'info', title: t('fy_cooking'),
      text: t('fy_cooking_t', { h: hum, v: hum <= 55 ? t('fy_cooking_good') : t('fy_cooking_bad') }),
      ask: t('ask_cooking', { h: hum }),
    });
  }

  /* hair & skin */
  if (p.interests.includes('skin')) {
    const uv = Math.round(s.uvNow.value ?? 0);
    const hum = Math.round(s.now.humidity ?? 50);
    push({
      icon: 'scissors', tone: uv >= 7 ? 'warn' : 'info', title: t('fy_skin'),
      text: t('fy_skin_t', { n: uv, l: s.uvNow.label ?? '', h: hum, v: hum < 35 ? t('fy_skin_dry') : t('fy_skin_humid') }),
      ask: t('ask_skin', { n: uv, h: hum }),
    });
  }

  /* kids & school */
  if (p.interests.includes('kids') && p.scheduleOn) {
    const h = s.hours.find((x) => hh(x.time) === hh(`2026-01-01T${p.schedule.leaveAm}`)) ?? s.hours[0];
    const pop = Math.round(h?.precipitation_probability ?? 0);
    push({
      icon: 'backpack', tone: pop >= 50 ? 'warn' : 'good', title: t('fy_kids'),
      text: t('fy_kids_t', { p: pop, t: hourLabel(h?.time), w: pop >= 50 ? t('fy_kids_wet') : t('fy_kids_dry') }),
      ask: t('ask_kids', { p: pop, t: hourLabel(h?.time) }),
    });
  }

  /* elders */
  if (p.interests.includes('elders')) {
    const hi = s.now.hi ?? s.now.feels;
    if (hi != null && hi >= 36) {
      push({ icon: 'heart', tone: 'warn', title: t('fy_elders'), text: t('fy_elders_t', { t: fmtTemp(hi, true) }), ask: t('ask_elders', { t: fmtTemp(hi, true) }) });
    } else if ((s.now.temp ?? 99) <= 12) {
      push({ icon: 'heart', tone: 'info', title: t('fy_elders'), text: t('fy_elders_cold_t', { t: fmtTemp(s.now.temp, true) }), ask: t('ask_elders', { t: fmtTemp(s.now.temp, true) }) });
    }
  }

  /* pets */
  if (p.interests.includes('pets')) {
    if ((s.now.feels ?? 0) >= 40) {
      push({ icon: 'paw', tone: 'warn', title: t('fy_pets'), text: t('fy_pets_t', { t: fmtTemp(s.now.feels, true) }), ask: t('ask_pets_hot', { t: fmtTemp(s.now.feels, true) }) });
    } else {
      const firstWet = s.hours.slice(0, 12).find((h) => (h.precipitation_probability ?? 0) >= 50);
      if (firstWet) push({ icon: 'paw', tone: 'info', title: t('fy_pets'), text: t('fy_pets_ok_t', { p: Math.round(firstWet.precipitation_probability ?? 0), t: hourLabel(firstWet.time) }), ask: t('ask_pets_wet', { p: Math.round(firstWet.precipitation_probability ?? 0), t: hourLabel(firstWet.time) }) });
    }
  }

  /* street business */
  if (p.interests.includes('shop')) {
    const work = s.hours.slice(0, 12);
    const maxPop = Math.max(0, ...work.map((h) => h.precipitation_probability ?? 0));
    push({
      icon: 'basket', tone: maxPop >= 50 ? 'warn' : 'good', title: t('fy_shop'),
      ask: t('ask_shop', { p: Math.round(maxPop) }),
      text: t('fy_shop_t', { p: Math.round(maxPop), v: maxPop >= 50 ? t('fy_shop_cover') : t('fy_shop_open') }),
    });
  }

  /* travel & weekends */
  if (p.interests.includes('travel')) {
    const sat = s.days.find((d) => new Date(`${d.date}T12:00:00`).getDay() === 6);
    const sun = s.days.find((d) => new Date(`${d.date}T12:00:00`).getDay() === 0);
    if (sat && sun) {
      const p1 = Math.round(sat.precip_prob_max ?? 0), p2 = Math.round(sun.precip_prob_max ?? 0);
      push({
        icon: 'route', tone: Math.max(p1, p2) >= 55 ? 'warn' : 'good', title: t('fy_travel'),
        ask: t('ask_travel', { sat: dateLabel(sat.date), p1, sun: dateLabel(sun.date), p2 }),
        text: t('fy_travel_t', {
          sat: dateLabel(sat.date), p1, sun: dateLabel(sun.date), p2,
          v: Math.max(p1, p2) >= 55 ? t('fy_travel_bad') : t('fy_travel_good'),
        }),
      });
    }
  }

  /* sensitivities */
  const hi = s.now.hi ?? s.now.feels;
  const sens = p.sensitive ?? {};
  if (sens.heat && hi != null && hi >= 36) {
    push({ icon: 'thermo', tone: 'warn', title: t('fy_heat'), text: t('fy_heat_t', { t: fmtTemp(hi, true) }), ask: t('ask_fy_heat', { t: fmtTemp(hi, true) }) });
  }
  if (sens.cold && (s.now.temp ?? 99) <= 14) {
    push({ icon: 'snow', tone: 'info', title: t('fy_cold'), text: t('fy_cold_t', { t: fmtTemp(s.now.temp, true) }), ask: t('ask_cold', { t: fmtTemp(s.now.temp, true) }) });
  }
  if (sens.rain) {
    const firstWet = s.hours.slice(0, 12).find((h) => (h.precipitation_probability ?? 0) >= 45);
    if (firstWet) push({ icon: 'umbrella', tone: 'info', title: t('fy_rain_sens'), text: t('fy_rain_sens_t', { p: Math.round(firstWet.precipitation_probability ?? 0), t: hourLabel(firstWet.time) }), ask: t('ask_rain_sens', { p: Math.round(firstWet.precipitation_probability ?? 0), t: hourLabel(firstWet.time) }) });
  }
  if (sens.air && (s.currentAqi?.aqi ?? 0) >= 120) {
    push({ icon: 'fog', tone: (s.currentAqi.aqi >= 200) ? 'warn' : 'info', title: t('fy_air_sens'), text: t('fy_air_sens_t', { n: s.currentAqi.aqi, c: s.currentAqi.category }), ask: t('ask_ins_aqi', { n: s.currentAqi.aqi, c: s.currentAqi.category }) });
  }
  if (sens.dust && (s.hours[0]?.air?.dust ?? 0) >= 80) {
    /* v0.8.38: the text was hardcoded EN (glued Latin into Devanagari on hi —
       the UV-band defect class); now routed through t() with the ask. */
    push({ icon: 'wind', tone: 'warn', title: t('fy_air_sens'), text: t('fy_dust_t', { n: Math.round(s.hours[0].air.dust) }), ask: t('ask_dust', { n: Math.round(s.hours[0].air.dust) }) });
  }
  if (sens.humidity && (s.now.humidity ?? 0) >= 80) {
    push({ icon: 'droplet', tone: 'info', title: t('fy_air_sens'), text: t('fy_hum_t', { h: Math.round(s.now.humidity) }), ask: t('ask_humidity', { h: Math.round(s.now.humidity) }) });
  }

  /* custom tags */
  for (const tag of (p.customTags ?? []).slice(0, 2)) {
    /* v0.8.38: icon was the raw '✨' emoji — the only card chip off the glyph
       system; 'sparkles' resolves through the same stroke-glyph language. */
    push({ icon: 'sparkles', tone: 'info', title: t('fy_custom', { t: tag }), text: t('fy_custom_t', { t: tag }), ask: t('ask_custom', { t: tag }) });
  }

  return {
    greeting: p.name ? p.name : null,
    cards: cards.slice(0, 6),
  };
}

function dayName(d) {
  return d.label || dateLabel(d.date);
}

/* ================================================================
   BEST DAYS ribbon (10-day score)
================================================================ */

export function computeBestDays(s) {
  if (!s?.days?.length) return null;
  const scored = s.days.map((d, i) => ({ ...d, idx: i, score: dayScore(d) }));
  const best = [...scored].sort((a, b) => b.score - a.score)[0];
  const worst = [...scored].sort((a, b) => a.score - b.score)[0];
  return { scored, best, worst };
}
