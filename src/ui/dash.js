/**
 * dash.js — the one, generous dashboard.
 *
 * Every user sees every section: places rail, current conditions (with a
 * vs-yesterday pill + share), 15-minute rain nowcast, 48h strip, temp
 * curve, 10-day outlook, details grid, CPCB air quality, sun times and
 * "Mausam Says" insights. The personal "For You" rail renders ON TOP
 * only when the user has filled the optional 30-second profile —
 * personalisation adds, it never removes or gates.
 */

import { el, clear } from '../utils/dom.js';
import { temp, wind, hourLabel, relativeTime, visibility } from '../utils/format.js';
import { compass } from '../api/wmo.js';
import { computeAlerts, computeInsights, computeForYou } from '../core/insights.js';
import { hero, sectionTitle, card, statTiles, kvList, hourlyStrip, weekGrid, simpleWeekCell, aqiPill, nowRow } from './shared.js';
import { renderPlaces } from './places.js';
import { store } from '../core/storage.js';

/** Transient toast (share copied, etc.). */
function toast(msg) {
  const t = el('div.mausam-toast', { role: 'status' }, msg);
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 350);
  }, 2200);
}

/** Rich text for insight strings (**bold**). */
function rich(text) {
  const frag = document.createDocumentFragment();
  String(text).split(/(\*\*[^*]+\*\*)/g).forEach((part, i) => {
    if (!part) return;
    frag.appendChild(i % 2 === 1 ? el('strong', null, part.slice(2, -2)) : document.createTextNode(part));
  });
  return frag;
}

function toneClass(tone) {
  return { good: 'insight-good', info: 'insight-info', warn: 'insight-warn', danger: 'insight-danger' }[tone] ?? 'insight-info';
}

/** 24h SVG temperature curve with rain bars underneath. */
function tempCurve(hours) {
  const W = 340, H = 120, PADX = 10, PADT = 16, PADB = 22;
  const temps = hours.map((h) => h.temperature_2m).filter((v) => v != null);
  if (temps.length < 4) return null;
  let min = Math.min(...temps), max = Math.max(...temps);
  if (max - min < 4) { const mid = (max + min) / 2; min = mid - 2; max = mid + 2; }
  const span = max - min;
  const n = hours.length;
  const x = (i) => PADX + (i * (W - PADX * 2)) / (n - 1);
  const y = (v) => PADT + (1 - (v - min) / span) * (H - PADT - PADB);
  const line = hours.map((h, i) => `${x(i).toFixed(1)},${y(h.temperature_2m).toFixed(1)}`).join(' ');
  const nowX = hours.findIndex((h) => h.time === hours[0].time);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'dash-curve');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Temperature curve for the next 24 hours');

  // night shading
  hours.forEach((h, i) => {
    if (h.night) {
      const shade = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      shade.setAttribute('x', x(i) - (W - PADX * 2) / (n - 1) / 2);
      shade.setAttribute('y', 0);
      shade.setAttribute('width', (W - PADX * 2) / (n - 1));
      shade.setAttribute('height', H - PADB);
      shade.setAttribute('fill', 'rgba(120,130,160,0.10)');
      svg.appendChild(shade);
    }
  });

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  grad.setAttribute('id', 'dashGrad');
  grad.setAttribute('x1', 0); grad.setAttribute('y1', 0); grad.setAttribute('x2', 0); grad.setAttribute('y2', 1);
  for (const [off, op] of [['0%', 0.30], ['100%', 0]]) {
    const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop.setAttribute('offset', off);
    stop.setAttribute('stop-color', 'var(--accent)');
    stop.setAttribute('stop-opacity', op);
    grad.appendChild(stop);
  }
  defs.appendChild(grad);
  svg.appendChild(defs);

  const area = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  area.setAttribute('points', `${PADX},${H - PADB} ${line} ${x(n - 1).toFixed(1)},${H - PADB}`);
  area.setAttribute('fill', 'url(#dashGrad)');
  svg.appendChild(area);

  const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  pl.setAttribute('points', line);
  pl.setAttribute('fill', 'none');
  pl.setAttribute('stroke', 'var(--accent)');
  pl.setAttribute('stroke-width', 2.4);
  pl.setAttribute('stroke-linejoin', 'round');
  pl.setAttribute('stroke-linecap', 'round');
  svg.appendChild(pl);

  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('cx', x(nowX)); dot.setAttribute('cy', y(hours[0].temperature_2m)); dot.setAttribute('r', 3.6);
  dot.setAttribute('fill', 'var(--accent)');
  svg.appendChild(dot);

  const tx = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  tx.setAttribute('x', x(nowX) + 6); tx.setAttribute('y', y(hours[0].temperature_2m) - 7);
  tx.setAttribute('class', 'curve-lbl');
  tx.textContent = temp(hours[0].temperature_2m);
  svg.appendChild(tx);

  // 3 x-labels + rain bars row rendered as flex HTML below
  const wrap = el('div.dash-curve-wrap', svg);
  const labels = el('div.dash-curve-labels',
    [0, Math.floor((n - 1) / 2), n - 1].map((i) => el('span', null, hourLabel(hours[i].time, 'h12')))
  );
  const rains = el('div.dash-curve-rains',
    hours.filter((_, i) => i % 3 === 0).map((h) => el('span', { class: (h.precipitation_probability ?? 0) >= 50 ? 'wet' : '' }, `💧${Math.round(h.precipitation_probability ?? 0)}%`))
  );
  wrap.appendChild(labels);
  wrap.appendChild(rains);
  return wrap;
}

