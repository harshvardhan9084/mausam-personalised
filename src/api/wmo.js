/**
 * wmo.js — WMO weather interpretation codes (as returned by Open-Meteo).
 * Maps code → { label, icon } for consistent UI representation.
 * @see https://open-meteo.com/en/docs
 */

const WMO = {
  0:  { label: 'Clear sky',            icon: '☀️', night: '🌙' },
  1:  { label: 'Mainly clear',         icon: '🌤️', night: '🌙' },
  2:  { label: 'Partly cloudy',        icon: '⛅', night: '☁️' },
  3:  { label: 'Overcast',             icon: '☁️', night: '☁️' },
  45: { label: 'Fog',                  icon: '🌫️', night: '🌫️' },
  48: { label: 'Depositing rime fog',  icon: '🌫️', night: '🌫️' },
  51: { label: 'Light drizzle',        icon: '🌦️', night: '🌧️' },
  53: { label: 'Moderate drizzle',     icon: '🌦️', night: '🌧️' },
  55: { label: 'Dense drizzle',        icon: '🌧️', night: '🌧️' },
  56: { label: 'Light freezing drizzle', icon: '🌧️', night: '🌧️' },
  57: { label: 'Dense freezing drizzle', icon: '🌧️', night: '🌧️' },
  61: { label: 'Slight rain',          icon: '🌦️', night: '🌧️' },
  63: { label: 'Moderate rain',        icon: '🌧️', night: '🌧️' },
  65: { label: 'Heavy rain',           icon: '🌧️', night: '🌧️' },
  66: { label: 'Light freezing rain',  icon: '🌧️', night: '🌧️' },
  67: { label: 'Heavy freezing rain',  icon: '🌧️', night: '🌧️' },
  71: { label: 'Slight snowfall',      icon: '🌨️', night: '🌨️' },
  73: { label: 'Moderate snowfall',    icon: '🌨️', night: '🌨️' },
  75: { label: 'Heavy snowfall',       icon: '❄️', night: '❄️' },
  77: { label: 'Snow grains',          icon: '🌨️', night: '🌨️' },
  80: { label: 'Slight rain showers',  icon: '🌦️', night: '🌧️' },
  81: { label: 'Moderate rain showers', icon: '🌧️', night: '🌧️' },
  82: { label: 'Violent rain showers', icon: '⛈️', night: '⛈️' },
  85: { label: 'Slight snow showers',  icon: '🌨️', night: '🌨️' },
  86: { label: 'Heavy snow showers',   icon: '❄️', night: '❄️' },
  95: { label: 'Thunderstorm',         icon: '⛈️', night: '⛈️' },
  96: { label: 'Thunderstorm with hail', icon: '⛈️', night: '⛈️' },
  99: { label: 'Thunderstorm with heavy hail', icon: '⛈️', night: '⛈️' },
};

/**
 * @param {number} code WMO weather code
 * @param {boolean} isNight
 * @returns {{label: string, icon: string}}
 */
export function describeWeather(code, isNight = false) {
  const entry = WMO[code] ?? { label: 'Unknown', icon: '❓', night: '❓' };
  return { label: entry.label, icon: isNight ? entry.night : entry.icon };
}

/** Wind direction degrees → compass label (16-point). */
export function compass(deg) {
  if (deg == null) return '—';
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return points[Math.round(deg / 22.5) % 16];
}
