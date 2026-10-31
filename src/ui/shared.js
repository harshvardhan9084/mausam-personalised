/**
 * shared.js — render helpers shared by all dashboards.
 */

import { el } from '../utils/dom.js';
import { temp, wind, hourLabel, dayLabel, dateLabel } from '../utils/format.js';
import { t, getLang } from '../core/i18n.js';
import { wxText } from '../api/wmo.js';
import { icon, skyIcon } from './icons.js';

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
export const sectionTitle = (text, mt = false, glyph = null) => el(`span.sec-title${mt ? '.mt' : ''}`, { role: 'heading', 'aria-level': '2' }, glyph ? icon(glyph, 'sec-ico') : null, glyph ? ' ' : '', text);

/** Generic card. */
export const card = (...children) => el('div.card', null, ...children);

/** Grid of mini stat tiles. */
export function statTiles(items) {
  return el(
    'div.row-4',
    null,
    items.map(([value, label, color, ask]) => {
      const tile = el('div.card.pad-sm', null,
        el('div.mini-stat', null,
          el('div.mini-val', { style: color ? { color } : null }, value),
          el('div.mini-lbl', null, label)
        )
      );
      /* v0.8.38: a tile that carries a glossary question is an honest
         button — the number IS what the user taps to ask about. */
      return ask ? askable(tile, ask) : tile;
    })
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

/* ================================================================
   ASKABLE — v0.8.37 "every advisory answers back".
   An advisory (farm-desk row, crop-week row…) becomes one tap away
   from a conversation: the row itself is the button, a small chat
   chip at the trailing edge is the affordance, and the question —
   prepared by the code that GENERATED the advisory, so it always
   matches the data — rides a `mausam:ask` event that main.js routes
   to Mitra. Keyboard: Enter/Space; screen readers hear the row +
   the "Ask Mitra" label, never a mystery div.
================================================================ */
export function askable(node, question) {
  if (!question) return node; // no honest question → leave the row as plain text
  node.classList.add('askable');
  node.setAttribute('role', 'button');
  node.setAttribute('tabindex', '0');
  // the row's own headline (farm-rowtitle / crop-advice-crop / the card or
  // tile head) is what a screen reader should hear after "Ask Mitra:" —
  // textContent of the whole row glues title and body together ("Spray window1 AM"),
  // so prefer a head node
  const head = node.querySelector('.farm-rowtitle, .crop-advice-crop, .foryou-head, .insight-head, .mini-lbl')?.textContent
    ?? node.textContent;
  node.setAttribute('aria-label', `${t('ask_mitra_label')}: ${head.replace(/\s+/g, ' ').trim().slice(0, 90)}`);
  node.appendChild(el('span.ask-go', { 'aria-hidden': 'true' }, icon('chat', 'ask-ico')));
  const fire = () => window.dispatchEvent(new CustomEvent('mausam:ask', { detail: { question: String(question) } }));
  node.addEventListener('click', fire);
  node.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); }
  });
  return node;
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
    el('div.h-icon', null, h.weather_code != null ? skyIcon(skyBucket(h.weather_code, !h.night), 'wx-ico') : (h.wx?.icon ?? '·')),
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
    el('div.w-icon', null, d.weather_code != null ? skyIcon(skyBucket(d.weather_code, true), 'wx-ico') : (d.wx?.icon ?? '·')),
    el('div.w-temp', null, `${temp(d.temp_max, units)}/${temp(d.temp_min, units)}`),
    el('div.w-rain', null, icon('droplet', 'wx-ico-xs'), ` ${Math.round(d.precip_prob_max ?? 0)}%`)
  );
}

/** Score-colored value. */
export function scoreColor(score) {
  return score >= 65 ? 'var(--green)' : score >= 40 ? 'var(--yellow)' : 'var(--red)';
}

/** Skeleton placeholders while loading.
 *  v0.8.11: mirrors the dashboard it replaces — hero block, hour-strip cells,
 *  temperature-chart band, 10-day rows and the insight-card trio — instead of
 *  three anonymous bars. A cold 3G load now shows the page's real shape. */
export function skeleton() {
  const row = (cls, n, maker) => el('div' + cls, null,
    Array.from({ length: n }, maker));
  return el('div', { 'aria-hidden': 'true', class: 'sk-page' },
    el('div.sk.sk-hero'),
    row('.sk-row', 6, () => el('div.sk.sk-cell')),
    el('div.sk.sk-chart'),
    row('.sk-ten', 4, () => el('div.sk-ten-row', null,
      el('div.sk.sk-day'), el('div.sk.sk-bar'), el('div.sk.sk-num'))),
    row('.sk-row.sk-cards', 3, () => el('div.sk.sk-card')),
  );
}

/** Full error card with retry. */
export function errorCard(message, onRetry) {
  return el('div.state-card', null,
    el('div.state-icon', null, icon('signal-off', 'state-glyph')),
    el('div.state-title', null, t('err_title')),
    el('div.state-sub', null, message || t('err_body')),
    onRetry ? el('button.btn.btn-primary', { onclick: onRetry }, t('retry')) : null
  );
}

/* ================================================================
   SKY HERO — v0.8.8 "Living Sky".
   skyBucket() folds WMO code + day/night into one of 9 visual
   skies; sky.css themes the hero card (gradient, animated deco,
   glyph) from the data-sky attribute. Falls back to a neutral
   cloudy day when fields are missing — never throws.
================================================================ */
export function skyBucket(code, isDay) {
  const c = Number(code);
  const day = isDay !== false; // treat missing as day
  if (c === 0 || c === 1) return day ? 'clear-day' : 'clear-night';
  if (c === 2) return day ? 'partly-day' : 'partly-night';
  if (c === 3) return 'cloudy';
  if (c === 45 || c === 48) return 'fog';
  if ((c >= 51 && c <= 57) || (c >= 80 && c <= 82)) return 'drizzle';
  if (c >= 61 && c <= 67) return 'rain';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
  if (c >= 95) return 'storm';
  return 'cloudy';
}

/** One translucent meta chip for the hero (icon + value). */
const heroChip = (iconName, text) =>
  el('span.hero-chip', null, icon(iconName, 'chip-ico'), el('span', null, text));

/** Build the hero "right now" block (animated glyph, big temp, chips). */
export function nowRow(snapshot, units) {
  const n = snapshot.now ?? {};
  const bucket = skyBucket(n.weather_code, n.is_day);
  return el('div.hero-body',
    { class: 'sky-' + bucket },
    el('div.sky-glyph', { 'aria-hidden': 'true' }, skyIcon(bucket)),
    el('div.hero-main',
      null,
      el('div.hero-now-temp', null, temp(n.temp, units, true)),
      el('div.hero-cond', null, wxText(n.wx, getLang())),
      el('div.hero-chips',
        null,
        heroChip('thermo', `${t('feels_like')} ${temp(n.feels, units, true)}`),
        heroChip('droplet', `${Math.round(n.humidity ?? 0)}%`),
        heroChip('wind', wind(n.wind, units))
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