/* ================================================================
   SHARE
================================================================ */

function shareWeather(s, units, loc) {
  const n = s.now;
  const today = s.days?.[0];
  const aqi = s.currentAqi;
  const lines = [
    `${loc?.name ?? 'Here'}: ${temp(n.temp, units, true)}, ${n.wx?.label ?? ''}`,
    today ? `High ${temp(today.temp_max, units)} / Low ${temp(today.temp_min, units)} · 💧 ${Math.round(today.precip_prob_max ?? 0)}% rain` : null,
    aqi?.aqi != null ? `Air quality: AQI ${aqi.aqi} (${aqi.category})` : null,
    '— via Mausam',
  ].filter(Boolean);
  const text = lines.join('\n');
  if (navigator.share) {
    navigator.share({ title: 'Weather — Mausam', text }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(text)
      .then(() => toast('Copied to clipboard ✓'))
      .catch(() => toast('Could not copy'));
  }
}

/* ================================================================
   NOWCAST — next 2 hours, 15-minute steps
================================================================ */

function nowcastCard(s, units) {
  const m = s.minutely;
  if (!m?.mm?.length) return null;
  const steps = m.mm.slice(0, 8);
  const total = steps.reduce((a, b) => a + (b ?? 0), 0);
  const firstWet = steps.findIndex((v) => (v ?? 0) > 0.03);
  const startLabel = new Date(m.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });

  const head = el('div.nowcast-head');
  let verdict;
  if (total < 0.1) {
    verdict = el('div.nowcast-verdict', null, '🌙 No rain expected in the next 2 hours');
  } else if (firstWet === 0) {
    verdict = el('div.nowcast-verdict.wet', null, `🌧 Rain around ${startLabel} — carry cover if stepping out`);
  } else {
    const at = new Date(new Date(m.start).getTime() + firstWet * 15 * 60000)
      .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
    verdict = el('div.nowcast-verdict', null, `⏳ Rain likely around ${at}`);
  }
  head.appendChild(verdict);

  const bars = el('div.nowcast-bars');
  const max = Math.max(...steps, 0.5);
  steps.forEach((v, i) => {
    const col = el('div.nowcast-col', { title: `${Math.round((v ?? 0) * 10) / 10} mm / 15 min` });
    const bar = el('div.nowcast-bar');
    bar.style.height = `${Math.max((v ?? 0) / max, 0.04) * 100}%`;
    if ((v ?? 0) > 0.03) bar.classList.add('wet');
    col.appendChild(bar);
    if (i % 2 === 0) {
      const lbl = new Date(new Date(m.start).getTime() + i * 15 * 60000)
        .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
      col.appendChild(el('span.nowcast-lbl', null, lbl));
    }
    bars.appendChild(col);
  });
  head.appendChild(bars);
  return card(head);
}

/* ================================================================
   MAIN RENDER
================================================================ */

