/**
 * engine.js — builds the universal weather snapshot from a raw bundle.
 *
 * One dashboard for everyone: this module computes CPCB AQI, heat index,
 * day/night awareness and enriched hourly rows for the whole app.
 * Insight/alert/"For You" logic lives in insights.js; scoring models in
 * scoring.js. No persona gating — every user sees every section.
 */

import { computeCPCBAqi, uvLabel } from './aqi-cpcb.js';
import { heatIndex } from '../utils/format.js';
import { describeWeather } from '../api/wmo.js';

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
 * Build the full snapshot from a raw weather bundle.
 * @param {Object} bundle result of fetchWeatherBundle()
 */
export function buildSnapshot(bundle) {
  const hours = enrichHours(bundle.hours, bundle.days);
  const nowHour = hours[0];
  const currentAqi = nowHour?.aqiFull ?? {
    aqi: null, category: 'Unknown', color: '#8b8fa8', advice: '', dominant: null, subIndices: {},
  };

  const days = bundle.days.map((d, i) => ({
    ...d,
    score: null, // filled by insights if needed
    wx: describeWeather(d.weather_code, false),
    label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' }),
  }));

  const today = days[0];
  const dayLength = today?.sunrise && today?.sunset
    ? (() => {
        const [sh, sm] = today.sunrise.slice(11, 16).split(':').map(Number);
        const [eh, em] = today.sunset.slice(11, 16).split(':').map(Number);
        let mins = eh * 60 + em - (sh * 60 + sm);
        if (mins < 0) mins += 24 * 60;
        return `${Math.floor(mins / 60)}h ${mins % 60}m`;
      })()
    : null;

  // Yesterday comparison (drives the "x° warmer/cooler than yesterday" pill)
  const yesterday = bundle.yesterday
    ? {
        date: bundle.yesterday.date,
        tempMax: bundle.yesterday.temp_max,
        tempMin: bundle.yesterday.temp_min,
        wx: describeWeather(bundle.yesterday.weather_code, false),
        precipitationSum: bundle.yesterday.precipitation_sum,
        deltaMax: today?.temp_max != null && bundle.yesterday.temp_max != null
          ? today.temp_max - bundle.yesterday.temp_max
          : null,
      }
    : null;

  return {
    bundle,
    fetchedAt: bundle.fetchedAt,
    timezone: bundle.timezone,
    extras: bundle.extras ?? null, // {flood, marine, climate} — optional enhancements
    now: {
      ...bundle.current,
      hi: heatIndex(bundle.current.feels, bundle.current.humidity),
      wx: describeWeather(bundle.current.weather_code, !bundle.current.is_day),
      uv: nowHour?.uv_index ?? null,
      uvLabel: uvLabel(nowHour?.uv_index),
      visibility: nowHour?.visibility ?? null,
      pressure: bundle.current?.pressure_msl ?? null,
      dew: nowHour?.dew_point_2m ?? nowHour?.dew_point ?? null,
      cloud: bundle.current?.cloud_cover ?? null,
    },
    currentAqi, // CPCB AQI at the current hour
    uvNow: { value: nowHour?.uv_index ?? null, label: uvLabel(nowHour?.uv_index) },
    minutely: bundle.minutely ?? null, // 15-min precipitation nowcast (2h)
    yesterday, // {date, tempMax, tempMin, wx, deltaMax} | null
    hours, // 48h from now, enriched
    days,  // 10 days
    sun: today ? { sunrise: today.sunrise, sunset: today.sunset, dayLength } : null,
  };
}
