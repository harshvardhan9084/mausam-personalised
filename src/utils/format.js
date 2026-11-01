/**
 * format.js — unit conversion + display formatting helpers.
 * All Open-Meteo values arrive metric; conversion happens at render time
 * so the raw bundle stays unit-neutral.
 */

import { getLang, t } from '../core/i18n.js';

/** Locale for date formatting, honouring the UI language. */
const locale = () => (getLang() === 'hi' ? 'hi-IN' : undefined);

export function cToF(c) {
  return c * 9 / 5 + 32;
}

export function kmhToMph(k) {
  return k * 0.621371;
}

/**
 * Format a temperature for display according to the active unit system.
 * @param {number|null} celsius
 * @param {'metric'|'imperial'} units
 * @param {boolean} withUnit
 */
export function temp(celsius, units = 'metric', withUnit = false) {
  if (celsius == null) return '—';
  const v = Math.round(units === 'imperial' ? cToF(celsius) : celsius);
  return withUnit ? `${v}°${units === 'imperial' ? 'F' : 'C'}` : `${v}°`;
}

/** Format wind speed. */
export function wind(kmh, units = 'metric') {
  if (kmh == null) return '—';
  return units === 'imperial'
    ? `${Math.round(kmhToMph(kmh))} mph`
    : `${Math.round(kmh)} km/h`;
}

/** Visibility metres → human string. */
export function visibility(metres) {
  if (metres == null) return '—';
  if (metres >= 1000) return `${(metres / 1000).toFixed(metres < 10000 ? 1 : 0)} km`;
  return `${Math.round(metres)} m`;
}

/** "2026-10-24T14:00" → { h24:"14:00", h12:"2 PM", date:Date|null } */
export function parseLocalISO(iso) {
  if (!iso) return { h24: '—', h12: '—', date: null };
  const timePart = iso.slice(11, 16);
  const [h, m] = timePart.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { h24: timePart, h12: `${h12} ${suffix}`, date: new Date(iso) };
}

/** Hour label like "2 PM" (or "14:00" for a compact strip). */
export function hourLabel(iso, style = 'h12') {
  const p = parseLocalISO(iso);
  return style === 'h12' ? p.h12 : p.h24;
}

/** Day label from a date ISO — "Today", "Tomorrow", "Sat" (locale-aware). */
export function dayLabel(dateISO, index) {
  if (index === 0) return t('today');
  if (index === 1) return t('tomorrow');
  const d = new Date(`${dateISO}T12:00:00`);
  return d.toLocaleDateString(locale(), { weekday: 'short' });
}

/** Date label — "24 Oct" (locale-aware). */
export function dateLabel(dateISO) {
  const d = new Date(`${dateISO}T12:00:00`);
  return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
}

/** "2 hours ago" style relative label from a timestamp (hero pill).
 *  v0.8.45: delegates to freshAgo so the pill speaks the SAME localized
 *  receipt grammar as the station row and the Cross-checked ledger —
 *  before this, Hindi users read "अपडेट 2 min ago". */
export function relativeTime(ms) {
  const m = (Date.now() - ms) / 60000;
  if (Number.isFinite(m) && m < 1) return t('fresh_now');
  return freshAgo(m) ?? t('fresh_now');
}

/** v0.8.45 — THE receipt grammar: how old is a reading, in the user's
 *  language. Takes MINUTES (the age the data layer computed at fetch
 *  time — rendering can happen later), returns localized text, and
 *  returns null for anything unknowable so callers OMIT the receipt
 *  instead of printing "— min ago" (the bug the station row shipped
 *  with whenever freshestAge() had no matching sensor).
 *  Boundaries: 0→"0 min ago" · 59→"59 min ago" · 60→"1 hr ago" ·
 *  90→"1.5 hr ago" · 240→"4 hr ago". */
export function freshAgo(ageMin) {
  if (ageMin == null || !Number.isFinite(ageMin) || ageMin < 0) return null;
  const m = Math.round(ageMin);
  if (m < 60) return t('fresh_min_ago', { n: m });
  const h = Math.round(ageMin / 6) / 10;
  return t('fresh_hours_ago', { n: h });
}

/**
 * Rothfusz regression heat index (°C input, °C output) — NWS standard,
 * adjusted for low humidity / low temperature edge cases.
 */
export function heatIndex(tempC, rhPct) {
  if (tempC == null || rhPct == null) return tempC ?? null;
  const T = cToF(tempC);
  const R = rhPct;
  let hi =
    -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R -
    0.00683783 * T * T - 0.05481717 * R * R + 0.00122874 * T * T * R +
    0.00085282 * T * R * R - 0.00000199 * T * T * R * R;
  if (R < 13 && T >= 80 && T <= 112) {
    hi -= ((13 - R) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
  } else if (R > 85 && T >= 80 && T <= 87) {
    hi += ((R - 85) / 10) * ((87 - T) / 5);
  }
  const hiC = (hi - 32) * 5 / 9;
  return Math.round(Math.max(tempC, hiC) * 10) / 10;
}
