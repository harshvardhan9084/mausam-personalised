/**
 * open-meteo.js — API client for the free Open-Meteo services (no key required).
 *
 *  - fetchWeatherBundle()  : nowcast + forecast + air-quality, normalised
 *  - geocodeSearch()       : city / place search
 *
 * ⚠ Two API realities this client respects (both caused a full outage once):
 *   1. The forecast API does NOT split %2C-encoded commas — list params must
 *      contain LITERAL "," separators (that's why we never use URLSearchParams
 *      for them).
 *   2. `dew_point` was renamed `dew_point_2m`; the old name 400s.
 *
 * @see https://open-meteo.com/en/docs
 */

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';

const HOURLY_VARS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'precipitation_probability',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'uv_index',
  'visibility',
  'dew_point_2m',
  'cloud_cover',
  'soil_moisture_0_to_1cm',
  'soil_moisture_3_to_9cm',
  'soil_temperature_0_to_7cm',
  'et0_fao_evapotranspiration',
].join(',');

const DAILY_VARS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'apparent_temperature_max',
  'precipitation_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'uv_index_max',
  'sunrise',
  'sunset',
].join(',');

const CURRENT_VARS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'is_day',
  'precipitation',
  'pressure_msl',
  'cloud_cover',
].join(',');

const AIR_VARS = [
  'pm10',
  'pm2_5',
  'carbon_monoxide',
  'nitrogen_dioxide',
  'sulphur_dioxide',
  'ozone',
  'ammonia',
  'dust',
  'uv_index',
  'aerosol_optical_depth',
  'us_aqi',
].join(',');

/** Fixed daily range: 1 past day (yesterday) + 10 forecast days. */
const PAST_DAYS = 1;
const FORECAST_DAYS = 10;
/** Hourly horizon sliced out of the response. */
const HOUR_HORIZON = 48;
/** 15-minute nowcast steps (8 × 15min = 2h). */
const NOWCAST_STEPS = 8;

/**
 * Build a query string with literal commas preserved (Open-Meteo rejects
 * %2C inside list params). Only join — every value we pass is already a
 * safe constant or a number.
 */
function qs(pairs) {
  return pairs.map(([k, v]) => `${k}=${v}`).join('&');
}

async function getJSON(url, signal, { retries = 2, backoffMs = 700 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const res = await fetch(url, { signal });
      if (res.status === 429) {
        // Rate limited: honour Retry-After (capped) once, then fail with a
        // clear message so the UI can explain what happened.
        if (attempt < retries) {
          const ra = Number(res.headers.get('retry-after') ?? 0);
          const wait = Math.min(Math.max(ra, 1), 10) * 1000;
          await new Promise((r) => setTimeout(r, Number.isFinite(wait) ? wait : backoffMs * 2));
          continue;
        }
        throw new Error('Weather service rate limit reached — try again in a minute.');
      }
      if (!res.ok) {
        // Surface the API's own reason when present (it names the exact
        // bad parameter — invaluable when a variable gets renamed).
        let reason = '';
        try {
          const body = await res.json();
          reason = body?.reason ?? body?.error ?? '';
        } catch { /* not json */ }
        throw new Error(reason || `API ${res.status} for ${new URL(url).host}`);
      }
      const data = await res.json();
      if (data.error) {
        throw new Error(data.reason || 'Open-Meteo API error');
      }
      return data;
    } catch (err) {
      lastErr = err;
      // Retry only network-level failures (TypeError from fetch, e.g.
      // ETIMEDOUT / ENETUNREACH). HTTP errors and user aborts rethrow.
      if (attempt === retries || err.name === 'AbortError' || !(err instanceof TypeError)) throw err;
      await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
    }
  }
  throw lastErr;
}

/** Transpose an Open-Meteo hourly block into an array of row objects. */
function transposeHourly(hourly, start, end) {
  const keys = Object.keys(hourly).filter((k) => k !== 'time');
  const rows = [];
  for (let i = start; i < Math.min(end, hourly.time.length); i++) {
    const row = { time: hourly.time[i] };
    for (const k of keys) row[k] = hourly[k][i];
    rows.push(row);
  }
  return rows;
}

/**
 * Fetch and normalise the full weather bundle for a location.
 * @param {number} lat
 * @param {number} lon
 * @param {AbortSignal} [signal]
 */
