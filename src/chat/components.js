/**
 * components.js — renders chat "response components" into DOM nodes.
 *
 * brain.js returns a list of typed descriptors; each maps to a compact
 * chat card (mini weather card, rain timeline, advice windows, AQI badge,
 * week strip, packing list…). Everything is built with utils/dom.el —
 * no innerHTML, so user data can never inject markup.
 */

import { el } from '../utils/dom.js';
import { temp as fmtTemp, hourLabel } from '../utils/format.js';

/** Render **bold** markdown spans safely (no HTML parsing). */
function richText(text) {
  const frag = document.createDocumentFragment();
  const parts = String(text).split(/\*\*(.+?)\*\*/g);
  parts.forEach((part, i) => {
    if (!part) return;
    frag.appendChild(i % 2 === 1 ? el('strong', null, part) : document.createTextNode(part));
  });
  return frag;
}

/** Resolve chips: string | {label, message?, action?}. */
function chipNode(chip, handlers) {
  const label = typeof chip === 'string' ? chip : chip.label;
  return el('button.chip', {
    type: 'button',
    onclick: () => {
      if (typeof chip === 'object' && chip.action) handlers.onAction?.(chip.action);
      else handlers.onSend?.(typeof chip === 'object' ? chip.message ?? chip.label : chip);
    },
  }, label);
}

/* ---------------- individual components ---------------- */

function cText(text) {
  return el('div.chat-text', null, richText(text));
}

function cNowCard(state) {
  const s = state.snapshot;
  if (!s) return null;
  const n = s.now;
  const units = state.units;
  return el('div.chat-now.card',
    el('div.chat-now-left',
      el('div.chat-now-icon', null, n.wx.icon),
      el('div',
        el('div.chat-now-temp', null, fmtTemp(n.temp, units, true)),
        el('div.chat-now-sub', null, n.wx.label)
      )
    ),
    el('div.chat-now-right',
      el('div.chat-now-kv', null, `Feels ${fmtTemp(n.feels, units, true)}`),
      el('div.chat-now-kv', null, `💧 ${Math.round(n.humidity ?? 0)}%`),
      el('div.chat-now-kv', null, `🌬 ${Math.round(n.wind ?? 0)} km/h`)
    )
  );
}

function cRainStrip(hours) {
  if (!hours?.length) return null;
  return el('div.rain-strip',
    { role: 'list', 'aria-label': 'Hourly rain chance' },
    hours.map((h) => el('div.rain-chip',
      { role: 'listitem', class: (h.precipitation_probability ?? 0) >= 50 ? 'wet' : '' },
      el('div.rain-h', null, hourLabel(h.time)),
      el('div.rain-p', null, `${Math.round(h.precipitation_probability ?? 0)}%`),
      el('div.rain-i', null, (h.precipitation_probability ?? 0) >= 50 ? '🌧️' : (h.precipitation_probability ?? 0) >= 25 ? '🌦️' : '☁️')
    ))
  );
}

function cWindows(windows) {
  if (!windows?.length) return null;
  return el('div.win-list',
    windows.map((w) => el('div.win-row',
      { style: { borderLeftColor: w.color } },
      el('div.win-slot', null, w.slot),
      el('div.win-badge', { style: { background: w.color } }, w.rating),
      el('div.win-why', null, w.reason)
    ))
  );
}

function cWeekStrip(days) {
  if (!days?.length) return null;
  return el('div.week-strip',
    days.map((d) => el('div.week-cell',
      el('div.wc-day', null, d.label),
      el('div.wc-icon', null, d.icon),
      el('div.wc-temp', null, `${fmtTemp(d.max, 'metric')} / ${fmtTemp(d.min, 'metric')}`),
      el('div.wc-rain', null, `💧${d.rain}%`)
    ))
  );
}

function cAqiCard(state) {
  const info = state.snapshot?.currentAqi;
  if (!info?.aqi) return null;
  return el('div.aqi-card.card',
    el('div.aqi-big', { style: { color: info.color } }, String(info.aqi)),
    el('div',
      el('div.aqi-cat', { style: { color: info.color } }, info.category),
      el('div.aqi-note', null, info.advice || `Dominant pollutant: ${info.dominant ?? '—'}`)
    )
  );
}

function cSunCard(data) {
  return el('div.sun-card.card',
    el('div.sun-row', null, '🌅 ', el('b', null, data.sunrise ?? '—'), ' sunrise'),
    el('div.sun-row', null, '🌇 ', el('b', null, data.sunset ?? '—'), ' sunset'),
    data.moonrise || data.moonset
      ? el('div.sun-row.sun-moon', null, `🌙 ${data.moonrise ?? '—'} ↑ · ${data.moonset ?? '—'} ↓`)
      : null,
    data.source ? el('div.sun-src', null, `via ${data.source} official data`) : null
  );
}

function cWearList(items) {
  if (!items?.length) return null;
  return el('div.wear-list',
    items.map(([icon, name, why]) => el('div.wear-row',
      el('span.wear-icon', null, icon),
      el('div', null,
        el('div.wear-name', null, name),
        el('div.wear-why', null, why)
      )
    ))
  );
}

function cList(title, rows) {
  return el('div.chat-list.card',
    title ? el('div.chat-list-title', null, title) : null,
    rows.map(([k, v]) => el('div.chat-list-row',
      el('span', null, k),
      el('b', null, v)
    ))
  );
}

function cProfileCard(profile) {
  if (!profile) return null;
  return el('div.profile-card.card',
    el('div.pc-emoji', null, profile.emoji),
    el('div',
      el('div.pc-name', null, profile.name),
      el('div.pc-sub', null, `📍 ${profile.home?.name ?? '—'} · ${profile.lens}`)
    )
  );
}

/* ---------------- dispatcher ---------------- */

/**
 * Render one component descriptor.
 * @returns {Node|null}
 */
export function renderComponent(comp, state, handlers) {
  switch (comp.type) {
    case 'text': return cText(comp.text);
    case 'note': return el('div.chat-note', null, comp.text);
    case 'nowCard': return cNowCard(state);
    case 'rainStrip': return cRainStrip(comp.hours);
    case 'windows': return cWindows(comp.windows);
    case 'weekStrip': return cWeekStrip(comp.days);
    case 'aqiCard': return cAqiCard(state);
    case 'sunCard': return cSunCard(comp);
    case 'wearList': return cWearList(comp.items);
    case 'list': return cList(comp.title, comp.rows);
    case 'profileCard': return cProfileCard(comp.profile);
    case 'error':
      return el('div.chat-error',
        el('div.chat-error-title', null, `⚠️ ${comp.title}`),
        el('div.chat-error-text', null, comp.text)
      );
    case 'quick':
      return el('div.chat-chips', null,
        (comp.chips ?? []).map((chip) => chipNode(chip, handlers)).filter(Boolean)
      );
    default: return null;
  }
}
