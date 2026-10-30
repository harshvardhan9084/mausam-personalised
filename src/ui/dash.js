/**
 * dash.js — the one, generous dashboard (v0.5).
 *
 * Every user sees every section: places rail, current conditions (with a
 * vs-yesterday pill + share + last-year delta), 15-minute rain nowcast,
 * "Your day" timeline (if the profile has a schedule), For You rail
 * (profile-driven, additive), 48h strip, temp curve, 10-day outlook,
 * details grid, upgraded CPCB AQI card, sun & moon, farm weather,
 * sea & coast, river watch and "Mausam Says". Personalisation adds on
 * top — it never removes or gates.
 */

import { el, clear } from '../utils/dom.js';
import { temp, wind, hourLabel, relativeTime, visibility, dateLabel, dayLabel } from '../utils/format.js';
import { compass, wxText } from '../api/wmo.js';
import {
  computeAlerts, computeInsights, computeForYou,
  computeDayTimeline, computeFarmCards, computeBestDays,
} from '../core/insights.js';
import { hero, sectionTitle, card, statTiles, kvList, hourlyStrip, weekGrid, simpleWeekCell, nowRow, skyBucket } from './shared.js';
import { icon, skyIcon, tipIcon } from './icons.js';
import { renderPlaces } from './places.js';
import { store } from '../core/storage.js';
import { pickName, pickAdmin1 } from '../core/placename.js';
import { getProfile } from '../core/profile.js';
import { t, getLang } from '../core/i18n.js';
import { aqiNeedsSeasonNotice, stationAqiUrl, aqiCat, aqiAdvice, aqiBandColor } from '../core/aqi-cpcb.js';

/** Clock-aware time-of-day formatter — every surface honors the Clock setting
 *  (12-hour default) instead of raw 24-hour ISO slices. (v0.8.16: the sun &
 *  moon card previously hardcoded iso.slice(11,16) and ignored the setting.) */
const fmtClock = (iso) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: store.clock.get() !== '24' }) : '—');

/** Atomic detail cell: bold label + nowrap value piece(s). Values arrive as a
 *  string (one atomic piece) or an array (pre-split atomic pieces that may
 *  wrap BETWEEN pieces, never inside one — "8 km/h ·" / "Gusts 19 km/h"
 *  instead of "Gusts 19" / "km/h"). (v0.8.16) */
const detailCell = (k, v) => el('span', null, el('b', null, k),
  ...(Array.isArray(v) ? v : [v]).map((x) => (typeof x === 'string' ? el('span.v', null, x) : x)));

