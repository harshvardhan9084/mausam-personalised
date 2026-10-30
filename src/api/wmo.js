/**
 * wmo.js — WMO weather interpretation codes (as returned by Open-Meteo).
 * Maps code → { label, icon } for consistent UI representation.
 * v0.8.26 — the sky speaks the UI's language: labels are [EN, HI] pairs and
 * describeWeather()/wxText() resolve them for the requested language, so the
 * hero's condition line (its most prominent text after the temperature) and
 * the compare/journey rows stop showing English in Hindi mode. The engine
 * bakes the EN label plus the raw code/night flags; display sites call
 * wxText(wx, getLang()) to re-resolve at render time (a language switch
 * re-renders from the cached snapshot, so baked strings would go stale).
 * @see https://open-meteo.com/en/docs
 */

const WMO = {
  0:  { label: ['Clear sky', 'साफ़ आसमान'],                     icon: '☀️', night: '🌙' },
  1:  { label: ['Mainly clear', 'लगभग साफ़'],                   icon: '🌤️', night: '🌙' },
  2:  { label: ['Partly cloudy', 'आंशिक बादल'],                icon: '⛅', night: '☁️' },
  3:  { label: ['Overcast', 'घने बादल'],                       icon: '☁️', night: '☁️' },
  45: { label: ['Fog', 'कोहरा'],                                icon: '🌫️', night: '🌫️' },
  48: { label: ['Depositing rime fog', 'पाला कोहरा'],           icon: '🌫️', night: '🌫️' },
  51: { label: ['Light drizzle', 'हल्की बूंदाबांदी'],           icon: '🌦️', night: '🌧️' },
  53: { label: ['Moderate drizzle', 'बूंदाबांदी'],              icon: '🌦️', night: '🌧️' },
  55: { label: ['Dense drizzle', 'तेज़ बूंदाबांदी'],            icon: '🌧️', night: '🌧️' },
  56: { label: ['Light freezing drizzle', 'हल्की जमने वाली बूंदाबांदी'], icon: '🌧️', night: '🌧️' },
  57: { label: ['Dense freezing drizzle', 'तेज़ जमने वाली बूंदाबांदी'],   icon: '🌧️', night: '🌧️' },
  61: { label: ['Slight rain', 'हल्की बारिश'],                  icon: '🌦️', night: '🌧️' },
  63: { label: ['Moderate rain', 'बारिश'],                      icon: '🌧️', night: '🌧️' },
  65: { label: ['Heavy rain', 'तेज़ बारिश'],                    icon: '🌧️', night: '🌧️' },
  66: { label: ['Light freezing rain', 'हल्की जमने वाली बारिश'], icon: '🌧️', night: '🌧️' },
  67: { label: ['Heavy freezing rain', 'तेज़ जमने वाली बारिश'],  icon: '🌧️', night: '🌧️' },
  71: { label: ['Slight snowfall', 'हल्की बर्फ़बारी'],           icon: '🌨️', night: '🌨️' },
  73: { label: ['Moderate snowfall', 'बर्फ़बारी'],               icon: '🌨️', night: '🌨️' },
  75: { label: ['Heavy snowfall', 'तेज़ बर्फ़बारी'],             icon: '❄️', night: '❄️' },
  77: { label: ['Snow grains', 'बर्फ़ के कण'],                   icon: '🌨️', night: '🌨️' },
  80: { label: ['Slight rain showers', 'हल्की बौछारें'],         icon: '🌦️', night: '🌧️' },
  81: { label: ['Moderate rain showers', 'बौछारें'],            icon: '🌧️', night: '🌧️' },
  82: { label: ['Violent rain showers', 'मूसलधार बौछारें'],      icon: '⛈️', night: '⛈️' },
  85: { label: ['Slight snow showers', 'हल्की बर्फ़ बौछारें'],    icon: '🌨️', night: '🌨️' },
  86: { label: ['Heavy snow showers', 'तेज़ बर्फ़ बौछारें'],      icon: '❄️', night: '❄️' },
  95: { label: ['Thunderstorm', 'आंधी-तूफ़ान'],                  icon: '⛈️', night: '⛈️' },
  96: { label: ['Thunderstorm with hail', 'ओलावृष्टि के साथ तूफ़ान'], icon: '⛈️', night: '⛈️' },
  99: { label: ['Thunderstorm with heavy hail', 'भारी ओलावृष्टि के साथ तूफ़ान'], icon: '⛈️', night: '⛈️' },
};

const UNKNOWN = { label: ['Unknown', 'अज्ञात'], icon: '❓', night: '❓' };
const idx = (lang) => (lang === 'hi' ? 1 : 0);

/**
 * @param {number} code WMO weather code
 * @param {boolean} isNight
 * @param {'en'|'hi'} [lang] display language (explicit; render sites pass getLang())
 * @returns {{label: string, icon: string, code: number, night: boolean}}
 */
export function describeWeather(code, isNight = false, lang = 'en') {
  const entry = WMO[code] ?? UNKNOWN;
  return {
    label: entry.label[idx(lang)],
    icon: isNight ? entry.night : entry.icon,
    code,
    night: isNight,
  };
}

/**
 * Render-time condition text for a baked wx object: re-resolves from the
 * raw code/night so a mid-session language switch shows the right language
 * without refetching. Falls back to the baked EN label for old shapes.
 * @param {{code?: number, night?: boolean, label?: string}|null} wx
 * @param {'en'|'hi'} [lang]
 */
export function wxText(wx, lang = 'en') {
  if (wx == null) return '';
  if (wx.code != null) return describeWeather(wx.code, Boolean(wx.night), lang).label;
  return wx.label ?? '';
}

/** Wind direction degrees → compass label (16-point). */
export function compass(deg) {
  if (deg == null) return '—';
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return points[Math.round(deg / 22.5) % 16];
}
