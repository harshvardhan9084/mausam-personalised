/**
 * render.js — the renderer side of the MausamUI contract.
 *
 * Maps validated contract payloads (see contract.js) to real components
 * built with utils/dom.el — never innerHTML, so AI-produced strings can
 * never inject markup. Unknown/broken payloads render as readable
 * fallbacks instead of throwing.
 */

import { el } from '../utils/dom.js';
import { temp as fmtTemp, wind as fmtWind } from '../utils/format.js';
import { icon, skyIcon, tipIcon } from '../ui/icons.js';
import { parseBlock, REGISTRY, FENCE } from './contract.js';
import { aqiBandColor } from '../core/aqi-cpcb.js';

/* ================================================================
   v0.8.20 — the chat joins the glyph language. Cards used to render
   raw emoji (💧 🌬 📍 🌅 from the static renderers, weather-code emoji
   from wmo.js, freeform emoji from the LLM) — every Android skin draws
   those differently, and chat was the last "generated vs designed"
   surface after the v0.8.13 migration covered the dashboard. muGlyph()
   folds whatever a payload carries into the SAME stroke-SVG language:
   sky-bucket keys (clear-day…storm), tip keys (umbrella, shirt…), or
   the legacy emoji set (mapped below). Unmapped → null, so callers
   fall back to a designed neutral — never a broken empty chip.
================================================================ */
const KEY_WX = {
  'clear-day': 'clear-day', 'clear-night': 'clear-night', 'partly-day': 'partly-day',
  'partly-night': 'partly-night', cloudy: 'cloudy', fog: 'fog', drizzle: 'drizzle',
  rain: 'rain', snow: 'snow', storm: 'storm',
  sun: 'clear-day', moon: 'clear-night', cloud: 'cloudy', partly: 'partly-day',
};
const EMOJI_WX = {
  '☀️': 'clear-day', '🌤️': 'partly-day', '⛅': 'partly-day', '🌝': 'clear-day', '🌞': 'clear-day',
  '☁️': 'cloudy', '🌙': 'clear-night', '🌦️': 'drizzle', '🌧️': 'rain', '⛈️': 'storm',
  '🌩️': 'storm', '🌫️': 'fog', '❄️': 'snow', '🌨️': 'snow',
  '☂️': 'rain', '☔': 'rain',
};
const EMOJI_TIP = {
  '💧': 'droplet', '🌬': 'wind', '💨': 'wind', '🧭': 'compass', '🌡️': 'thermo',
  '☂️': 'umbrella', '☔': 'umbrella', '🧥': 'shirt', '👕': 'shirt', '🧣': 'shirt',
  '🧢': 'sun', '🕶️': 'sun', '🧴': 'sun', '😎': 'sun', '😷': 'haze', '✅': 'check', ' ✔': 'check',
};
function muGlyph(key, cls = 'mu-ico') {
  if (typeof key !== 'string' || !key) return null;
  const k = key.trim();
  if (!k) return null;
  const bucket = KEY_WX[k.toLowerCase()] ?? EMOJI_WX[k];
  if (bucket) return skyIcon(bucket, cls);
  return tipIcon(k, cls) ?? (EMOJI_TIP[k] ? icon(EMOJI_TIP[k], cls) : null);
}

/* ---------------- text helpers ---------------- */

/** Render **bold** / `code` spans safely (no HTML parsing). */
export function richText(text) {
  const frag = document.createDocumentFragment();
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) {
      frag.appendChild(el('strong', null, part.slice(2, -2)));
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      frag.appendChild(el('code.mono', null, part.slice(1, -1)));
    } else {
      frag.appendChild(document.createTextNode(part));
    }
  }
  return frag;
}

/** Multi-line text with paragraph + "- list" support (safe). */
export function proseNode(text) {
  const wrap = el('div.chat-text');
  for (const seg of salvageInlineUI(text)) {
    if (seg.type === 'payload') {
      const node = renderPayload(seg.payload);
      if (node) wrap.appendChild(el('div.chat-inline-card', null, node));
      continue;
    }
    if (seg.type === 'hold') break; // trailing incomplete payload — stop here
    appendProse(wrap, seg.text);
  }
  return wrap;
}