export function renderDashboard(root, snapshot, units, ctx) {
  const s = snapshot;
  const loc = ctx.location;
  const you = store.you.get();

  clear(root);

  /* ---------- hero ---------- */
  const yd = s.yesterday?.deltaMax;
  const deltaPill = yd != null
    ? el('button.delta-pill', {
        type: 'button',
        title: `Yesterday's high was ${temp(s.yesterday.tempMax, units)}`,
        onclick: () => toast(`Today's high is ${Math.abs(Math.round(yd * 10) / 10)}° ${yd >= 0 ? 'warmer' : 'cooler'} than yesterday`)
      },
        el('span', { class: 'delta-arrow', 'aria-hidden': 'true' }, yd >= 0 ? '▲' : '▼'),
        `${Math.abs(Math.round(yd * 10) / 10)}° ${yd >= 0 ? 'warmer' : 'cooler'} than yesterday`)
    : null;
  const shareBtn = el('button.hero-share', {
    type: 'button', 'aria-label': 'Share this weather', title: 'Share this weather',
    onclick: () => shareWeather(s, units, loc),
  }, '↗');
  const heroCard = card(
    el('div.hero-now-top',
      el('div.hero-place', null, `📍 ${[loc?.name, loc?.admin1].filter(Boolean).join(', ')}`),
      el('div.hero-top-actions', deltaPill, el('span.updated-pill', { id: 'updated-pill', title: 'Data freshness' }, `Updated ${relativeTime(s.fetchedAt)}`), shareBtn)
    ),
    nowRow(s, units)
  );
  root.appendChild(el('div', { class: 'dash-hero' }, heroCard));

  /* ---------- your places rail ---------- */
  const placesMount = el('div.places-mount');
  root.appendChild(placesMount);
  renderPlaces(placesMount, {
    current: loc,
    units,
    onSelect: (p) => ctx.pickLocation?.(p),
    onAdd: () => ctx.openSearch?.(),
    onForget: (i) => {
      store.destinations.removeAt(i);
      ctx.rerender?.();
      toast('Place removed');
    },
  });

  /* ---------- alert ---------- */
  const alert = computeAlerts(s);
  if (alert) {
    root.appendChild(el(`div.alert.alert-${alert.kind}.dash-alert`, { role: 'alert' },
      el('div.alert-title', null, `${alert.icon} ${alert.title}`),
      el('div', null, alert.text)
    ));
  }

  /* ---------- rain nowcast (next 2h, 15-min steps) ---------- */
  const nowcast = nowcastCard(s, units);
  if (nowcast) {
    root.appendChild(sectionTitle('Rain nowcast · next 2 hours'));
    root.appendChild(nowcast);
  }

  /* ---------- For You (additive, only if personalised) ---------- */
  const forYou = computeForYou(s, you);
  if (forYou && forYou.cards.length) {
    root.appendChild(sectionTitle(`✨ For you${forYou.greeting ? `, ${forYou.greeting}` : ''}`));
    const rail = el('div.foryou-rail');
    for (const c of forYou.cards) {
      rail.appendChild(el(`div.card.foryou-card.${toneClass(c.tone)}`,
        el('div.foryou-head', el('span.foryou-icon', null, c.icon), el('span', null, c.title)),
        el('div.foryou-text', null, rich(c.text))
      ));
    }
    root.appendChild(rail);
  }

  /* ---------- hourly strip ---------- */
  root.appendChild(sectionTitle('Next 48 hours'));
  const h48 = s.hours.slice(0, 48);
  root.appendChild(hourlyStrip(h48, (h) => el('div.hour-card',
    el('div.h-time', null, hourLabel(h.time)),
    el('div.h-icon', null, h.wx?.icon ?? '·'),
    el('div.h-val', null, temp(h.temperature_2m)),
    el('div.h-sub', null, `${Math.round(h.precipitation_probability ?? 0)}%`)
  )));

  /* ---------- temp curve ---------- */
  const curve = tempCurve(h48.slice(0, 24));
  if (curve) {
    root.appendChild(sectionTitle('Temperature trend'));
    root.appendChild(card(curve));
  }

  /* ---------- 10-day ---------- */
  root.appendChild(sectionTitle('10-day outlook'));
  root.appendChild(weekGrid(s.days, (d, i) => simpleWeekCell(d, i, units)));

  /* ---------- Mausam Says ---------- */
  const insights = computeInsights(s);
  if (insights.length) {
    root.appendChild(sectionTitle('Mausam says'));
    const grid = el('div.insight-grid');
    for (const ins of insights) {
      grid.appendChild(el(`div.card.insight-card.${toneClass(ins.tone)}`,
        el('div.insight-head', el('span.insight-icon', null, ins.icon), el('span', null, ins.title)),
        el('div.insight-text', null, rich(ins.text))
      ));
    }
    root.appendChild(grid);
  }

  /* ---------- details grid ---------- */
  const n = s.now;
  root.appendChild(sectionTitle('Right now in detail'));
  root.appendChild(statTiles([
    [`${Math.round(n.humidity ?? 0)}%`, 'Humidity'],
    [wind(n.wind, units), `Wind ${n.wind_dir != null ? compass(n.wind_dir) : ''}`],
    [n.gusts != null ? wind(n.gusts, units) : '—', 'Gusts'],
    [`${n.uv != null ? Math.round(n.uv * 10) / 10 : '—'}`, `UV · ${n.uvLabel ?? ''}`],
    [visibility(n.visibility), 'Visibility'],
    [n.pressure != null ? `${Math.round(n.pressure)} hPa` : '—', 'Pressure'],
    [n.dew != null ? temp(n.dew) : '—', 'Dew point'],
    [`${n.cloud != null ? Math.round(n.cloud) : '—'}%`, 'Cloud cover'],
  ]));

  /* ---------- AQI + sun row ---------- */
  const aqi = s.currentAqi;
  const sun = s.sun;
  const row = el('div.row-2');

  const aqiCard = card(
    el('div.aqi-head', el('div.card-h', null, 'Air quality (CPCB)'), aqiPill(aqi)),
    aqi?.advice ? el('div.aqi-advice', null, aqi.advice) : null,
    aqi?.dominant ? el('div.aqi-dominant', null, `Dominant pollutant: ${aqi.dominant}`) : null
  );
  row.appendChild(aqiCard);

  const fmt = (iso) => (iso ? iso.slice(11, 16) : '—');
  const imd = s.bundle?.imd;
  const sunCard = card(
    el('div.card-h', null, 'Sun & moon' + (imd?.ok ? ' · IMD' : '')),
    kvList([
      ['🌅 Sunrise', fmt(sun?.sunrise)],
      ['🌇 Sunset', fmt(sun?.sunset)],
      ['⏳ Daylight', sun?.dayLength ?? '—'],
      ...(imd?.ok && imd.obs?.moonrise ? [['🌙 Moonrise', imd.obs.moonrise]] : []),
      ...(imd?.ok && imd.obs?.moonset ? [['🌙 Moonset', imd.obs.moonset]] : []),
    ])
  );
  row.appendChild(sunCard);
  root.appendChild(row);

  /* ---------- IMD enrichment (only when a key is set) ---------- */
  if (imd?.ok) {
    root.appendChild(sectionTitle('IMD official forecast'));
    root.appendChild(card(
      el('div.imd-note', null,
        `Station ${imd.station?.name ?? '—'} (${imd.station?.distanceKm ?? '—'} km away) · past 24h rain ${imd.obs?.rain24 ?? '—'} mm · RH ${imd.obs?.rh0830 ?? '—'}% / ${imd.obs?.rh1730 ?? '—'}%`
      ),
      el('div.imd-days', (imd.days ?? []).slice(0, 7).map((d) =>
        el('div.imd-day',
          el('div.imd-day-date', null, d.date?.slice(5) ?? '—'),
          el('div.imd-day-text', null, d.text || '—'),
          el('div.imd-day-temp', null, d.max != null ? `${Math.round(d.max)}° / ${d.min != null ? Math.round(d.min) + '°' : '—'}` : '—')
        )
      ))
    ));
  }

  /* ---------- personalisation nudge (dismissible, non-blocking) ---------- */
  if (!you && !store.flags.get('nudgeDismissed')) {
    root.appendChild(el('div.card.nudge-card',
      el('div.nudge-text',
        el('div.nudge-title', null, '✨ Make Mausam yours — 30 seconds'),
        el('div.nudge-sub', null, 'Add your name, commute times and favourite activities. Everything on this page stays; you just get personal tips on top. Stored on this device only — no account.')
      ),
      el('div.nudge-actions',
        el('button.btn.btn-primary', { onclick: () => ctx.openYou?.() }, 'Personalise'),
        el('button.btn', { onclick: () => { store.flags.set('nudgeDismissed', true); ctx.rerender?.(); } }, 'Not now')
      )
    ));
  }
}

/** Tiny helper used by main.js to refresh the "Updated…" pill. */
export function updateFreshness(snapshot) {
  const pill = document.getElementById('updated-pill');
  if (pill && snapshot) pill.textContent = `Updated ${relativeTime(snapshot.fetchedAt)}`;
}