export async function fetchWeatherBundle(lat, lon, signal) {
  const forecastQS = qs([
    ['latitude', lat],
    ['longitude', lon],
    ['current', CURRENT_VARS],
    ['minutely_15', 'precipitation'],
    ['forecast_minutely_15', NOWCAST_STEPS],
    ['past_minutely_15', '0'],
    ['hourly', HOURLY_VARS],
    ['daily', DAILY_VARS],
    ['timezone', 'auto'],
    ['past_days', PAST_DAYS],
    ['forecast_days', FORECAST_DAYS],
  ]);

  const airQS = qs([
    ['latitude', lat],
    ['longitude', lon],
    ['hourly', AIR_VARS],
    ['timezone', 'auto'],
    ['forecast_days', '2'],
  ]);

  const [forecast, air] = await Promise.all([
    getJSON(`${FORECAST_URL}?${forecastQS}`, signal),
    getJSON(`${AIR_URL}?${airQS}`, signal).catch(() => null), // AQI is optional; degrade gracefully
  ]);

  // --- locate "now" inside the hourly series ---
  const nowISO = forecast.current.time.slice(0, 13); // e.g. "2026-10-24T14"
  let nowIdx = forecast.hourly.time.findIndex((t) => t.slice(0, 13) === nowISO);
  if (nowIdx < 0) nowIdx = 0;

  // Map air-quality pollutants onto forecast hours (both use local tz).
  // Open-Meteo air-quality has an assimilation lag: if the exact hour is
  // empty, fall back to the most recent populated hour (up to 3h back).
  const airTimes = air?.hourly?.time ?? [];
  const airRows = airTimes.map((t, i) => ({
    pm10: air.hourly.pm10?.[i],
    pm2_5: air.hourly.pm2_5?.[i],
    carbon_monoxide: air.hourly.carbon_monoxide?.[i],
    nitrogen_dioxide: air.hourly.nitrogen_dioxide?.[i],
    sulphur_dioxide: air.hourly.sulphur_dioxide?.[i],
    ozone: air.hourly.ozone?.[i],
    ammonia: air.hourly.ammonia?.[i],
    dust: air.hourly.dust?.[i],
    uv_index: air.hourly.uv_index?.[i],
    aerosol_optical_depth: air.hourly.aerosol_optical_depth?.[i],
    us_aqi: air.hourly.us_aqi?.[i],
  }));
  const airIndexByKey = new Map(airTimes.map((t, i) => [t.slice(0, 13), i]));
  const resolveAir = (iso) => {
    let idx = airIndexByKey.get(iso.slice(0, 13));
    if (idx == null) return null;
    for (let back = 0; back <= 3 && idx - back >= 0; back++) {
      const row = airRows[idx - back];
      if (row && (row.pm2_5 != null || row.pm10 != null)) return row;
    }
    return airRows[idx] ?? null;
  };

  const hours = transposeHourly(forecast.hourly, nowIdx, nowIdx + HOUR_HORIZON).map((h) => ({
    ...h,
    air: resolveAir(h.time),
  }));

  // daily: [yesterday, today, +9] — pull yesterday out, keep 10 forecast days
  const daily = forecast.daily;
  const yesterday = PAST_DAYS > 0 && daily.time.length > FORECAST_DAYS
    ? {
        date: daily.time[0],
        weather_code: daily.weather_code[0],
        temp_max: daily.temperature_2m_max[0],
        temp_min: daily.temperature_2m_min[0],
        precipitation_sum: daily.precipitation_sum[0],
      }
    : null;

  const days = daily.time.slice(PAST_DAYS).map((date, i) => {
    const j = i + PAST_DAYS;
    return {
      date,
      weather_code: daily.weather_code[j],
      temp_max: daily.temperature_2m_max[j],
      temp_min: daily.temperature_2m_min[j],
      feels_max: daily.apparent_temperature_max[j],
      precipitation_sum: daily.precipitation_sum[j],
      precip_prob_max: daily.precipitation_probability_max?.[j] ?? 0,
      wind_max: daily.wind_speed_10m_max[j],
      gusts_max: daily.wind_gusts_10m_max?.[j],
      uv_max: daily.uv_index_max[j],
      sunrise: daily.sunrise[j],
      sunset: daily.sunset[j],
    };
  });

  // 15-minute nowcast: next ~2 hours of precipitation (mm per step)
  const m15 = forecast.minutely_15;
  const minutely = m15?.time?.length
    ? {
        start: m15.time[0],
        stepMin: 15,
        mm: m15.precipitation.map((v) => (v == null ? 0 : v)),
      }
    : null;

  return {
    fetchedAt: Date.now(),
    timezone: forecast.timezone,
    utcOffsetSeconds: forecast.utc_offset_seconds,
    location: { lat, lon, elevation: forecast.elevation },
    current: {
      time: forecast.current.time,
      temp: forecast.current.temperature_2m,
      feels: forecast.current.apparent_temperature,
      humidity: forecast.current.relative_humidity_2m,
      weather_code: forecast.current.weather_code,
      wind: forecast.current.wind_speed_10m,
      wind_dir: forecast.current.wind_direction_10m,
      gusts: forecast.current.wind_gusts_10m,
      is_day: forecast.current.is_day === 1,
      precip: forecast.current.precipitation,
      pressure: forecast.current.pressure_msl,
      cloud: forecast.current.cloud_cover,
    },
    minutely, // 15-min precipitation nowcast (2h)
    hours,    // 48h from now
    days,     // 10 days
    yesterday,
  };
}

/**
 * Search places by name (worldwide, India-friendly ordering).
 * @param {string} query
 * @param {AbortSignal} [signal]
 * @returns {Promise<Array<{id:number,name:string,admin1?:string,country?:string,lat:number,lon:number}>>}
 */
export async function geocodeSearch(query, signal) {
  if (!query || query.trim().length < 2) return [];
  const search = new URLSearchParams({ name: query.trim(), count: '8', language: 'en', format: 'json' });
  const data = await getJSON(`${GEO_URL}?${search}`, signal);
  const results = data.results ?? [];
  // Sort India-first, then by population (if present) descending.
  return results.sort((a, b) => {
    const aIn = a.country_code === 'IN' ? 0 : 1;
    const bIn = b.country_code === 'IN' ? 0 : 1;
    if (aIn !== bIn) return aIn - bIn;
    return (b.population ?? 0) - (a.population ?? 0);
  });
}