function appendProse(wrap, text) {
  const lines = String(text).split('\n');
  let list = null;
  const flush = () => { if (list) { wrap.appendChild(list); list = null; } };
  for (const line of lines) {
    const t = line.trim();
    if (!t) { flush(); continue; }
    if (/^[-•*]\s+/.test(t)) {
      if (!list) list = el('div.chat-ul');
      list.appendChild(el('div.chat-li', null, richText(t.replace(/^[-•*]\s+/, ''))));
    } else {
      flush();
      const p = el('div.chat-p');
      p.appendChild(richText(t));
      wrap.appendChild(p);
    }
  }
  flush();
}

/* ---------------- inline-JSON salvage ---------------- */

/** Find the index of the matching close-brace for the '{' at `start`. */
function matchBrace(text, start) {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Split prose into text / payload segments. Models sometimes emit the UI
 * payload as a BARE JSON object (no fence) — those must never be shown as
 * raw JSON text. Valid payloads become components; broken ones are dropped
 * (the prose around them survives). Pure function (no DOM) — exported for tests.
 */
function salvageInlineUI(text) {
  const s = String(text);
  const out = [];
  const rx = /\{\s*"(?:v|c|d|t)"\s*:/g;
  let last = 0;
  let m;
  while ((m = rx.exec(s))) {
    const start = m.index;
    const end = matchBrace(s, start);
    if (end < 0) continue; // unbalanced — leave as text
    const raw = s.slice(start, end + 1);
    // Only treat as a UI payload when it self-identifies: has a "c" whose
    // value is a known component type (or "d"+"c" together).
    let known = false;
    try {
      const probe = JSON.parse(raw);
      known = probe && typeof probe === 'object' && typeof probe.c === 'string' && Boolean(REGISTRY[probe.c]);
    } catch { known = false; }
    if (!known) continue;
    const before = s.slice(last, start);
    if (before.trim()) out.push({ type: 'text', text: before });
    const res = parseBlock(raw);
    if (res.ok) out.push({ type: 'payload', payload: res.payload });
    // broken known-type payload: dropped silently — a fallback card for a
    // half-written object is more confusing than helpful
    last = end + 1;
    rx.lastIndex = last;
  }
  const tail = s.slice(last);
  // Hold back a trailing INCOMPLETE payload (still streaming): an unbalanced
  // "{…<envelope-key>" candidate is suppressed so raw JSON never flashes in
  // the UI; once it completes, the loop above converts it.
  let heldAt = -1;
  {
    const rx2 = /\{\s*"(?:v|c|d|t)"\s*:/g;
    let m2;
    while ((m2 = rx2.exec(tail))) {
      if (matchBrace(tail, m2.index) === -1) { heldAt = m2.index; break; }
    }
  }
  const visible = heldAt >= 0 ? tail.slice(0, heldAt) : tail;
  const held = heldAt >= 0;
  if (visible.trim() || (!out.length && !held)) out.push({ type: 'text', text: visible });
  if (held) out.push({ type: 'hold' });
  return out;
}

export { salvageInlineUI };

/* ---------------- SVG charts ---------------- */

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Temperature trend: area + line + min/max labels. */
function tempChartSVG({ labels, temps, feels, unit }) {
  const W = 320, H = 110, PADX = 8, PADT = 14, PADB = 18;
  const vals = temps.filter((v) => v != null);
  if (vals.length < 2) return null;
  const allVals = feels ? [...vals, ...feels.filter((v) => v != null)] : vals;
  let min = Math.min(...allVals), max = Math.max(...allVals);
  if (max - min < 4) { const mid = (max + min) / 2; min = mid - 2; max = mid + 2; }
  const span = max - min;
  const n = temps.length;
  const x = (i) => PADX + (i * (W - PADX * 2)) / (n - 1);
  const y = (v) => PADT + (1 - (v - min) / span) * (H - PADT - PADB);

  const line = temps.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ');
  const area = `${PADX},${H - PADB} ${line} ${(W - PADX).toFixed(1)},${H - PADB}`;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'mchart', role: 'img', 'aria-label': 'Temperature trend chart' });
  const defs = svgEl('defs');
  const grad = svgEl('linearGradient', { id: `tg${Math.random().toString(36).slice(2, 8)}`, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': 'var(--accent)', 'stop-opacity': 0.34 }));
  grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': 'var(--accent)', 'stop-opacity': 0 }));
  defs.appendChild(grad);
  svg.appendChild(defs);
  svg.appendChild(svgEl('polygon', { points: area, fill: `url(#${grad.id})`, stroke: 'none' }));
  if (feels) {
    const fline = feels.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ');
    svg.appendChild(svgEl('polyline', { points: fline, fill: 'none', stroke: 'var(--muted)', 'stroke-width': 1.4, 'stroke-dasharray': '3 3', opacity: 0.8 }));
  }
  svg.appendChild(svgEl('polyline', { points: line, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  // min / max chips
  const maxI = temps.indexOf(Math.max(...vals));
  const minI = temps.indexOf(Math.min(...vals));
  for (const [i, cls] of [[maxI, 'max'], [minI, 'min']]) {
    if (temps[i] == null) continue;
    svg.appendChild(svgEl('circle', { cx: x(i), cy: y(temps[i]), r: 3, fill: 'var(--accent)' }));
    const tx = svgEl('text', { x: x(i), y: y(temps[i]) - 7, 'text-anchor': i > n / 2 ? 'end' : 'start', class: `mchart-lbl ${cls}` });
    tx.textContent = `${Math.round(temps[i])}${unit}`;
    svg.appendChild(tx);
  }
  // x labels: first / middle / last
  const picks = [0, Math.floor((n - 1) / 2), n - 1];
  for (const i of new Set(picks)) {
    if (!labels[i]) continue;
    const tx = svgEl('text', { x: x(i), y: H - 4, 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle', class: 'mchart-x' });
    tx.textContent = labels[i];
    svg.appendChild(tx);
  }
  return svg;
}

/** Rain probability bars. */
function rainBarsSVG({ labels, pops }) {
  const W = 320, H = 96, PADB = 16, GAP = 3;
  const n = pops.length;
  const bw = (W - GAP * (n - 1)) / n;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'mchart', role: 'img', 'aria-label': 'Rain chance chart' });
  pops.forEach((p, i) => {
    /* v0.8: zero-rain bars must still read as a deliberate flat baseline —
       a 1.5px sliver looked like a broken, empty chart. */
    const h = Math.max(p > 0 ? 5 : 3, (p / 100) * (H - PADB - 8));
    const rect = svgEl('rect', {
      x: (i * (bw + GAP)).toFixed(1), y: (H - PADB - h).toFixed(1),
      width: bw.toFixed(1), height: h.toFixed(1), rx: 2.5,
      fill: p >= 60 ? 'var(--blue)'
        : p >= 30 ? 'color-mix(in srgb, var(--blue) 60%, var(--border))'
        : p > 0 ? 'color-mix(in srgb, var(--blue) 34%, var(--border))'
        : 'color-mix(in srgb, var(--blue) 16%, var(--border))',
    });
    svg.appendChild(rect);
    if (p >= 30) {
      const tx = svgEl('text', { x: i * (bw + GAP) + bw / 2, y: H - PADB - h - 3, 'text-anchor': 'middle', class: 'mchart-x' });
      tx.textContent = `${Math.round(p)}`;
      svg.appendChild(tx);
    }
  });
  const picks = [0, Math.floor((n - 1) / 2), n - 1];
  for (const i of new Set(picks)) {
    if (!labels[i]) continue;
    const tx = svgEl('text', { x: i * (bw + GAP) + bw / 2, y: H - 3, 'text-anchor': 'middle', class: 'mchart-x' });
    tx.textContent = labels[i];
    svg.appendChild(tx);
  }
  return svg;
}

/* ---------------- component renderers ---------------- */

const R = {
  'now-card'(p) {
    const d = p.d;
    const unit = window.__mausamState?.units ?? 'metric';
    return el('div.mu-now.card',
      el('div.mu-now-main',
        el('div.mu-now-icon', { 'aria-hidden': 'true' }, muGlyph(d.icon) ?? skyIcon('cloudy', 'mu-ico')),
        el('div',
          el('div.mu-now-temp', null, d.temp != null ? `${fmtTemp(d.temp, unit, true)}` : '—'),
          el('div.mu-now-cond', null, d.cond || '—')
        )
      ),
      el('div.mu-now-side',
        d.feels != null ? el('div', null, icon('thermo', 'mu-side-ico'), ` Feels ${fmtTemp(d.feels, unit, true)}`) : null,
        d.humidity != null ? el('div', null, icon('droplet', 'mu-side-ico'), ` ${Math.round(d.humidity)}%`) : null,
        d.wind != null ? el('div', null, icon('wind', 'mu-side-ico'), ` ${fmtWind(d.wind, unit)}`) : null,
        d.hi != null && d.lo != null ? el('div', null, `H ${fmtTemp(d.hi, unit)} · L ${fmtTemp(d.lo, unit)}`) : null
      ),
      d.place ? el('div.mu-now-place', null, icon('pin', 'mu-side-ico'), ` ${d.place}`) : null
    );
  },

  'hourly-timeline'(p) {
    const unit = window.__mausamState?.units ?? 'metric';
    return el('div.mu-hourly',
      { role: 'list' },
      p.d.hours.map((h) => el('div.mu-hour', { role: 'listitem', class: (h.pop ?? 0) >= 50 ? 'wet' : '' },
        el('div.mu-hour-t', null, h.time || '—'),
        el('div.mu-hour-i', null, muGlyph(h.icon) ?? skyIcon('cloudy', 'mu-ico')),
        el('div.mu-hour-v', null, h.temp != null ? fmtTemp(h.temp, unit) : '—'),
        h.pop != null ? el('div.mu-hour-p', null, `${Math.round(h.pop)}%`) : null
      ))
    );
  },

  'temp-chart'(p) {
    const svg = tempChartSVG(p.d);
    if (!svg) return null;
    return el('div.mu-chart', svg,
      p.d.feels ? el('div.mu-legend', null, el('span', null, '— temperature'), el('span.dashed', null, '-- feels like')) : null
    );
  },

  'rain-bars'(p) {
    /* v0.8.20 — dry-window honesty: when the whole chart peaks below 15%,
       the bars collapse to the 3-5px sliver floor and the card reads as a
       broken empty box (real-world regression seen on a 6%-peak day).
       A designed dry strip says what the bars can't: no rain, and when
       the tiny peak is. ≥15% keeps the real bars — the chart earns it. */
    const pops = Array.isArray(p.d?.pops) ? p.d.pops.map((x) => Number(x) || 0) : [];
    const peak = pops.length ? Math.max(...pops) : 0;
    if (pops.length && peak < 15) {
      const i = pops.indexOf(peak);
      const at = p.d.labels?.[i];
      return el('div.mu-dry',
        skyIcon('clear-day', 'mu-dry-ico'),
        el('div.mu-dry-text',
          el('b', null, 'No rain in this window'),
          el('span', null, `Peak chance ${Math.round(peak)}%${at ? ` around ${at}` : ''} — stay dry.`))
      );
    }
    const svg = rainBarsSVG(p.d);
    return el('div.mu-chart', svg);
  },

  'daily-list'(p) {
    const unit = window.__mausamState?.units ?? 'metric';
    const his = p.d.days.map((x) => x.hi).filter((v) => v != null);
    const los = p.d.days.map((x) => x.lo).filter((v) => v != null);
    const wMax = Math.max(...his, -99), lMin = Math.min(...los, 99);
    const range = Math.max(1, wMax - lMin);
    return el('div.mu-days',
      p.d.days.map((d) => el('div.mu-day',
        el('span.mu-day-l', null, d.label || d.date || '—'),
        el('span.mu-day-i', { title: d.cond || '' }, muGlyph(d.icon) ?? skyIcon('cloudy', 'mu-ico')),
        el('div.mu-day-bar',
          el('div.mu-day-fill', {
            style: {
              left: d.lo != null ? `${((d.lo - lMin) / range) * 100}%` : '0%',
              width: d.hi != null && d.lo != null ? `${Math.max(8, ((d.hi - d.lo) / range) * 100)}%` : '8%',
            },
          })
        ),
        el('span.mu-day-v', null, `${d.hi != null ? fmtTemp(d.hi, unit) : '—'} / ${d.lo != null ? fmtTemp(d.lo, unit) : '—'}`),
        d.pop != null ? el('span.mu-day-p', null, `${Math.round(d.pop)}%`) : null
      ))
    );
  },

  'metrics-grid'(p) {
    return el('div.mu-metrics', p.d.items.map((m) => {
      const g = muGlyph(m.icon);
      return el('div.mu-metric',
        el('div.mu-metric-v', null, g, m.value ? el('span', null, ` ${m.value}`) : null),
        el('div.mu-metric-l', null, m.label)
      );
    }));
  },

  'advice'(p) {
    return el(`div.mu-advice.mu-tone-${p.d.tone}`,
      p.d.title ? el('div.mu-advice-t', null, p.d.title) : null,
      el('div.mu-advice-list', p.d.items.map((i) => {
        const g = muGlyph(i.icon);
        return el('div.mu-advice-row', null, g ? el('span.mu-advice-ico', null, g) : null, el('span', null, i.text));
      }))
    );
  },

  'alert'(p) {
    /* severity → the dashboard's alert language: same .alert tone classes,
       stroke glyphs instead of ℹ️/⚠️/🚨 (colors come from rich.css). */
    const sev = p.d.severity === 'danger' ? 'danger' : p.d.severity === 'warn' ? 'warn' : 'info';
    return el(`div.alert.alert-${p.d.severity === 'info' ? 'info' : p.d.severity === 'danger' ? 'danger' : 'warn'}.mu-alert`,
      el('div.alert-title', null, icon(sev === 'info' ? 'bell' : 'warn', 'alert-ico'), el('span', null, p.d.title || 'Alert')),
      p.d.text ? el('div', null, p.d.text) : null,
      p.d.source ? el('div.mu-alert-src', null, p.d.source) : null
    );
  },

  'compare-table'(p) {
    return el('div.mu-tablewrap',
      el('table.mu-table',
        el('thead', null, el('tr', null, p.d.columns.map((c) => el('th', null, c)))),
        el('tbody', null, p.d.rows.map((row) =>
          el('tr', null, row.map((cell, i) => el(i === 0 ? 'th' : 'td', null, cell)))
        ))
      )
    );
  },

  'window-card'(p) {
    return el('div.mu-windows',
      p.d.verdict ? el('div.mu-verdict', null, p.d.verdict) : null,
      p.d.windows.map((w) => el('div.win-row', { style: { borderLeftColor: w.color } },
        el('div.win-slot', null, w.slot),
        w.rating ? el('div.win-badge', { style: { background: w.color } }, w.rating) : null,
        w.reason ? el('div.win-why', null, w.reason) : null
      ))
    );
  },

  'aqi-card'(p) {
    const cat = window.__mausamState?.snapshot?.currentAqi;
    /* v0.8.22 — one band vocabulary: aqiBandColor() (core) instead of this
       card's own 6-way ternary that mixed tokens with two stray hexes and
       could disagree with the dashboard dial for the same value. */
    const color = p.d.aqi != null ? aqiBandColor(p.d.aqi) : (cat?.color ?? 'var(--aqi-u)');
    return el('div.aqi-card.card.mu-aqi',
      el('div.aqi-big', { style: { color } }, p.d.aqi != null ? String(Math.round(p.d.aqi)) : '—'),
      el('div',
        el('div.aqi-cat', { style: { color } }, p.d.category || 'Unknown'),
        el('div.aqi-note', null,
          p.d.advice || (p.d.dominant ? `Dominant pollutant: ${p.d.dominant}` : 'Air quality summary')
        )
      )
    );
  },

  'sun-card'(p) {
    const d = p.d;
    return el('div.sun-card.card',
      d.sunrise ? el('div.sun-row', null, icon('sunrise', 'sun-row-ico'), el('b', null, d.sunrise), ' sunrise') : null,
      d.sunset ? el('div.sun-row', null, icon('sunset', 'sun-row-ico'), el('b', null, d.sunset), ' sunset') : null,
      d.dayLength ? el('div.sun-row', null, icon('hourglass', 'sun-row-ico'), el('b', null, d.dayLength), ' of daylight') : null,
      d.moonrise || d.moonset
        ? el('div.sun-row.sun-moon', null, icon('moon', 'sun-row-ico'), ` ${d.moonrise || '—'} ↑ · ${d.moonset || '—'} ↓`)
        : null,
      d.source ? el('div.sun-src', null, `via ${d.source} official data`) : null
    );
  },

  'wear-list'(p) {
    return el('div.wear-list', p.d.items.map((i) =>
      el('div.wear-row',
        el('span.wear-icon', null, muGlyph(i.icon) ?? icon('shirt', 'mu-ico')),
        el('div', null,
          el('div.wear-name', null, i.name),
          i.why ? el('div.wear-why', null, i.why) : null
        )
      )
    ));
  },

  'chips'(p, handlers) {
    return el('div.chat-chips', p.d.items.map((label) =>
      el('button.chip', { type: 'button', onclick: () => handlers?.onSend?.(label) }, label)
    ));
  },

  'note'(p) {
    return el('div.chat-note', null, p.d.text);
  },
};

/* ---------------- public API ---------------- */

/** Card wrapper with optional title. */
function withTitle(payload, node) {
  if (!payload.t) return node;
  return el('div.mu-cardwrap', el('div.mu-title', null, payload.t), node);
}

/**
 * Render one validated payload → Node.
 * @returns {Node|null}
 */
export function renderPayload(payload, handlers) {
  const fn = R[payload.c];
  if (!fn) return fallbackNode(payload.t, `Unsupported component "${payload.c}"`, payload.d);
  let node = null;
  try {
    node = fn(payload, handlers);
  } catch (err) {
    console.warn('MausamUI render failed:', err);
    return fallbackNode(payload.t, 'This card could not be displayed.', payload.d);
  }
  return node ? withTitle(payload, node) : null;
}

/**
 * Render a raw (unvalidated / failed) fence → readable fallback.
 * Called when parseBlock fails. NEVER dumps raw JSON into the chat —
 * it salvages human-readable fields and shows those instead.
 */
export function renderFallback(rawJSON, reason) {
  const salvage = salvageReadable(rawJSON);
  return el('div.mu-fallback',
    el('div.mu-fallback-head', null, icon('warn', 'mu-fallback-ico'), ' Couldn’t draw that card'),
    reason ? el('div.mu-fallback-why', null, humanReason(reason)) : null,
    salvage
      ? el('div.mu-fallback-body',
          salvage.title ? el('div.mu-fallback-title', null, salvage.title) : null,
          salvage.rows.map(([k, v]) => el('div.mu-fallback-row', null, el('span', null, k), el('b', null, v))))
      : null
  );
}

/** Friendlier reason line (the raw validator text is for console). */
function humanReason(reason) {
  const r = String(reason);
  if (r.includes('not valid JSON')) return 'The card data arrived malformed.';
  if (r.startsWith('unknown component')) return `${r.replace('unknown component', 'This card type isn’t supported here:')} `;
  if (r.includes('contract version')) return 'The card uses a different contract version.';
  if (r.startsWith('bad ')) return 'The card data didn’t match what this card needs.';
  return 'The card could not be rendered.';
}

/** Pull human-readable bits out of a failed payload — no raw JSON shown. */
function salvageReadable(rawJSON) {
  let obj;
  try { obj = JSON.parse(rawJSON); } catch { return null; }
  if (!obj || typeof obj !== 'object') return null;
  const title = typeof obj.t === 'string' ? obj.t : typeof obj.title === 'string' ? obj.title : '';
  const data = obj.d && typeof obj.d === 'object' ? obj.d : obj;
  const rows = [];
  const humanKey = (k) => k.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
  const humanVal = (v) => {
    if (v == null) return '';
    if (typeof v === 'number') return String(Math.round(v * 10) / 10);
    if (typeof v === 'string') return v.length > 90 ? `${v.slice(0, 90)}…` : v;
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    if (Array.isArray(v)) {
      if (v.length && v.every((x) => x && typeof x === 'object')) {
        const first = v[0];
        const label = first?.name ?? first?.label ?? first?.time ?? first?.slot;
        return `${v.length} ${v.length === 1 ? 'entry' : 'entries'}${label ? ` · from ${label}` : ''}`;
      }
      return v.slice(0, 6).map((x) => String(x)).join(', ') + (v.length > 6 ? ', …' : '');
    }
    const vals = Object.values(v).filter((x) => x != null && typeof x !== 'object');
    return vals.length ? vals.slice(0, 4).join(', ') : '—';
  };
  for (const [k, v] of Object.entries(data)) {
    if (rows.length >= 6) break;
    if (v == null || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) continue;
    rows.push([humanKey(k), humanVal(v)]);
  }
  if (!rows.length && !title) return null;
  return { title, rows };
}

function fallbackNode(title, reason, d) {
  const rows = [];
  if (d && typeof d === 'object') {
    const humanKey = (k) => k.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
    for (const [k, v] of Object.entries(d).slice(0, 6)) {
      if (v == null) continue;
      rows.push([humanKey(k),
        typeof v === 'object' ? (Array.isArray(v) ? `${v.length} items` : '…') : String(v).slice(0, 90)]);
    }
  }
  return el('div.mu-fallback',
    title ? el('div.mu-title', null, title) : null,
    el('div.mu-fallback-head', null, icon('warn', 'mu-fallback-ico'), ` ${reason}`),
    rows.length
      ? el('div.mu-fallback-body', rows.map(([k, v]) =>
          el('div.mu-fallback-row', null, el('span', null, k), el('b', null, v))))
      : null
  );
}

/**
 * Progressive stream parser (v2) — feed text deltas, get events back.
 *
 * Events: {type:'text',text} · {type:'component',payload} ·
 *         {type:'fallback',raw,reason} · {type:'code',text}
 *
 * Hard rules this parser enforces:
 *  - ANY triple-backtick fence opens a block — never leaks to prose. The
 *    tag decides the mode: mausam-ui/mausam/json/ui/empty → UI payload;
 *    anything else (js, python…) → code block.
 *  - A fence split across network chunks never leaks (partial openers are
 *    held back; an opener without its tag line waits).
 *  - A fence that fails validation becomes a humanized fallback — the
 *    payload never surfaces as raw JSON.
 */
export function createStreamParser() {
  let buf = '';
  let mode = 'prose'; // 'prose' | 'tagwait' | 'fence' | 'code'

  const emitText = (t, out) => { if (t) out.push({ type: 'text', text: t }); };

  /** Decide the mode from a fence tag (first word of the opener line). */
  const modeForTag = (tag) => {
    const t = String(tag ?? '').trim().toLowerCase().split(/\s+/)[0] ?? '';
    return ['', FENCE, 'mausamui', 'mausam', 'json', 'ui', 'mu'].includes(t) ? 'fence' : 'code';
  };

  return {
    /** @returns {Array<{type:string, [k:string]:any}>} */
    push(delta) {
      buf += delta;
      const out = [];
      let guard = 0;
      while (guard++ < 128) {
        if (mode === 'prose') {
          const open = buf.indexOf('```');
          if (open < 0) {
            // Hold back a trailing partial opener ('`' or '``') so a fence
            // split across chunks never leaks as prose.
            let hold = 0;
            if (buf.endsWith('``')) hold = 2;
            else if (buf.endsWith('`')) hold = 1;
            const safe = hold ? buf.slice(0, buf.length - hold) : buf;
            emitText(safe, out);
            buf = buf.slice(safe.length);
            break;
          }
          emitText(buf.slice(0, open), out);
          buf = buf.slice(open + 3);
          mode = 'tagwait'; // opener consumed, waiting for the tag line
        } else if (mode === 'tagwait') {
          const nl = buf.indexOf('\n');
          if (nl < 0) {
            if (buf.length <= 64) break; // wait for the rest of the tag line
            // absurdly long tag line — treat the first token as the tag
            const tag = buf.split(/\s/, 1)[0] ?? '';
            buf = buf.slice(tag.length);
            mode = modeForTag(tag);
            continue;
          }
          const tag = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          mode = modeForTag(tag);
        } else {
          // fence or code: read until the closing ```
          const close = buf.indexOf('```');
          if (close < 0) break; // wait for the rest
          const raw = buf.slice(0, close);
          buf = buf.slice(close + 3);
          const wasCode = mode === 'code';
          mode = 'prose';
          if (wasCode) {
            out.push({ type: 'code', text: raw });
          } else {
            // Defensive: a tag echoed on its own first line inside the body
            // (```mausam-ui⏎mausam-ui⏎{…}) — drop it before parsing.
            let body = raw.trim();
            const firstNl = body.indexOf('\n');
            if (firstNl > 0) {
              const first = body.slice(0, firstNl).trim().toLowerCase();
              if (/^[a-z][a-z0-9-]{0,20}$/.test(first) && !first.startsWith('{') && !first.startsWith('"')) {
                body = body.slice(firstNl + 1).trim();
              }
            }
            const res = parseBlock(body);
            if (res.ok) out.push({ type: 'component', payload: res.payload });
            else out.push({ type: 'fallback', raw: body, reason: res.error });
          }
        }
      }
      return out;
    },
    /** Flush any unterminated content at end of stream. */
    end() {
      const out = [];
      if (mode === 'fence') {
        const raw = buf.trim();
        const res = parseBlock(raw);
        if (res.ok) out.push({ type: 'component', payload: res.payload });
        else out.push({ type: 'fallback', raw, reason: res.error });
      } else if (mode === 'code') {
        if (buf.trim()) out.push({ type: 'code', text: buf });
      } else if (mode === 'tagwait') {
        // stream ended right after an opener — truncated fence, drop silently
      } else {
        emitText(buf, out);
      }
      buf = '';
      mode = 'prose';
      return out;
    },
  };
}