/** Transient toast (share copied, etc.). */
function toast(msg) {
  const tEl = el('div.mausam-toast', { role: 'status' }, msg);
  document.body.appendChild(tEl);
  requestAnimationFrame(() => tEl.classList.add('show'));
  setTimeout(() => {
    tEl.classList.remove('show');
    setTimeout(() => tEl.remove(), 350);
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

/* ================================================================
   v0.8.34 — the sky clock. The Sun & moon card used to be three bare
   text rows: honest, but mute — the one card in the rail with no visual
   voice. The helpers below draw the day's arc (sun travelling between
   sunrise and sunset, moon taking the night shift) and compute the moon
   phase on-device from the synodic month — real astronomy, zero extra
   API calls, themeable through the same color tokens as every card.
================================================================ */

/** i18n key for the UV band word — same thresholds as uvLabel() in
 *  aqi-cpcb.js, but the WORD follows the reader's language on every
 *  dashboard surface (the engine's EN label stays for internals). */
const uvBandKey = (v) => v == null ? 'uv_mod' : v < 3 ? 'uv_low' : v < 6 ? 'uv_mod' : v < 8 ? 'uv_high' : v < 11 ? 'uv_vhigh' : 'uv_ext';

let saSeq = 0; // unique gradient ids per render

/** Moon phase 0..1 (0 = new moon). Synodic-month approximation anchored
 *  to the widely-cited reference new moon 2000-01-06 18:14 UTC; drift is
 *  well under a day for the decades that matter here. */
function moonPhaseFrac(now = new Date()) {
  const synodic = 29.530588853;
  const days = (now.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
  let p = (days % synodic) / synodic;
  if (p < 0) p += 1;
  return p;
}

/** i18n key for the 8 classical phase buckets. */
function phaseKey(p) {
  if (p < 0.034 || p > 0.966) return 'mp_new';
  if (p < 0.216) return 'mp_wax_cres';
  if (p < 0.284) return 'mp_first';
  if (p < 0.466) return 'mp_wax_gib';
  if (p < 0.534) return 'mp_full';
  if (p < 0.716) return 'mp_wan_gib';
  if (p < 0.784) return 'mp_last';
  return 'mp_wan_cres';
}

/** Little disc with the real terminator: dark base + lit shape built from
 *  one semicircle plus an elliptical terminator (rx shrinks as the lit
 *  fraction nears half). Waxing lights the right limb (northern sky). */
function moonDiscSvg(p) {
  const R = 10, cx = 12, cy = 12;
  const k = Math.cos(2 * Math.PI * p);
  const rx = Math.max(0.01, Math.abs(k) * R).toFixed(2);
  const waxing = p <= 0.5;
  const lit = waxing
    ? `M ${cx} ${cy - R} A ${R} ${R} 0 0 1 ${cx} ${cy + R} A ${rx} ${R} 0 0 ${k > 0 ? 0 : 1} ${cx} ${cy - R} Z`
    : `M ${cx} ${cy - R} A ${R} ${R} 0 0 0 ${cx} ${cy + R} A ${rx} ${R} 0 0 ${k > 0 ? 1 : 0} ${cx} ${cy - R} Z`;
  const tpl = document.createElement('template');
  tpl.innerHTML = `<svg class="moon-disc" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="${R}" class="moon-dark"/><path d="${lit}" class="moon-lit"/></svg>`;
  return tpl.content.firstElementChild;
}

/** Sky-calendar disc for the EXACT target phases (full = lit disc, new =
 *  dark disc) — the elliptical terminator is degenerate at p=0/0.5, so the
 *  calendar rows get dedicated unambiguous glyphs instead. */
function skyMoonDisc(cls) {
  const tpl = document.createElement('template');
  tpl.innerHTML = `<svg class="moon-disc" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" class="${cls}"/></svg>`;
  return tpl.content.firstElementChild;
}

/** Next occurrence of a target phase (0.5 = full, 0 = new) as a date ISO,
 *  from the same synodic model as moonPhaseFrac — the honest on-device
 *  sky calendar (Indian festival dates ride the lunar cycle). Returns
 *  whole days ahead; an event a few hours past still rolls to next month. */
function nextMoonISO(target, now = new Date()) {
  const synodic = 29.530588853;
  const p = moonPhaseFrac(now);
  const ahead = (((target - p) % 1) + 1) % 1 * synodic; // 0..29.53 days
  const d = new Date(now.getTime() + ahead * 86400000);
  // local-calendar date (the app renders every date in the reader's clock —
  // toISOString would give IST late evenings yesterday's UTC date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The day's arc: horizon, the sun/moon glyph at its honest position,
 *  dawn-to-dusk tint under the arc (night: dashed arc, dimmed fill).
 *  Positions are parametric along the drawn quadratic — a designed
 *  glance, not an ephemeris. Day/night follows the READER'S clock
 *  against this card's own sunrise/sunset rows — the app renders every
 *  place's times in the reader's clock, so the arc speaks the same
 *  language (a real single-place user's clock and is_day always agree).
 *  All strings are static; numbers come from the fetched forecast. */
function sunArcSvg(sun) {
  const X0 = 20, X1 = 280, YH = 100, CY = -76, MX = 150;
  const px = (tt) => (1 - tt) * (1 - tt) * X0 + 2 * (1 - tt) * tt * MX + tt * tt * X1;
  const py = (tt) => (1 - tt) * (1 - tt) * YH + 2 * (1 - tt) * tt * CY + tt * tt * YH;
  const mins = (iso) => (iso ? Number(String(iso).slice(11, 13)) * 60 + Number(String(iso).slice(14, 16)) : null);
  const sm = mins(sun?.sunrise), em = mins(sun?.sunset);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let tt = null, night = false;
  if (sm != null && em != null && em > sm) {
    if (nowMin >= sm && nowMin <= em) tt = (nowMin - sm) / (em - sm);
    else {
      night = true;
      const nightLen = 1440 - (em - sm);
      tt = nowMin < sm ? (nowMin + 1440 - em) / nightLen : (nowMin - em) / nightLen;
    }
  }
  const at = tt != null ? Math.min(1, Math.max(0, tt)) : null;
  const gx = at != null ? px(at) : 0, gy = at != null ? py(at) : 0;
  const rays = Array.from({ length: 8 }, (_, k2) => {
    const a = (k2 * Math.PI) / 4;
    return `<line x1="${(9.5 * Math.cos(a)).toFixed(2)}" y1="${(9.5 * Math.sin(a)).toFixed(2)}" x2="${(12.5 * Math.cos(a)).toFixed(2)}" y2="${(12.5 * Math.sin(a)).toFixed(2)}"/>`;
  }).join('');
  const glyph = at == null ? '' : night
    ? `<g transform="translate(${(gx - 7.7).toFixed(1)} ${(gy - 7.7).toFixed(1)}) scale(0.64)" class="sa-moon"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></g>`
    : `<g transform="translate(${gx.toFixed(1)} ${gy.toFixed(1)})" class="sa-sun"><circle r="7"/>${rays}</g>`;
  const gid = `sa-g${++saSeq}`;
  const tpl = document.createElement('template');
  tpl.innerHTML = `<svg viewBox="0 0 300 118" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:color-mix(in srgb, var(--yellow) 26%, transparent)"/>
      <stop offset="1" style="stop-color:color-mix(in srgb, var(--yellow) 4%, transparent)"/>
    </linearGradient></defs>
    <path class="sa-fill" d="M ${X0} ${YH} Q ${MX} ${CY} ${X1} ${YH} Z" fill="url(#${gid})"/>
    <path class="sa-arc" d="M ${X0} ${YH} Q ${MX} ${CY} ${X1} ${YH}"/>
    <line class="sa-horizon" x1="14" y1="${YH}" x2="286" y2="${YH}"/>
    <circle class="sa-end" cx="${X0}" cy="${YH}" r="2.5"/><circle class="sa-end" cx="${X1}" cy="${YH}" r="2.5"/>
    ${glyph}
  </svg>`;
  const wrap = el('div.sun-arc' + (night ? '.night' : ''), {
    role: 'img',
    'aria-label': `${t('sunrise')} ${fmtClock(sun?.sunrise)} · ${t('sunset')} ${fmtClock(sun?.sunset)}`,
  });
  wrap.appendChild(tpl.content.firstElementChild);
  return wrap;
}

function toneClass(tone) {
  return { good: 'insight-good', info: 'insight-info', warn: 'insight-warn', danger: 'insight-danger' }[tone] ?? 'insight-info';
}

/** Advice-card icon: stroke glyph from the tip language when the key
 *  resolves, else the legacy emoji text — never a broken empty chip. */
function tipContent(key) {
  return tipIcon(key) ?? document.createTextNode(String(key ?? ''));
}

/** Alert icon: same fallback rule, inline sizing (no chip on banners). */
function alertIcon(key) {
  return tipIcon(key, 'alert-ico tip-svg') ?? document.createTextNode(String(key ?? ''));
}

/** rain amount formatting (mm, with inch conversion under imperial) */
function rainMm(mm, units) {
  if (mm == null) return '—';
  if (units === 'imperial') {
    const inch = mm / 25.4;
    return `${inch.toFixed(inch < 0.3 ? 2 : 1)} in`;
  }
  return `${Math.round(mm * 10) / 10} mm`;
}

/** 24h SVG temperature curve with rain bars underneath. */
function tempCurve(hours) {
  /* v0.8.16: viewBox width tracks the container so the curve keeps a ~210px
   * height identity at every frame width — mobile 340 (unchanged), the 940px
   * desktop frame gets 560 instead of stretching 340 into a 310px-tall band. */
  const cwNow = document.getElementById('home-scroll')?.clientWidth ?? 0;
  const W = Math.min(560, Math.max(340, Math.round((cwNow || 732) * 120 / 210))), H = 120, PADX = 10, PADT = 16, PADB = 22;
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

  const wrap = el('div.dash-curve-wrap', svg);
  const labels = el('div.dash-curve-labels',
    [0, Math.floor((n - 1) / 2), n - 1].map((i) => el('span', null, hourLabel(hours[i].time, store.clock.get() === '24' ? 'h24' : 'h12'))),
  );
  const rains = el('div.dash-curve-rains',
    hours.filter((_, i) => i % 3 === 0).map((h) => el('span', { class: (h.precipitation_probability ?? 0) >= 50 ? 'wet' : '' }, icon('droplet', 'curve-drop'), `${Math.round(h.precipitation_probability ?? 0)}%`)),
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
  const locale = dateLocale();
  const lines = [
    `${loc ? pickName(loc) : 'Here'}: ${temp(n.temp, units, true)}, ${wxText(n.wx, getLang())}`,
    today ? `H ${temp(today.temp_max, units)} / L ${temp(today.temp_min, units)} · ${Math.round(today.precip_prob_max ?? 0)}% rain` : null,
    aqi?.aqi != null ? `AQI ${aqi.aqi} est. (${aqiCat(aqi.aqi, getLang())})` : null,
    '— Mausam',
  ].filter(Boolean);
  const text = lines.join('\n');
  if (navigator.share) {
    navigator.share({ title: 'Weather — Mausam', text }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(text)
      .then(() => toast(t('copied')))
      .catch(() => toast(t('copy_fail')));
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
  const startLabel = fmtClock(m.start);

  const head = el('div.nowcast-head');
  let verdict;
  if (total < 0.1) {
    verdict = el('div.nowcast-verdict', null, icon('moon', 'verdict-ico'), t('nowcast_dry'));
  } else if (firstWet === 0) {
    verdict = el('div.nowcast-verdict.wet', null, icon('umbrella', 'verdict-ico'), t('nowcast_wet', { t: startLabel }));
  } else {
    const at = fmtClock(new Date(new Date(m.start).getTime() + firstWet * 15 * 60000));
    verdict = el('div.nowcast-verdict', null, icon('umbrella', 'verdict-ico'), t('nowcast_soon', { t: at }));
  }
  head.appendChild(verdict);

  /* all-dry: render an intentional flat state instead of near-zero bars
     that read as a broken empty chart (v0.8) */
  if (total < 0.1) {
    head.appendChild(el('div.nowcast-dry', null,
      el('span.nowcast-dash', { 'aria-hidden': 'true' }),
      el('span', null, `0 mm · 2 h`),
    ));
    return card(head);
  }

  const bars = el('div.nowcast-bars');
  const max = Math.max(...steps, 0.5);
  steps.forEach((v, i) => {
    const col = el('div.nowcast-col', { title: `${Math.round((v ?? 0) * 10) / 10} mm / 15 min` });
    const bar = el('div.nowcast-bar');
    bar.style.height = `${Math.max((v ?? 0) / max, 0.04) * 100}%`;
    if ((v ?? 0) > 0.03) bar.classList.add('wet');
    col.appendChild(bar);
    if (i % 2 === 0) {
      col.appendChild(el('span.nowcast-lbl', null, fmtClock(new Date(new Date(m.start).getTime() + i * 15 * 60000))));
    }
    bars.appendChild(col);
  });
  head.appendChild(bars);
  return card(head);
}

/* ================================================================
   AQI CARD v3 — dial, advice, dust, 24h mini trend (v0.8.10)
================================================================ */

/** Semicircular CPCB gauge — absolute 0–500 scale, arc in the category
 *  colour, rounded caps. Pure SVG, one draw-in transition (off under
 *  reduced motion). The number + category render as HTML beside/over it
 *  so font rendering and i18n stay crisp. */
function aqiDialSvg(aqi) {
  const val = Math.max(0, Math.min(500, aqi?.aqi ?? 0));
  const R = 52, CX = 70, CY = 62;
  const half = Math.PI * R;
  const dash = (val / 500) * half;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 140 76');
  svg.setAttribute('aria-hidden', 'true');
  const arc = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;
  const track = document.createElementNS(NS, 'path');
  track.setAttribute('d', arc);
  track.setAttribute('class', 'aqi-dial-track');
  svg.appendChild(track);
  const value = document.createElementNS(NS, 'path');
  value.setAttribute('d', arc);
  value.setAttribute('class', 'aqi-dial-arc');
  /* v0.8.22 — inline style, not setAttribute('stroke'): band colors are now
     CSS custom properties, and var() doesn't resolve inside SVG presentation
     attributes (the 'Unknown' fallback silently rendered no arc at all). */
  value.style.stroke = aqi?.color ?? 'var(--aqi-u)';
  value.setAttribute('stroke-dasharray', `${dash.toFixed(1)} ${half.toFixed(1)}`);
  svg.appendChild(value);
  /* draw-in: start empty, fill to value on the next frame */
  try {
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches && dash > 0) {
      const target = `${dash.toFixed(1)} ${half.toFixed(1)}`;
      value.setAttribute('stroke-dasharray', `0 ${half.toFixed(1)}`);
      requestAnimationFrame(() => requestAnimationFrame(() => value.setAttribute('stroke-dasharray', target)));
    }
  } catch { /* matchMedia unavailable — render final state */ }
  return svg;
}

function aqiCardV2(s, loc = null) {
  const aqi = s.currentAqi;
  const nowAir = s.hours[0]?.air ?? {};
  const trend = s.hours.slice(0, 48).filter((h) => h.aqi != null);
  /* v0.8.24: the title no longer claims the source — "(CPCB)" read as
     official station data while the number is a CAMS model estimate.
     The scale + estimation method now live on a visible tag, and during
     the pollution season a designed notice says how far the model can
     sit below the real stations (and links to them). */
  const head = el('div.aqi-head',
    el('div.card-h', null, t('sec_aqi')),
    el('span.aqi-src-tag', { 'aria-label': t('aqi_model_tag') }, t('aqi_model_tag')),
  );

  const cardBody = card(head);

  /* pollutant chips */
  const chips = [];
  if (nowAir.pm2_5 != null) chips.push(['PM2.5', `${Math.round(nowAir.pm2_5)}`]);
  if (nowAir.pm10 != null) chips.push(['PM10', `${Math.round(nowAir.pm10)}`]);
  if (nowAir.dust != null && nowAir.dust >= 5) chips.push(['Dust', `${Math.round(nowAir.dust)}`]);
  if (nowAir.ozone != null) chips.push(['O₃', `${Math.round(nowAir.ozone)}`]);

  /* dial row (v0.8.10): the CPCB number gets a real face — gauge left,
     advice + chips anchored to its right, instead of a lone pill. */
  const dial = el('div.aqi-dial', {
    role: 'img',
    'aria-label': aqi?.aqi != null ? `AQI ${aqi.aqi} · ${aqiCat(aqi.aqi, getLang())}` : t('aqi_unavail'),
  });
  if (aqi?.aqi != null) {
    const wrap = el('div.aqi-dial-svgwrap', aqiDialSvg(aqi));
    wrap.appendChild(el('div.aqi-dial-num', null, String(aqi.aqi)));
    dial.appendChild(wrap);
    dial.appendChild(el('div.aqi-dial-cat', { style: { color: aqi.color } }, aqiCat(aqi.aqi, getLang())));
  } else {
    dial.classList.add('empty');
    dial.appendChild(el('div.aqi-dial-none', null, t('aqi_unavail')));
  }
  cardBody.appendChild(el('div.aqi-top', dial,
    el('div.aqi-side',
      aqi?.aqi != null && aqiAdvice(aqi.aqi, getLang()) ? el('div.aqi-advice', null, aqiAdvice(aqi.aqi, getLang())) : null,
      chips.length ? el('div.aqi-chips',
        chips.map(([k, v]) => el('span.aqi-chip', null, el('b', null, v), ` ${k}`))) : null,
    ),
  ));

  /* 48h CPCB outlook — absolute 0–500 scale. (The old window-max
     normalisation made Severe days look flat-full and Good days look
     dramatic; on a fixed scale bar heights mean the same every day.)
     Hour labels every 8 bars + worst/best verdict for outdoor planning.
     Data is already on every hour — zero extra API calls. */
  if (trend.length >= 6) {
    const n = trend.length;
    const clock = store.clock.get() === '24' ? 'h24' : 'h12';
    /* Tappable AQI bars — title tooltips never show on touch screens, so a
       tap opens the hour's AQI + pollutant values under the strip (same
       expand pattern as the 48h weather strip and 10-day list). All fields
       already sit on the hour object — zero extra API calls. */
    let openBar = null;
    const aqiDetail = el('div.hour-detail', { id: 'aqi-hour-detail', role: 'region', 'aria-label': t('sec_aqi') });
    const bars = el('div.aqi-trend');
    const labels = el('div.aqi-trend-labels');
    trend.forEach((h, i) => {
      const bar = el('button.aqi-trend-bar', {
        type: 'button',
        title: `${hourLabel(h.time, clock)} · AQI ${h.aqi} · ${aqiCat(h.aqi ?? h.aqiFull?.aqi, getLang())}`,
        'aria-expanded': 'false',
        'aria-controls': 'aqi-hour-detail',
        onclick: () => {
          const wasOpen = openBar === bar;
          if (openBar) openBar.setAttribute('aria-expanded', 'false');
          openBar = wasOpen ? null : bar;
          bar.setAttribute('aria-expanded', String(!wasOpen));
          aqiDetail.classList.toggle('open', !wasOpen);
          if (wasOpen) aqiDetail.replaceChildren();
          else {
            const air = h.air ?? {};
            aqiDetail.replaceChildren(el('div.ten-detail-grid', [
              ['AQI', `${h.aqi} · ${aqiCat(h.aqi ?? h.aqiFull?.aqi, getLang())}`],
              ['PM2.5', air.pm2_5 != null ? `${Math.round(air.pm2_5)}` : '—'],
              ['PM10', air.pm10 != null ? `${Math.round(air.pm10)}` : '—'],
              ...(air.ozone != null ? [['O₃', `${Math.round(air.ozone)}`]] : []),
              ...(air.dust != null && air.dust >= 5 ? [['Dust', `${Math.round(air.dust)}`]] : []),
              ...(h.aqiFull?.dominant ? [[t('aqi_dominant'), h.aqiFull.dominant]] : []),
            ].map(([k, v]) => detailCell(k, v))));
          }
        },
      });
      bar.style.height = `${Math.max(3, Math.min(100, (h.aqi / 500) * 100))}%`;
      bar.style.background = h.aqiFull?.color ?? 'var(--aqi-u)';
      bars.appendChild(bar);
      if (i % 8 === 0) {
        const lab = el('span', null, hourLabel(h.time, clock));
        lab.style.left = `${((i + 0.5) / n) * 100}%`;
        labels.appendChild(lab);
      }
    });
    const wrap = el('div.aqi-trend-wrap',
      el('div.aqi-trend-h', null, t('aqi_outlook_h')), bars, labels);
    const worst = trend.reduce((a, b) => (b.aqi > a.aqi ? b : a));
    const best = trend.reduce((a, b) => (b.aqi < a.aqi ? b : a));
    if (best.aqi < worst.aqi - 15) {
      wrap.appendChild(el('div.aqi-outlook',
        el('span', null, `${t('aqi_worst', { t: hourLabel(worst.time, clock), a: worst.aqi })}`),
        ' · ',
        el('span', null, `${t('aqi_best', { t: hourLabel(best.time, clock), a: best.aqi })}`),
      ));
    }
    wrap.appendChild(aqiDetail);
    cardBody.appendChild(wrap);
  }
  if (aqi?.dominant) cardBody.appendChild(el('div.aqi-dominant', null, `${t('aqi_dominant')}: ${aqi.dominant}`));

  /* v0.8.24 pollution-season honesty: a low model number in the Oct–Feb
     haze belt is the one case where this card could genuinely mislead —
     say so, in the card, with a one-tap path to real station readings. */
  if (aqiNeedsSeasonNotice(aqi?.aqi, loc?.lat, loc?.lon)) {
    cardBody.appendChild(el('div.aqi-est-note', { role: 'note' },
      icon('warn', 'aqi-est-ico'),
      el('div.aqi-est-body',
        el('b', null, t('aqi_est_note_title')),
        el('span', null, t('aqi_est_note_body')),
        el('a.aqi-est-link', {
          href: stationAqiUrl(loc?.name), target: '_blank', rel: 'noopener noreferrer',
        }, t('aqi_est_link')),
      ),
    ));
  }
  return cardBody;
}

/* ================================================================
   DAY TIMELINE
================================================================ */

function dayTimelineCard(rows) {
  return card(el('div.day-tl',
    rows.map((r) => el('div.day-tl-row', { class: r.cls },
      el('span.day-tl-icon', null, tipIcon(r.icon, 'tl-ico') ?? document.createTextNode(String(r.icon ?? ''))),
      el('span.day-tl-label', null, r.label),
      el('span.day-tl-time', null, r.time),
      el('span.day-tl-wx', null, r.icon2),
      el('span.day-tl-temp', null, r.temp),
      el('span.day-tl-pop', null, icon('droplet', 'tl-drop'), `${r.pop}%`),
    )),
  ));
}

/** Shared cold→warm ramp (v0.8.20): sample the live theme's --sky/--orange
 *  so a range fill's colour at each end IS that temperature on one shared
 *  scale — identical meaning in every row and in the legend under the list.
 *  Fixes the "irregular progress bar" reading: the bar never was progress,
 *  it is a min→max range, and now it also looks like one. */
function tempRamp() {
  try {
    /* sample from body — theme overrides live on [data-theme] (body),
       documentElement would only ever see the :root dark defaults */
    const cs = getComputedStyle(document.body);
    const read = (n, fb) => (cs.getPropertyValue(n) || fb).trim();
    return [read('--sky', '#6ab0e8'), read('--orange', '#f7874f')];
  } catch {
    return ['#6ab0e8', '#f7874f'];
  }
}

function mixHex(a, b, t) {
  const pa = a.replace('#', ''), pb = b.replace('#', '');
  const c = (p, i) => parseInt(p.slice(i, i + 2), 16) || 0;
  const ch = (i) => Math.round(c(pa, i) + (c(pb, i) - c(pa, i)) * t);
  return `rgb(${ch(0)}, ${ch(2)}, ${ch(4)})`;
}

const rampAt = (ramp, gMin, span, v) =>
  mixHex(ramp[0], ramp[1], Math.max(0, Math.min(1, (v - gMin) / span)));

/** Per-day sparkline for the expanded 10-day row (v0.8.20). The bundle
 *  carries 48 h of hourly rows from "now", so today and tomorrow draw a
 *  real temperature curve + rain bars; later days get the designed
 *  "unlocks closer to the day" absence instead of an empty chart. */
function daySpark(day, dayHours) {
  const W = 320, H = 74, PADX = 10, PADT = 16;
  const FLOOR = H - 22; // curve floor; rain bars live in the lane below
  const n = dayHours.length;
  const temps = dayHours.map((h) => h.temperature_2m).filter((v) => v != null);
  if (n < 2 || temps.length < 2) return null;
  const lo = Math.min(...temps), hi = Math.max(...temps);
  const spanY = Math.max(hi - lo, 1);
  const step = (W - PADX * 2) / (n - 1);
  const x = (i) => PADX + i * step;
  const y = (v) => PADT + (1 - (v - lo) / spanY) * (FLOOR - PADT);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'ten-spark');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', t('ten_spark_aria', { d: day.label ?? day.date ?? '' }));
  const gradId = `tenSparkGrad-${day.date ?? n}`;

  const defs = document.createElementNS(NS, 'defs');
  const grad = document.createElementNS(NS, 'linearGradient');
  grad.setAttribute('id', gradId);
  grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0'); grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
  for (const [off, op] of [['0%', 0.2], ['100%', 0]]) {
    const stop = document.createElementNS(NS, 'stop');
    stop.setAttribute('offset', off);
    stop.setAttribute('stop-color', 'var(--accent)');
    stop.setAttribute('stop-opacity', op);
    grad.appendChild(stop);
  }
  defs.appendChild(grad);
  svg.appendChild(defs);

  // night shading behind the curve
  dayHours.forEach((h, i) => {
    if (h.night) {
      const shade = document.createElementNS(NS, 'rect');
      shade.setAttribute('x', (x(i) - step / 2).toFixed(1));
      shade.setAttribute('y', 0);
      shade.setAttribute('width', Math.max(step, 2).toFixed(1));
      shade.setAttribute('height', FLOOR);
      shade.setAttribute('fill', 'rgba(120,130,160,0.10)');
      svg.appendChild(shade);
    }
  });

  const line = dayHours.map((h, i) => `${x(i).toFixed(1)},${y(h.temperature_2m).toFixed(1)}`).join(' ');
  const area = document.createElementNS(NS, 'polygon');
  area.setAttribute('points', `${PADX},${FLOOR} ${line} ${(PADX + (n - 1) * step).toFixed(1)},${FLOOR}`);
  area.setAttribute('fill', `url(#${gradId})`);
  svg.appendChild(area);
  const pl = document.createElementNS(NS, 'polyline');
  pl.setAttribute('points', line);
  pl.setAttribute('fill', 'none');
  pl.setAttribute('stroke', 'var(--accent)');
  pl.setAttribute('stroke-width', 2);
  pl.setAttribute('stroke-linejoin', 'round');
  pl.setAttribute('stroke-linecap', 'round');
  svg.appendChild(pl);

  // hottest / coldest markers with their values — the sparkline's only text
  const hiIdx = dayHours.findIndex((h) => h.temperature_2m === hi);
  const loIdx = dayHours.findIndex((h) => h.temperature_2m === lo);
  for (const [idx, v, cls, dy] of [[hiIdx, hi, 'hi', -6], [loIdx, lo, 'lo', 12]]) {
    if (idx < 0) continue;
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', x(idx).toFixed(1));
    dot.setAttribute('cy', y(v).toFixed(1));
    dot.setAttribute('r', 2.6);
    dot.setAttribute('class', `ten-spark-dot ${cls}`);
    svg.appendChild(dot);
    const tx = document.createElementNS(NS, 'text');
    tx.setAttribute('x', Math.min(Math.max(x(idx), 14), W - 16).toFixed(1));
    tx.setAttribute('y', (y(v) + dy).toFixed(1));
    tx.setAttribute('text-anchor', 'middle');
    tx.setAttribute('class', `ten-spark-lbl ${cls}`);
    tx.textContent = `${Math.round(v)}°`;
    svg.appendChild(tx);
  }

  // rain chance bars in the bottom lane — same droplet language as the hero
  dayHours.forEach((h, i) => {
    const p = h.precipitation_probability ?? 0;
    if (p < 10) return;
    const bh = Math.max((p / 100) * 12, 2);
    const bar = document.createElementNS(NS, 'rect');
    bar.setAttribute('x', (x(i) - Math.min(step * 0.32, 3)).toFixed(1));
    bar.setAttribute('y', (H - 2 - bh).toFixed(1));
    bar.setAttribute('width', Math.min(step * 0.64, 6).toFixed(1));
    bar.setAttribute('height', bh.toFixed(1));
    bar.setAttribute('rx', 1.5);
    bar.setAttribute('fill', 'var(--sky)');
    bar.setAttribute('opacity', p >= 50 ? 0.95 : 0.45);
    svg.appendChild(bar);
  });

  return el('div.ten-spark-wrap', svg);
}

/** 10-day list: day | icon | pop | temp range bar on the period's shared
 *  scale — the fill is coloured by one cold→warm ramp sampled at the day's
 *  absolute min/max, with the scale named by a legend under the list and a
 *  "now" tick on today's row (v0.8.20). Rows expand into a per-day detail
 *  panel: hourly sparkline while the 48 h horizon covers the day, then the
 *  grid (feels, rain, wind, UV, sun). Data is already in the bundle — zero
 *  extra API calls. */
function tenDayList(s, units, bd) {
  const days = (s.days ?? []).slice(0, 10);
  if (!days.length) return null;
  const mins = days.map((d) => d.temp_min).filter((v) => v != null);
  const maxs = days.map((d) => d.temp_max).filter((v) => v != null);
  const gMin = Math.min(...mins, ...maxs);
  const gMax = Math.max(...mins, ...maxs);
  const span = Math.max(gMax - gMin, 1);
  const ramp = tempRamp();
  const list = el('div.ten-list', { role: 'list', 'aria-label': t('sec_10day') });

  days.forEach((d, i) => {
    const lo = d.temp_min ?? gMin;
    const hi = d.temp_max ?? gMax;
    const left = ((lo - gMin) / span) * 100;
    const width = Math.max(((hi - lo) / span) * 100, 6);
    const fillStyle = { marginLeft: `${left.toFixed(1)}%`, width: `${width.toFixed(1)}%` };
    try {
      fillStyle.background = `linear-gradient(90deg, ${rampAt(ramp, gMin, span, lo)}, ${rampAt(ramp, gMin, span, hi)})`;
    } catch { /* CSS fallback gradient stays */ }
    const bar = el('div.ten-track', { 'aria-hidden': 'true' }, el('div.ten-fill', { style: fillStyle }));
    if (i === 0 && s.now?.temp != null) {
      const nowPct = Math.max(0, Math.min(100, ((s.now.temp - gMin) / span) * 100));
      const nowTick = el('div.ten-now');
      nowTick.style.left = `calc(${nowPct.toFixed(1)}% - 1px)`;
      bar.appendChild(nowTick);
    }
    const detailId = `ten-detail-${i}`;
    const star = bd && bd.best && d.date === bd.best.date;
    const dayHours = (s.hours ?? []).filter((h) => h.time.slice(0, 10) === d.date);
    const spark = daySpark(d, dayHours);
    const detail = el('div.ten-detail', { id: detailId, role: 'region', 'aria-label': `${d.label ?? ''} ${d.date}` },
      spark,
      !spark && i > 0 ? el('div.ten-hourly-na', null, t('ten_hourly_na')) : null,
      el('div.ten-detail-grid', [
        [el('span.tlbl', icon('thermo', 'kv-ico ico-mut'), t('day_feels')), d.feels_max != null ? temp(d.feels_max, units) : '—'],
        [el('span.tlbl', icon('droplet', 'kv-ico ico-sky'), t('rain_simple')), `${Math.round(d.precip_prob_max ?? 0)}% · ${rainMm(d.precipitation_sum, units)}`],
        [el('span.tlbl', icon('wind', 'kv-ico ico-mut'), t('wind')),
          d.gusts_max != null
            ? [`${d.wind_max != null ? wind(d.wind_max, units) : '—'} ·`, `${t('gusts')} ${wind(d.gusts_max, units)}`]
            : (d.wind_max != null ? wind(d.wind_max, units) : '—')],
        [el('span.tlbl', icon('sun', 'kv-ico ico-sun'), t('uv')), d.uv_max != null ? `${Math.round(d.uv_max * 10) / 10}` : '—'],
        [el('span.tlbl', icon('sunrise', 'kv-ico ico-sun'), t('sunrise')), fmtClock(d.sunrise)],
        [el('span.tlbl', icon('sunset', 'kv-ico ico-dusk'), t('sunset')), fmtClock(d.sunset)],
      ].map(([k, v]) => detailCell(k, v))),
    );
    const row = el('button.ten-row', {
      type: 'button',
      'aria-expanded': 'false',
      'aria-controls': detailId,
      onclick: () => {
        const open = wrap.classList.toggle('expanded');
        row.setAttribute('aria-expanded', String(open));
      },
    },
      el('span.ten-day', null, star ? icon('star', 'ten-star') : null, i === 0 ? t('today') : dayLabel(d.date, i)),
      el('span.ten-icon', null, d.weather_code != null ? skyIcon(skyBucket(d.weather_code, true), 'wx-ico') : (d.wx?.icon ?? '·')),
      el('span.ten-pop', { class: (d.precip_prob_max ?? 0) >= 50 ? 'wet' : '', title: t('rain_simple') }, `${Math.round(d.precip_prob_max ?? 0)}%`),
      bar,
      el('span.ten-vals', null,
        el('b', null, temp(hi, units)),
        el('span', null, temp(lo, units))),
      icon('chevron', 'ten-chev'),
    );
    if (star) row.setAttribute('title', `${t('sec_bestday')} · ${d.label ?? ''}`);
    const wrap = el('div.ten-row-wrap', {
      role: 'listitem',
      class: [i === 0 ? 'today' : '', spark ? 'has-spark' : ''].filter(Boolean).join(' '),
    }, row, detail);
    list.appendChild(wrap);
  });

  /* legend: names the scale every range bar sits on — the axis the old
     design never showed, which is why the bars read as random progress */
  const legend = el('div.ten-legend', { 'aria-hidden': 'true' },
    el('span.ten-legend-val', null, temp(gMin, units)),
    el('span.ten-legend-ramp', { style: { background: `linear-gradient(90deg, ${ramp[0]}, ${ramp[1]})` } }),
    el('span.ten-legend-val', null, temp(gMax, units)),
    el('span.ten-legend-cap', null, t('ten_legend')),
  );
  return el('div.ten-box', list, legend);
}

/* ================================================================
   MAIN RENDER
================================================================ */

/* v0.8.29 — desktop two-column dashboard building blocks.
   Every [section title + content] pair is wrapped in ONE <section.dash-sec>.
   Mobile keeps `display: contents` (the flow is pixel-identical to the old
   flat render); from 640px up #page-home becomes a grid and the sections
   become real items: dc-m = main data column, dc-s = personal/insight side
   column, dc-f = full-width surfaces (hero, places, alerts, rare extras). */
const dsec = (cls, ...kids) => el('section', { class: `dash-sec ${cls}` }, ...kids);

export function renderDashboard(root, snapshot, units, ctx) {
  const s = snapshot;
  const loc = ctx.location;
  const profile = getProfile();

  clear(root);
  /* v0.8.31 — the rail's granularity adapts to its load: with a profile the
     side column is rich (your-day, for-you, farm) and the Mausam-says block
     stays one grouped section; without one the rail is thin, so the says
     cards pack as independent items (CSS keys off .has-prof). */
  root.classList.toggle('has-prof', !!profile);

  /* ---------- hero ---------- */
  const yd = s.yesterday?.deltaMax;
  const deltaPill = yd != null
    ? el('button.delta-pill', {
        type: 'button',
        title: `Yesterday's high was ${temp(s.yesterday.tempMax, units)}`,
        onclick: () => toast(`${Math.abs(Math.round(yd * 10) / 10)}° ${yd >= 0 ? t('warmer_than_yesterday') : t('cooler_than_yesterday')}`),
      },
        el('span', { class: 'delta-arrow', 'aria-hidden': 'true' }, yd >= 0 ? '▲' : '▼'),
        `${Math.abs(Math.round(yd * 10) / 10)}° ${yd >= 0 ? t('warmer_than_yesterday') : t('cooler_than_yesterday')}`)
    : null;
  const climate = s.extras?.climate;
  const climatePill = climate?.lastYearAvgMaxC != null && s.days?.[0]?.temp_max != null
    ? el('button.delta-pill.climate-pill', {
        type: 'button',
        onclick: () => toast(`Last year this week averaged ${Math.round(climate.lastYearAvgMaxC)}° — ${t('vs_last_year')}`),
      },
        icon('calendar', 'pill-ico'),
        `${t('vs_last_year')}: ${s.days[0].temp_max >= climate.lastYearAvgMaxC ? '+' : '−'}${Math.abs(Math.round((s.days[0].temp_max - climate.lastYearAvgMaxC) * 10) / 10)}°`)
    : null;
  const shareBtn = el('button.hero-share', {
    type: 'button', 'aria-label': t('share'), title: t('share'),
    onclick: () => shareWeather(s, units, loc),
  }, icon('share'));
  const heroCard = card(
    el('div.sky-deco', { 'aria-hidden': 'true' }),
    el('div.hero-now-top',
      el('div.hero-place', null, `${[pickName(loc), pickAdmin1(loc)].filter(Boolean).join(', ')}`),
      shareBtn, // direct child: mobile grid places it beside the name, desktop flows it after the pills
      el('div.hero-top-actions', deltaPill, climatePill, el('span.updated-pill', { id: 'updated-pill', title: 'Data freshness' }, `${t('updated')} ${relativeTime(s.fetchedAt)}`)),
    ),
    nowRow(s, units),
    (s.days?.[0]?.temp_max != null || s.days?.[0]?.temp_min != null)
      ? el('div.hero-hl', null,
          el('span', null, `H: ${s.days[0].temp_max != null ? temp(s.days[0].temp_max, units) : '—'}`),
          el('span', null, `L: ${s.days[0].temp_min != null ? temp(s.days[0].temp_min, units) : '—'}`))
      : null,
  );
  heroCard.classList.add('sky');
  heroCard.setAttribute('data-sky', skyBucket(s.now?.weather_code, s.now?.is_day));
  root.appendChild(el('div', { class: 'dash-hero' }, heroCard));

  /* ---------- your places — labelled, one composed bar (v0.8.19) ----------
     The last unlabelled home section joins the uppercase micro-label voice,
     and the two fragment rows (chips strip, Compare/Journey tools) render
     into one .home-placebar so desktop can compose them as a single row
     (chips left, tools anchored right). Mobile keeps the stacked flow. */
  if (loc || store.destinations.get().length) {
    root.appendChild(sectionTitle(t('sec_places')));
    const placesMount = el('div.places-mount');
    const placebar = el('div.home-placebar', null, placesMount);
    if (ctx.openCompare || ctx.openJourney) {
      placebar.appendChild(el('div.places-tools', { role: 'group', 'aria-label': 'Place tools' },
        ctx.openCompare
          ? el('button.btn.btn-sm', { type: 'button', onclick: () => ctx.openCompare?.() }, icon('scale', 'chip-ico'), ' ', t('cmp_open'))
          : null,
        ctx.openJourney
          ? el('button.btn.btn-sm', { type: 'button', onclick: () => ctx.openJourney?.() }, icon('route', 'chip-ico'), ' ', t('jny_open'))
          : null,
      ));
    }
    root.appendChild(placebar);
    renderPlaces(placesMount, {
      current: loc,
      units,
      onSelect: (p) => ctx.pickLocation?.(p),
      onAdd: () => ctx.openSearch?.(),
      onForget: (i) => {
        store.destinations.removeAt(i);
        ctx.rerender?.();
        toast(t('place_removed'));
      },
    });
  }

  /* ---------- alerts (stacked, dismissible, dismissal sticky for the session) ---------- */
  const dismissed = readDismissedAlerts();
  for (const alert of computeAlerts(s)) {
    if (dismissed.has(alert.title)) continue; // user closed this exact alert already
    const alertEl = el(`div.alert.alert-${alert.kind}.dash-alert`, { role: 'alert' },
      el('button.alert-close', {
        type: 'button', 'aria-label': t('alert_dismiss'), title: t('alert_dismiss'),
        onclick: () => {
          dismissed.add(alert.title);
          try { sessionStorage.setItem('mausam:dismissedAlerts', JSON.stringify([...dismissed].slice(-30))); } catch { /* private mode */ }
          alertEl.remove();
        },
      }, icon('close', 'alert-close-ico')),
      el('div.alert-title', null, alertIcon(alert.icon), el('span', null, alert.title)),
      el('div', null, alert.text),
    );
    root.appendChild(alertEl);
  }

  /* ---------- rain nowcast ---------- */
  const nowcast = nowcastCard(s, units);
  if (nowcast) {
    root.appendChild(dsec('dc-m', sectionTitle(t('sec_nowcast')), nowcast));
  }

  /* ---------- day timeline (profile-driven, additive) ---------- */
  const timeline = computeDayTimeline(s, profile);
  if (timeline) {
    root.appendChild(dsec('dc-s', sectionTitle(t('sec_yourday')), dayTimelineCard(timeline)));
  }

  /* ---------- For You ---------- */
  const forYou = computeForYou(s, profile);
  if (forYou && forYou.cards.length) {
    const rail = el('div.foryou-rail');
    for (const c of forYou.cards) {
      rail.appendChild(el(`div.card.foryou-card.${toneClass(c.tone)}`,
        el('div.foryou-head', el('span.insight-icon', null, tipContent(c.icon)), el('span', null, c.title)),
        el('div.foryou-text', null, rich(c.text)),
      ));
    }
    root.appendChild(dsec('dc-s', sectionTitle(`${t('sec_foryou')}${forYou.greeting ? ` · ${forYou.greeting}` : ''}`, false, 'sparkles'), rail));
  }

  /* ---------- hourly strip ---------- */
  const h48 = s.hours.slice(0, 48);
  const clock = store.clock.get() === '24' ? 'h24' : 'h12';
  /* Tappable hour detail — title tooltips never show on touch screens, so a
     tap opens a kv grid (feels / rain / wind / humidity / dew / UV) under the
     strip, mirroring the 10-day expand pattern. All fields already sit on the
     hour object — zero extra API calls. */
  let openCard = null;
  const hourDetail = el('div.hour-detail', { id: 'hour-detail', role: 'region', 'aria-label': t('sec_48h') });
  const strip = hourlyStrip(h48, (h) => {
    const card = el('button.hour-card', {
      type: 'button',
      'aria-expanded': 'false',
      'aria-controls': 'hour-detail',
      onclick: () => {
        const wasOpen = openCard === card;
        if (openCard) openCard.setAttribute('aria-expanded', 'false');
        openCard = wasOpen ? null : card;
        card.setAttribute('aria-expanded', String(!wasOpen));
        hourDetail.classList.toggle('open', !wasOpen);
        if (wasOpen) hourDetail.replaceChildren();
        else {
          hourDetail.replaceChildren(el('div.ten-detail-grid', [
            [el('span.tlbl', icon('thermo', 'kv-ico ico-mut'), t('day_feels')), h.apparent_temperature != null ? temp(h.apparent_temperature, units) : '—'],
            [el('span.tlbl', icon('droplet', 'kv-ico ico-sky'), t('rain_simple')), `${Math.round(h.precipitation_probability ?? 0)}% · ${rainMm(h.precipitation, units)}`],
            [el('span.tlbl', icon('wind', 'kv-ico ico-mut'), t('wind')),
              h.wind_gusts_10m != null
                ? [`${h.wind_speed_10m != null ? wind(h.wind_speed_10m, units) : '—'} ·`, `${t('gusts')} ${wind(h.wind_gusts_10m, units)}`]
                : (h.wind_speed_10m != null ? wind(h.wind_speed_10m, units) : '—')],
            [el('span.tlbl', icon('droplet', 'kv-ico ico-sky'), t('humidity')), h.relative_humidity_2m != null ? `${Math.round(h.relative_humidity_2m)}%` : '—'],
            [el('span.tlbl', icon('droplet', 'kv-ico ico-mut'), t('dew_point')), h.dew_point_2m != null ? temp(h.dew_point_2m, units) : '—'],
            [el('span.tlbl', icon('sun', 'kv-ico ico-sun'), t('uv')), h.uv_index != null ? `${Math.round(h.uv_index * 10) / 10}` : '—'],
          ].map(([k, v]) => detailCell(k, v))));
        }
      },
    },
      el('div.h-time', null, hourLabel(h.time, clock)),
      el('div.h-icon', null, h.weather_code != null ? skyIcon(skyBucket(h.weather_code, !h.night), 'wx-ico') : (h.wx?.icon ?? '·')),
      el('div.h-val', null, temp(h.temperature_2m, units)),
      el('div.h-sub', null, `${Math.round(h.precipitation_probability ?? 0)}%`),
    );
    return card;
  });
  root.appendChild(dsec('dc-m', sectionTitle(t('sec_48h')), strip, hourDetail));

  /* ---------- temp curve ---------- */
  const curve = tempCurve(h48.slice(0, 24));
  if (curve) {
    root.appendChild(dsec('dc-m', sectionTitle(t('sec_curve')), card(curve)));
  }

  /* ---------- 10-day ---------- */
  {
    const bd = computeBestDays(s);
    const tenList = tenDayList(s, units, bd);
    if (tenList) {
      const tenWrap = el('div', null, tenList);
      tenWrap.appendChild(el('div.ten-hint', null, t('ten_hint')));
      root.appendChild(dsec('dc-m', sectionTitle(t('sec_10day')), tenWrap));
    } else {
      root.appendChild(dsec('dc-m', sectionTitle(t('sec_10day')), weekGrid(s.days, (d, i) => simpleWeekCell(d, i, units))));
    }
  }

  /* ---------- farm weather (interest-gated, additive) ---------- */
  if (profile?.interests?.includes('farming')) {
    const farmCards = computeFarmCards(s);
    if (farmCards.length) {
      const farmSec = [sectionTitle(t('sec_farm'), false, 'crops')];
      /* v0.8.35: the farm DESK — advisories as rows in one card, the same
         kv-row language the Sun & moon / Today's records cards speak, instead
         of a 500px stack of three separate text cards beside a 200px curve. */
      const desk = el('div.card.farm-desk');
      for (const c of farmCards) {
        desk.appendChild(el(`div.farm-row.${toneClass(c.tone)}`,
          el('span.insight-icon', null, tipContent(c.icon)),
          el('div.farm-rowbody',
            el('div.farm-rowtitle', null, c.title),
            el('div.farm-rowtext', null, rich(c.text))),
        ));
      }
      farmSec.push(desk);
      /* extra stat tiles: soil + ET0 */
      const h0 = s.hours[0] ?? {};
      farmSec.push(statTiles([
        [h0.soil_moisture_0_to_1cm != null ? `${Math.round(Math.min(100, (h0.soil_moisture_0_to_1cm / 0.4) * 100))}%` : '—', t('farm_soil01')],
        [h0.soil_moisture_3_to_9cm != null ? `${Math.round(Math.min(100, (h0.soil_moisture_3_to_9cm / 0.4) * 100))}%` : '—', t('farm_soil39')],
        [h0.soil_temperature_0_to_7cm != null ? temp(h0.soil_temperature_0_to_7cm) : '—', t('farm_stemp')],
        [h0.et0_fao_evapotranspiration != null ? `${Math.round((h0.et0_fao_evapotranspiration ?? 0) * 24 * 10) / 10} mm/d` : '—', t('farm_et0')],
      ]));
      root.appendChild(dsec('dc-s', ...farmSec));
    }
  }

  /* ---------- Mausam says ---------- */
  const insights = computeInsights(s);
  if (insights.length) {
    const grid = el('div.insight-grid');
    for (const ins of insights) {
      grid.appendChild(el(`div.card.insight-card.${toneClass(ins.tone)}`,
        el('div.insight-head', el('span.insight-icon', null, tipContent(ins.icon)), el('span', null, ins.title)),
        el('div.insight-text', null, rich(ins.text)),
      ));
    }
    root.appendChild(dsec('dc-s sec-says', sectionTitle(t('sec_says')), grid));
  }

  /* ---------- details grid ---------- */
  const n = s.now;
  const detailTiles = statTiles([
    [`${Math.round(n.humidity ?? 0)}%`, t('humidity')],
    [wind(n.wind, units), `${t('wind')} ${n.wind_dir != null ? compass(n.wind_dir) : ''}`],
    [n.gusts != null ? wind(n.gusts, units) : '—', t('gusts')],
    [`${n.uv != null ? Math.round(n.uv * 10) / 10 : '—'}`, `${t('uv')} · ${n.uv != null ? t(uvBandKey(n.uv)) : ''}`],
    [visibility(n.visibility), t('visibility')],
    [n.pressure != null ? `${Math.round(n.pressure)} hPa` : '—', t('pressure')],
    [n.dew != null ? temp(n.dew) : '—', t('dew_point')],
    [`${n.cloud != null ? Math.round(n.cloud) : '—'}%`, t('cloud_cover')],
  ]);
  root.appendChild(dsec('dc-m', sectionTitle(t('sec_detail')), detailTiles));

  /* ---------- AQI (main column) + sun (side column) ---------- */
  const sun = s.sun;
  root.appendChild(dsec('dc-m sec-aqi', aqiCardV2(s, ctx.location)));

  const imd = s.bundle?.imd;
  /* v0.8.9: kv rows built inline so the label carries a stroke-SVG glyph
     (same icon language as the hero) instead of raw emoji.
     v0.8.34: the card leads with the day's arc — the sun (or the moon,
     after dark) at its honest position between sunrise and sunset — and
     gains an on-device moon-phase row with the real terminator drawn. */
  const kvIco = (name, tint) => icon(name, `kv-ico ${tint}`);
  const mP = moonPhaseFrac();
  const mIllum = Math.round((1 - Math.cos(2 * Math.PI * mP)) / 2 * 100);
  const sunCard = card(
    el('div.card-h', null, `${t('sec_sun')}${imd?.ok ? ' · IMD' : ''}`),
    sunArcSvg(sun),
    el('div.kv-list',
      el('div.kv-row', el('span.kv-label', kvIco('sunrise', 'ico-sun'), t('sunrise')), el('span.kv-value', null, fmtClock(sun?.sunrise))),
      el('div.kv-row', el('span.kv-label', kvIco('sunset', 'ico-dusk'), t('sunset')), el('span.kv-value', null, fmtClock(sun?.sunset))),
      el('div.kv-row', el('span.kv-label', kvIco('hourglass', 'ico-mut'), t('day_length')), el('span.kv-value', null, sun?.dayLength ?? '—')),
      el('div.kv-row',
        el('span.kv-label', kvIco('moon', 'ico-moon'), t('moon_phase')),
        el('span.kv-value', { class: 'moon-val' }, moonDiscSvg(mP),
          `${t(phaseKey(mP))} · ${t('mp_lit', { n: mIllum })}`)),
      ...(imd?.ok && imd.obs?.moonrise ? [el('div.kv-row', el('span.kv-label', kvIco('moon', 'ico-moon'), t('moonrise')), el('span.kv-value', null, imd.obs.moonrise))] : []),
      ...(imd?.ok && imd.obs?.moonset ? [el('div.kv-row', el('span.kv-label', kvIco('moon', 'ico-moon'), t('moonset')), el('span.kv-value', null, imd.obs.moonset))] : []),
      /* v0.8.36: the sky calendar — next full / new moon from the same
         on-device synodic model. Indian festival dates ride the lunar
         cycle (पूर्णिमा/अमावस्या), so these two rows are glanceable
         truth, not decoration. */
      el('div.kv-row',
        el('span.kv-label', skyMoonDisc('moon-lit'), t('mp_next_full')),
        el('span.kv-value', null, dateLabel(nextMoonISO(0.5)))),
      el('div.kv-row',
        el('span.kv-label', skyMoonDisc('moon-dark'), t('mp_next_new')),
        el('span.kv-value', null, dateLabel(nextMoonISO(0)))),
    ),
  );
  root.appendChild(dsec('dc-s sec-sun', sunCard));

  /* ---------- today's records (rail) ----------
     v0.8.34: the rail's honest extremes — the numbers a day is judged by
     (strongest gust, peak UV, rain total, what the heat actually felt
     like) — computed from the forecast already fetched, in the same kv
     language as the sun card. Mobile gets them too: these day-level
     extremes appear nowhere else below 900px. */
  const rec0 = s.days?.[0];
  if (rec0 && (rec0.gusts_max != null || rec0.uv_max != null || rec0.precipitation_sum != null || rec0.feels_max != null)) {
    root.appendChild(dsec('dc-s sec-records', sectionTitle(t('sec_records')), card(
      el('div.kv-list',
        el('div.kv-row', el('span.kv-label', kvIco('wind', 'ico-mut'), t('rec_gust')), el('span.kv-value', null, rec0.gusts_max != null ? wind(rec0.gusts_max, units) : '—')),
        el('div.kv-row', el('span.kv-label', kvIco('sun', 'ico-sun'), t('rec_uv')), el('span.kv-value', null, rec0.uv_max != null ? `${Math.round(rec0.uv_max * 10) / 10} · ${t(uvBandKey(rec0.uv_max))}` : '—')),
        el('div.kv-row', el('span.kv-label', kvIco('umbrella', 'ico-mut'), t('rec_rain')), el('span.kv-value', null, rec0.precipitation_sum != null ? `${Math.round(rec0.precipitation_sum * 10) / 10} mm${rec0.precip_prob_max != null ? ` · ${t('rec_peak', { p: Math.round(rec0.precip_prob_max) })}` : ''}` : '—')),
        el('div.kv-row', el('span.kv-label', kvIco('thermo', 'ico-dusk'), t('rec_feels')), el('span.kv-value', null, rec0.feels_max != null ? temp(rec0.feels_max, units) : '—')),
      ),
    )));
  }

  /* ---------- today in one line (rail digest, ≥900px) ----------
     The desktop rail used to run out of content exactly where the data got
     dense: the AQI row's side cell sat empty in every state. This compact
     digest — the day as one glanceable line — is the rail's closing card.
     It is a rail artifact: hidden below 900px where everything it says is
     already on screen in sequence. */
  if (s.now?.temp != null) {
    const maxPop = Math.max(0, ...s.hours.slice(0, 12).map((h) => h.precipitation_probability ?? 0));
    const aqiNow = s.currentAqi?.aqi;
    const digestLine = el('p.digest-line', null,
      el('strong', null, temp(s.now.temp, units)), ' ', wxText(s.now.wx, getLang()),
      el('span.digest-dot', { 'aria-hidden': 'true' }, '·'),
      t('dg_rain', { p: Math.round(maxPop) }),
      aqiNow != null ? el('span.digest-dot', { 'aria-hidden': 'true' }, '·') : null,
      aqiNow != null ? t('dg_aqi', { n: aqiNow }) : null,
      aqiNow != null ? el('span.digest-cat', { style: `color:${aqiBandColor(aqiNow)}` }, aqiCat(aqiNow, getLang())) : null,
    );
    root.appendChild(dsec('dc-s sec-digest',
      sectionTitle(t('sec_digest')),
      el('div.card.digest-card', {
        role: 'button', tabindex: '0', title: t('dg_jump'), 'aria-label': t('dg_jump'),
        onclick: () => jumpToAqi(),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jumpToAqi(); } },
      },
        el('span.insight-icon', { 'aria-hidden': 'true' },
          skyIcon(skyBucket(s.now.weather_code, s.now.is_day), 'digest-glyph')),
        digestLine,
      ),
    ));
  }

  /* ---------- sea & coast (only where marine data exists) ---------- */
  const marine = s.extras?.marine;
  if (marine?.now?.waveHeightM != null) {
    const wave = marine.now.waveHeightM;
    root.appendChild(dsec('dc-f', sectionTitle(t('sec_coast'), false, 'waves'), card(
      el('div.kv-list',
        el('div.kv-row', el('span.kv-label', null, icon('waves', 'chip-ico'), ' Waves now'), el('span.kv-value', null, `${Math.round(wave * 10) / 10} m · ${Math.round(marine.now.wavePeriodS ?? 0)} s`)),
        ...marine.days.slice(0, 3).map((d) =>
          el('div.kv-row',
            el('span.kv-label', null, dateLabel(d.date)),
            el('span.kv-value', null, d.waveMaxM != null ? `max ${Math.round(d.waveMaxM * 10) / 10} m` : '—'))),
      ),
    )));
  }

  /* ---------- river watch (only when abnormal) ---------- */
  const flood = s.extras?.flood;
  if (flood?.peak && flood.peak.ratio >= 1.5) {
    const ratio = Math.round(flood.peak.ratio * 10) / 10;
    root.appendChild(dsec('dc-f', sectionTitle(t('sec_flood'), false, 'droplet'),
      el(`div.alert.alert-${flood.peak.ratio >= 3 ? 'danger' : 'warn'}.dash-alert`,
      { role: 'alert' },
      el('div.alert-title', null, alertIcon('wind'), el('span', null, `River flow ${ratio}× normal`)),
      el('div', null, `Peak around ${dateLabel(flood.peak.date)} — ${Math.round(flood.peak.discharge)} m³/s vs usual ${Math.round(flood.peak.mean)} m³/s. People near the river: stay alert, follow local administration.`),
    )));
  }

  /* ---------- IMD enrichment ---------- */
  if (imd?.ok) {
    root.appendChild(dsec('dc-f', sectionTitle(t('sec_imd')), card(
      el('div.imd-note', null, t('imd_note', {
        s: imd.station?.name ?? '—', d: imd.station?.distanceKm ?? '—',
        r: imd.obs?.rain24 ?? '—', h1: imd.obs?.rh0830 ?? '—', h2: imd.obs?.rh1730 ?? '—',
      })),
      el('div.imd-days', (imd.days ?? []).slice(0, 7).map((d) =>
        el('div.imd-day',
          el('div.imd-day-date', null, d.date?.slice(5) ?? '—'),
          el('div.imd-day-text', null, d.text || '—'),
          el('div.imd-day-temp', null, d.max != null ? `${Math.round(d.max)}° / ${d.min != null ? Math.round(d.min) + '°' : '—'}` : '—'),
        )),
      ),
    )));
  }

  /* ---------- personalisation nudge ---------- */
  if (!profile && !store.flags.get('nudgeDismissed')) {
    root.appendChild(dsec('dc-s', el('div.card.nudge-card',
      el('div.nudge-text',
        el('div.nudge-title', null, icon('sparkles', 'chip-ico'), ' ', t('nudge_title')),
        el('div.nudge-sub', null, t('nudge_sub')),
      ),
      el('div.nudge-actions',
        el('button.btn.btn-primary', { onclick: () => ctx.openYou?.() }, t('nudge_cta')),
        el('button.btn', { onclick: () => { store.flags.set('nudgeDismissed', true); ctx.rerender?.(); } }, t('nudge_skip')),
      ),
    )));
  }

  /* v0.8.33 — pack the board before the browser paints it. */
  packHomeGrid(root);
  watchPacked(root);
}

/* ================================================================
   v0.8.33 — the dashboard packs like masonry. Row-aligned auto-placement
   pairs the k-th main section with the k-th rail section and sizes each
   row to the taller cell, so every height mismatch becomes dead
   background: measured ~1042px of holes in the profiled desktop state
   (curve 281 beside farm 508, AQI 448 beside digest 122), spread across
   every row. Packing replaces row alignment: rows collapse to 2px tracks
   and each item spans exactly the tracks its outer height needs, so each
   column packs independently and the holes vanish — same cards, same
   order, same spacing rhythm (the gaps still come from the cards' own
   margins and the next section's title strip).

   The `.packed` class gates the CSS: if this JS never runs, the grid
   keeps the old auto-row behaviour byte-for-byte. Tracks are 2px, so
   quantisation costs at most 2px per item. Spans are recomputed by a
   ResizeObserver (accordion days, font swap, data refresh), on the 640 /
   900 breakpoints (column assignment changes) and after every render.
================================================================ */
const PACK_ROW_PX = 2;
let packRO = null;
let packedEls = []; // exactly the elements that currently carry spans

/** Grid items of the board: direct children, with display:contents
 *  wrappers (mobile sections, the dissolved says grid) unwrapped
 *  recursively; display:none nodes are not items. */
function packedItems(root) {
  const out = [];
  const collect = (node) => {
    for (const n of node.children) {
      const d = getComputedStyle(n).display;
      if (d === 'none') continue;
      if (d === 'contents') collect(n);
      else out.push(n);
    }
  };
  collect(root);
  return out;
}

function packHomeGrid(root) {
  if (!root || !root.isConnected) return;
  const on = matchMedia('(min-width: 640px)').matches;
  root.classList.toggle('packed', on);
  if (!on) {
    /* below 640 the sections turn display:contents, so packedItems() would
       return their children — clear exactly the elements we spanned. */
    for (const it of packedEls) it.style.gridRow = '';
    packedEls = [];
    return;
  }
  packedEls = packedItems(root);
  for (const it of packedEls) {
    const m = getComputedStyle(it).marginBottom;
    const outer = it.offsetHeight + (parseFloat(m) || 0);
    it.style.gridRow = `span ${Math.max(1, Math.ceil(outer / PACK_ROW_PX))}`;
  }
}

/** Keep spans honest as heights move under us: accordion days, font
 *  swap, viewport resize across the 640/900 breakpoints. */
function watchPacked(root) {
  if (!packRO) {
    packRO = new ResizeObserver(() => {
      if (!document.body.contains(root)) return;
      packHomeGrid(document.getElementById('home-scroll'));
    });
    matchMedia('(min-width: 640px)').addEventListener('change', () =>
      packHomeGrid(document.getElementById('home-scroll')));
    matchMedia('(min-width: 900px)').addEventListener('change', () =>
      packHomeGrid(document.getElementById('home-scroll')));
    addEventListener('load', () => packHomeGrid(document.getElementById('home-scroll')));
    document.fonts?.ready?.then(() => packHomeGrid(document.getElementById('home-scroll')));
  }
  packRO.disconnect();
  for (const it of packedItems(root)) packRO.observe(it);
}

/** The digest points somewhere: tap/Enter scrolls the full AQI card into
 *  view. Reduced-motion users get an instant jump. */
function jumpToAqi() {
  const target = document.querySelector('#home-scroll .sec-aqi');
  if (!target) return;
  target.scrollIntoView({
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  });
}

/** Tiny helper used by main.js to refresh the "Updated…" pill. */
export function updateFreshness(snapshot) {
  const pill = document.getElementById('updated-pill');
  if (pill && snapshot) pill.textContent = `${t('updated')} ${relativeTime(snapshot.fetchedAt)}`;
}

/** Alert titles the user closed this session — they stay closed across
 *  re-renders and reloads. Titles embed values ("AQI 404"), so genuinely
 *  new conditions always produce a new, visible alert. */
function readDismissedAlerts() {
  try {
    const arr = JSON.parse(sessionStorage.getItem('mausam:dismissedAlerts') ?? '[]');
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === 'string')) : new Set();
  } catch { return new Set(); }
}
