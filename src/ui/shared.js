/**
 * shared.js — render helpers shared by all dashboards.
 */

import { el } from '../utils/dom.js';
import { temp, wind, hourLabel, dayLabel, dateLabel } from '../utils/format.js';
import { t } from '../core/i18n.js';

/** Hero block — the persona's headline card. */
export function hero(labelText, bigNode, ...subNodes) {
  return el(
    'div.hero',
    null,
    el('div.hero-label', null, labelText),
    typeof bigNode === 'string' ? el('div.hero-big', null, bigNode) : bigNode,
    ...subNodes.map((n) => (typeof n === 'string' ? el('div.hero-sub', null, n) : n))
  );
}

/** Section heading. */
export const sectionTitle = (text, mt = false) => el(`span.sec-title${mt ? '.mt' : ''}`, { role: 'heading', 'aria-level': '2' }, text);

/** Generic card. */
export const card = (...children) => el('div.card', null, ...children);

/** Grid of mini stat tiles. */
export function statTiles(items) {
  return el(
    'div.row-4',
    null,
    items.map(([value, label, color]) =>
      el('div.card.pad-sm', null,
        el('div.mini-stat', null,
          el('div.mini-val', { style: color ? { color } : null }, value),
          el('div.mini-lbl', null, label)
        )
      )
    )
  );
}

/** Key-value list rows. */
export function kvList(rows) {
  return el(
    'div.kv-list',
    null,
    rows.map(([label, value]) =>
      el('div.kv-row', null,
        el('span.kv-label', null, label),
        el('span.kv-value', null, value)
      )
    )
  );
}

/** Alert banner. kind: ok | info | warn | danger */
export function alert(kind, ...children) {
  return el(`div.alert.alert-${kind}`, { role: 'alert' }, ...children);
}

/** Horizontal strip of hour cards. */
export function hourlyStrip(hours, renderCard) {
  return el(
    'div.hourly-strip',
    { role: 'list', 'aria-label': 'Hour by hour' },
    hours.map((h) => {
      const c = renderCard(h);
      c.setAttribute('role', 'listitem');
      return c;
    })
  );
}

/** Standard hour card for a scored strip. */
export function scoredHourCard(h, { value, sub, title }) {
  return el(
    `div.hour-card.${h.band?.cls ?? ''}`,
    { title: title ?? '' },
    el('div.h-time', null, hourLabel(h.time)),
    el('div.h-icon', null, h.wx?.icon ?? '·'),
    el('div.h-val', null, value),
    el('div.h-sub', null, sub)
  );
}

/** 7-day grid; cells built by renderCell(day, i, isToday). */
export function weekGrid(days, renderCell) {
  return el(
    'div.week-grid',
    { role: 'list', 'aria-label': '7 day forecast' },
    days.map((d, i) => {
      const cell = renderCell(d, i, i === 0);
      cell.classList.add('week-card');
      if (i === 0) cell.classList.add('today');
      cell.setAttribute('role', 'listitem');
      return cell;
    })
  );
}

/** Simple week cell (icon + temps + rain). */
export function simpleWeekCell(d, i, units) {
  return el(
    'div',
    null,
    el('div.w-day', null, dayLabel(d.date, i)),
    el('div.w-date', null, dateLabel(d.date)),
    el('div.w-icon', null, d.wx?.icon ?? '·'),
    el('div.w-temp', null, `${temp(d.temp_max, units)}/${temp(d.temp_min, units)}`),
    el('div.w-rain', null, `💧 ${Math.round(d.precip_prob_max ?? 0)}%`)
  );
}

/** Score-colored value. */
export function scoreColor(score) {
  return score >= 65 ? 'var(--green)' : score >= 40 ? 'var(--yellow)' : 'var(--red)';
}

/** Skeleton placeholders while loading. */
export function skeleton() {
  return el(
    'div',
    { 'aria-hidden': 'true' },
    el('div.skeleton.hero-skeleton'),
    el('div.skeleton'),
    el('div.skeleton')
  );
}

/** Full error card with retry. */
export function errorCard(message, onRetry) {
  return el('div.state-card', null,
    el('div.state-icon', null, '📡'),
    el('div.state-title', null, 'Could not load weather'),
    el('div.state-sub', null, message || 'The weather service did not respond. Check your connection and try again.'),
    onRetry ? el('button.btn.btn-primary', { onclick: onRetry }, 'Retry') : null
  );
}

/** Offline notice card (used with cached data). */
export function offlineCard(fetchedAt) {
  return el('div.alert.alert-info', { role: 'status' },
    `📴 You are offline — showing data fetched ${fetchedAt ? new Date(fetchedAt).toLocaleString() : 'earlier'}.`
  );
}

/** Build the hero "right now" row (icon, temp, meta). */
export function nowRow(snapshot, units) {
  const n = snapshot.now;
  return el('div.hero-now-row', null,
    el('div.hero-now-icon', null, n.wx.icon),
    el('div',
      null,
      el('div.hero-now-temp', null, temp(n.temp, units, true)),
      el('div.hero-now-meta', null,
        `${n.wx.label} · ${t('feels_like')} ${temp(n.feels, units, true)} · 💧 ${Math.round(n.humidity ?? 0)}% · 🌬 ${wind(n.wind, units)}`
      )
    )
  );
}

/** CPCB AQI pill. */
export function aqiPill(aqiInfo) {
  if (aqiInfo?.aqi == null) return el('span.aqi-pill', { style: { borderColor: 'var(--border)', color: 'var(--muted)' } }, t('aqi_unavail'));
  return el(
    'span.aqi-pill',
    { style: { borderColor: aqiInfo.color, color: aqiInfo.color, background: 'transparent' } },
    el('span.aqi-dot', { style: { background: aqiInfo.color } }),
    `AQI ${aqiInfo.aqi} · ${aqiInfo.category}`
  );
}

/** Footer note with attribution. */
export function footerNote() {
  return el('div.footer-note', null,
    'Data: ', el('a', { href: 'https://open-meteo.com/', target: '_blank', rel: 'noopener' }, 'Open-Meteo'),
    ' (CC-BY 4.0) · AQI: CPCB breakpoints computed client-side · IMD official data optional (',
    el('a', { href: 'https://api.imd.gov.in', target: '_blank', rel: 'noopener' }, 'api.imd.gov.in'),
    ') · Geolocation naming by ', el('a', { href: 'https://nominatim.openstreetmap.org/', target: '_blank', rel: 'noopener' }, 'OpenStreetMap'),
    ' · Mausam is an independent project, not affiliated with IMD. '
  );
}
