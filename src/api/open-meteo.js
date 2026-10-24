/**
 * open-meteo.js — API client for the free Open-Meteo services (no key required).
 *
 *  - fetchWeatherBundle()  : forecast + air-quality, normalised for the engine
 *  - geocodeSearch()       : city / place search
 *
 * All endpoints are CORS-enabled and cached by the service worker for offline use.
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
  'wind_gusts_10m',
  'uv_index',
  'visibility',
  'soil_moisture_0_to_1cm',
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
].join(',');

const AIR_VARS = [
  'pm10',
  'pm2_5',
  'carbon_monoxide',
  'nitrogen_dioxide',
  'sulphur_dioxide',
  'ozone',
  'ammonia',
  'us_aqi',
].join(',');

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
        throw new Error(`API ${res.status} for ${new URL(url).host}`);
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
  const forecastQS = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: CURRENT_VARS,
    hourly: HOURLY_VARS,
    daily: DAILY_VARS,
    timezone: 'auto',
    forecast_days: '7',
    past_days: '0',
  });

  const airQS = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    hourly: AIR_VARS,
    timezone: 'auto',
    forecast_days: '2',
  });

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

  const hours = transposeHourly(forecast.hourly, nowIdx, nowIdx + 36).map((h) => ({
    ...h,
    air: resolveAir(h.time),
  }));

  const days = forecast.daily.time.map((date, i) => ({
    date,
    weather_code: forecast.daily.weather_code[i],
    temp_max: forecast.daily.temperature_2m_max[i],
    temp_min: forecast.daily.temperature_2m_min[i],
    feels_max: forecast.daily.apparent_temperature_max[i],
    precipitation_sum: forecast.daily.precipitation_sum[i],
    precip_prob_max: forecast.daily.precipitation_probability_max?.[i] ?? 0,
    wind_max: forecast.daily.wind_speed_10m_max[i],
    gusts_max: forecast.daily.wind_gusts_10m_max?.[i],
    uv_max: forecast.daily.uv_index_max[i],
    sunrise: forecast.daily.sunrise[i],
    sunset: forecast.daily.sunset[i],
  }));

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
    },
    hours, // 36h from now
    days,  // 7 days
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
  const qs = new URLSearchParams({ name: query.trim(), count: '8', language: 'en', format: 'json' });
  const data = await getJSON(`${GEO_URL}?${qs}`, signal);
  const results = data.results ?? [];
  // Sort India-first, then by population (if present) descending.
  return results.sort((a, b) => {
    const aIn = a.country_code === 'IN' ? 0 : 1;
    const bIn = b.country_code === 'IN' ? 0 : 1;
    if (aIn !== bIn) return aIn - bIn;
    return (b.population ?? 0) - (a.population ?? 0);
  });
}
