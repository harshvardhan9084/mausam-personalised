/**
 * tools.js — weather tools the assistant can call.
 *
 * Gemini path: real function-calling (declarations below, executor here).
 * Offline path: the local engine calls runTool() directly.
 * Z.ai preview path: tools are disabled server-side; the DATA snapshot in
 * the system prompt covers the active city.
 */

import { geocodeSearch, fetchWeatherBundle } from '../api/open-meteo.js';
import { buildSnapshot } from '../core/engine.js';

const hh = (iso) => {
  const h = Number(iso?.slice(11, 13));
  return Number.isFinite(h) ? (h % 12 === 0 ? 12 : h % 12) + (h >= 12 ? ' PM' : ' AM') : null;
};

/** Friendly day label for an ISO timestamp, relative to the snapshot. */
function dayLabelFor(s, iso) {
  const date = iso?.slice(0, 10);
  const d0 = s?.days?.[0]?.date;
  const d1 = s?.days?.[1]?.date;
  if (date && date === d0) return 'Today';
  if (date && date === d1) return 'Tomorrow';
  try {
    return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return date ?? '';
  }
}

/** Local wall-clock time for a snapshot's timezone. */
function localTimeOf(s) {
  const tz = s?.timezone;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, weekday: 'long', day: 'numeric', month: 'long',
      year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(new Date());
  } catch {
    return null;
  }
}

/** Gemini-style function declarations. */
export const TOOL_DECLARATIONS = [
  {
    name: 'get_city_weather',
    description: 'Get live current conditions + 3-day outlook for ANY city or place (use whenever the user asks about a location other than the current one).',
    parameters: {
      type: 'OBJECT',
      properties: {
        city: { type: 'STRING', description: 'City name, e.g. "Mumbai", "Shimla", "Ghaziabad"' },
      },
      required: ['city'],
    },
  },
  {
    name: 'get_next_hours',
    description: 'Get the next N hours (up to 36) of temperature, rain chance and conditions for the CURRENT location, for detailed hour-level planning.',
    parameters: {
      type: 'OBJECT',
      properties: {
        hours: { type: 'NUMBER', description: 'How many hours ahead (max 36, default 12)' },
      },
    },
  },
  {
    name: 'compare_days',
    description: 'Compare specific forecast days for the current location (0=Today … 6) to find the better day for a plan.',
    parameters: {
      type: 'OBJECT',
      properties: {
        days: {
          type: 'ARRAY',
          items: { type: 'NUMBER' },
          description: 'Day indices, e.g. [0, 5]',
        },
      },
      required: ['days'],
    },
  },
];

/** Fetch a full snapshot for a city name (geocode → bundle → snapshot). */
export async function fetchCitySnapshot(city, signal) {
  const results = await geocodeSearch(city, signal);
  if (!results.length) return null;
  const top = results[0];
  const bundle = await fetchWeatherBundle(top.latitude, top.longitude, signal);
  const snap = buildSnapshot(bundle);
  snap.locationLabel = [top.name, top.admin1, top.country].filter(Boolean).join(', ');
  snap.location = { name: top.name, admin1: top.admin1, country: top.country, lat: top.latitude, lon: top.longitude };
  return snap;
}

/** Snapshot → the same compact shape as prompt.compactSnapshot (light). */
export function snapshotToCompact(s) {
  if (!s) return null;
  return {
    place: s.locationLabel || s.location?.name || 'unknown',
    localTime: localTimeOf(s),
    now: {
      tempC: s.now.temp != null ? Math.round(s.now.temp * 10) / 10 : null,
      feelsC: s.now.feels != null ? Math.round(s.now.feels * 10) / 10 : null,
      condition: s.now.wx?.label,
      humidity: s.now.humidity,
      windKmh: s.now.wind,
    },
    aqi: s.currentAqi?.aqi != null ? { cpcbAqi: s.currentAqi.aqi, category: s.currentAqi.category, dominant: s.currentAqi.dominant } : null,
    days: s.days.slice(0, 4).map((d) => ({
      day: d.label,
      date: d.date,
      cond: d.wx?.label,
      maxC: d.temp_max != null ? Math.round(d.temp_max) : null,
      minC: d.temp_min != null ? Math.round(d.temp_min) : null,
      rainPop: Math.round(d.precip_prob_max ?? 0),
    })),
  };
}

/**
 * Execute a tool call.
 * @param {string} name
 * @param {Object} args
 * @param {Object} state window.__mausamState
 * @returns {Promise<Object>} JSON-serialisable result
 */
export async function runTool(name, args = {}, state) {
  const signal = AbortSignal.timeout(20000);
  try {
    switch (name) {
      case 'get_city_weather': {
        const city = String(args.city ?? '').trim();
        if (!city) return { error: 'No city name provided.' };
        const snap = await fetchCitySnapshot(city, signal);
        if (!snap) return { error: `Couldn't find a place called "${city}".` };
        return snapshotToCompact(snap);
      }
      case 'get_next_hours': {
        const s = state?.snapshot;
        if (!s) return { error: 'Weather data is still loading.' };
        const n = Math.min(48, Math.max(1, Math.round(args.hours ?? 12)));
        return {
          place: state.location?.name,
          asOf: localTimeOf(s),
          hours: s.hours.slice(0, n).map((h) => ({
            day: dayLabelFor(s, h.time),
            at: hh(h.time),
            tempC: h.temperature_2m != null ? Math.round(h.temperature_2m) : null,
            pop: Math.round(h.precipitation_probability ?? 0),
            cond: h.wx?.label,
          })),
        };
      }
      case 'compare_days': {
        const s = state?.snapshot;
        if (!s) return { error: 'Weather data is still loading.' };
        const idx = (Array.isArray(args.days) ? args.days : [0, 1])
          .map((n) => Math.max(0, Math.min(9, Math.round(Number(n)))))
          .filter((n) => Number.isFinite(n));
        return {
          place: state.location?.name,
          asOf: localTimeOf(s),
          days: [...new Set(idx)].map((i) => {
            const d = s.days[i];
            return d ? {
              day: d.label,
              date: d.date,
              cond: d.wx?.label,
              maxC: d.temp_max != null ? Math.round(d.temp_max) : null,
              minC: d.temp_min != null ? Math.round(d.temp_min) : null,
              rainPop: Math.round(d.precip_prob_max ?? 0),
              rainMm: d.precipitation_sum != null ? Math.round(d.precipitation_sum * 10) / 10 : null,
              uvMax: d.uv_max != null ? Math.round(d.uv_max * 10) / 10 : null,
              windMaxKmh: d.wind_max != null ? Math.round(d.wind_max) : null,
            } : null;
          }).filter(Boolean),
        };
      }
      default:
        return { error: `Unknown tool "${name}".` };
    }
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return { error: 'The weather service took too long — try again.' };
    }
    return { error: err?.message || 'Tool execution failed.' };
  }
}
