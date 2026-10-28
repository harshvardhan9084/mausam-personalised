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
import { compass } from '../api/wmo.js';
import {
  computeAlerts, computeInsights, computeForYou,
  computeDayTimeline, computeFarmCards, computeBestDays,
} from '../core/insights.js';
import { hero, sectionTitle, card, statTiles, kvList, hourlyStrip, weekGrid, simpleWeekCell, aqiPill, nowRow, skyBucket } from './shared.js';
import { icon } from './icons.js';
import { renderPlaces } from './places.js';
import { store } from '../core/storage.js';
import { getProfile } from '../core/profile.js';
import { t } from '../core/i18n.js';

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

function toneClass(tone) {
  return { good: 'insight-good', info: 'insight-info', warn: 'insight-warn', danger: 'insight-danger' }[tone] ?? 'insight-info';
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

  const wrap = el('div.dash-curve-wrap', svg);
  const labels = el('div.dash-curve-labels',
    [0, Math.floor((n - 1) / 2), n - 1].map((i) => el('span', null, hourLabel(hours[i].time, store.clock.get() === '24' ? 'h24' : 'h12'))),
  );
  const rains = el('div.dash-curve-rains',
    hours.filter((_, i) => i % 3 === 0).map((h) => el('span', { class: (h.precipitation_probability ?? 0) >= 50 ? 'wet' : '' }, `💧${Math.round(h.precipitation_probability ?? 0)}%`)),
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
    `${loc?.name ?? 'Here'}: ${temp(n.temp, units, true)}, ${n.wx?.label ?? ''}`,
    today ? `H ${temp(today.temp_max, units)} / L ${temp(today.temp_min, units)} · 💧 ${Math.round(today.precip_prob_max ?? 0)}%` : null,
    aqi?.aqi != null ? `AQI ${aqi.aqi} (${aqi.category})` : null,
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
  const fmtT = (iso) => {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: store.clock.get() !== '24' });
  };
  const startLabel = fmtT(m.start);

  const head = el('div.nowcast-head');
  let verdict;
  if (total < 0.1) {
    verdict = el('div.nowcast-verdict', null, t('nowcast_dry'));
  } else if (firstWet === 0) {
    verdict = el('div.nowcast-verdict.wet', null, t('nowcast_wet', { t: startLabel }));
  } else {
    const at = fmtT(new Date(new Date(m.start).getTime() + firstWet * 15 * 60000));
    verdict = el('div.nowcast-verdict', null, t('nowcast_soon', { t: at }));
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
      col.appendChild(el('span.nowcast-lbl', null, fmtT(new Date(new Date(m.start).getTime() + i * 15 * 60000))));
    }
    bars.appendChild(col);
  });
  head.appendChild(bars);
  return card(head);
}

/* ================================================================
   AQI CARD v2 — values, dust, 24h mini trend
================================================================ */

function aqiCardV2(s) {
  const aqi = s.currentAqi;
  const nowAir = s.hours[0]?.air ?? {};
  const trend = s.hours.slice(0, 48).filter((h) => h.aqi != null);
  const head = el('div.aqi-head', el('div.card-h', null, t('sec_aqi')), aqiPill(aqi));

  const cardBody = card(head);
  if (aqi?.advice) cardBody.appendChild(el('div.aqi-advice', null, aqi.advice));

  /* pollutant chips */
  const chips = [];
  if (nowAir.pm2_5 != null) chips.push(['PM2.5', `${Math.round(nowAir.pm2_5)}`]);
  if (nowAir.pm10 != null) chips.push(['PM10', `${Math.round(nowAir.pm10)}`]);
  if (nowAir.dust != null && nowAir.dust >= 5) chips.push(['🌪 Dust', `${Math.round(nowAir.dust)}`]);
  if (nowAir.ozone != null) chips.push(['O₃', `${Math.round(nowAir.ozone)}`]);
  if (chips.length) {
    cardBody.appendChild(el('div.aqi-chips',
      chips.map(([k, v]) => el('span.aqi-chip', null, el('b', null, v), ` ${k}`))));
  }

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
        title: `${hourLabel(h.time, clock)} · AQI ${h.aqi} · ${h.aqiFull?.category ?? ''}`,
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
              ['AQI', `${h.aqi} · ${h.aqiFull?.category ?? ''}`],
              ['PM2.5', air.pm2_5 != null ? `${Math.round(air.pm2_5)}` : '—'],
              ['PM10', air.pm10 != null ? `${Math.round(air.pm10)}` : '—'],
              ...(air.ozone != null ? [['O₃', `${Math.round(air.ozone)}`]] : []),
              ...(air.dust != null && air.dust >= 5 ? [['🌪 Dust', `${Math.round(air.dust)}`]] : []),
              ...(h.aqiFull?.dominant ? [[t('aqi_dominant'), h.aqiFull.dominant]] : []),
            ].map(([k, v]) => el('span', null, el('b', null, k), v))));
          }
        },
      });
      bar.style.height = `${Math.max(3, Math.min(100, (h.aqi / 500) * 100))}%`;
      bar.style.background = h.aqiFull?.color ?? 'var(--muted)';
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
  return cardBody;
}

/* ================================================================
   DAY TIMELINE
================================================================ */

function dayTimelineCard(rows) {
  return card(el('div.day-tl',
    rows.map((r) => el('div.day-tl-row', { class: r.cls },
      el('span.day-tl-icon', null, r.icon),
      el('span.day-tl-label', null, r.label),
      el('span.day-tl-time', null, r.time),
      el('span.day-tl-wx', null, r.icon2),
      el('span.day-tl-temp', null, r.temp),
      el('span.day-tl-pop', null, `💧${r.pop}%`),
    )),
  ));
}

/** 10-day list: day | icon | pop | range bar positioned over the period's
 *  min–max span | values. Rows expand on tap into a per-day detail panel
 *  (feels, rain, wind, UV, sun) — data is already in the bundle, zero
 *  extra API calls (v0.8). */
function tenDayList(s, units, bd) {
  const days = (s.days ?? []).slice(0, 10);
  if (!days.length) return null;
  const mins = days.map((d) => d.temp_min).filter((v) => v != null);
  const maxs = days.map((d) => d.temp_max).filter((v) => v != null);
  const gMin = Math.min(...mins, ...maxs);
  const gMax = Math.max(...mins, ...maxs);
  const span = Math.max(gMax - gMin, 1);
  const list = el('div.ten-list', { role: 'list', 'aria-label': t('sec_10day') });

  const fmtT = (iso) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: store.clock.get() !== '24' }) : '—');

  days.forEach((d, i) => {
    const lo = d.temp_min ?? gMin;
    const hi = d.temp_max ?? gMax;
    const left = ((lo - gMin) / span) * 100;
    const width = Math.max(((hi - lo) / span) * 100, 6);
    const bar = el('div.ten-track', { 'aria-hidden': 'true' },
      el('div.ten-fill', {
        style: { marginLeft: `${left.toFixed(1)}%`, width: `${width.toFixed(1)}%` },
      }));
    const detailId = `ten-detail-${i}`;
    const star = bd && bd.best && d.date === bd.best.date;
    const detail = el('div.ten-detail', { id: detailId, role: 'region', 'aria-label': `${d.label ?? ''} ${d.date}` },
      el('div.ten-detail-grid', [
        [`🌡 ${t('day_feels')}`, d.feels_max != null ? temp(d.feels_max, units) : '—'],
        [`💧 ${t('rain_simple')}`, `${Math.round(d.precip_prob_max ?? 0)}% · ${rainMm(d.precipitation_sum, units)}`],
        [`${t('wind')}`, `${d.wind_max != null ? wind(d.wind_max, units) : '—'}${d.gusts_max != null ? ` · ${t('gusts')} ${wind(d.gusts_max, units)}` : ''}`],
        [`${t('uv')}`, d.uv_max != null ? `${Math.round(d.uv_max * 10) / 10}` : '—'],
        [`🌅 ${t('sunrise')}`, fmtT(d.sunrise)],
        [`🌇 ${t('sunset')}`, fmtT(d.sunset)],
      ].map(([k, v]) => el('span', null, el('b', null, k), v))),
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
      el('span.ten-day', null, `${star ? '⭐' : ''}${i === 0 ? t('today') : dayLabel(d.date, i)}`),
      el('span.ten-icon', null, d.wx?.icon ?? '·'),
      el('span.ten-pop', { class: (d.precip_prob_max ?? 0) >= 50 ? 'wet' : '', title: t('rain_simple') }, `${Math.round(d.precip_prob_max ?? 0)}%`),
      bar,
      el('span.ten-vals', null,
        el('b', null, temp(hi, units)),
        el('span', null, temp(lo, units))),
      icon('chevron', 'ten-chev'),
    );
    if (star) row.setAttribute('title', `${t('sec_bestday')} · ${d.label ?? ''}`);
    const wrap = el('div.ten-row-wrap', { role: 'listitem', class: i === 0 ? 'today' : '' }, row, detail);
    list.appendChild(wrap);
  });
  return list;
}

/* ================================================================
   MAIN RENDER
================================================================ */

export function renderDashboard(root, snapshot, units, ctx) {
  const s = snapshot;
  const loc = ctx.location;
  const profile = getProfile();

  clear(root);

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
        '📆',
        `${t('vs_last_year')}: ${s.days[0].temp_max >= climate.lastYearAvgMaxC ? '+' : '−'}${Math.abs(Math.round((s.days[0].temp_max - climate.lastYearAvgMaxC) * 10) / 10)}°`)
    : null;
  const shareBtn = el('button.hero-share', {
    type: 'button', 'aria-label': t('share'), title: t('share'),
    onclick: () => shareWeather(s, units, loc),
  }, icon('share'));
  const heroCard = card(
    el('div.sky-deco', { 'aria-hidden': 'true' }),
    el('div.hero-now-top',
      el('div.hero-place', null, `${[loc?.name, loc?.admin1].filter(Boolean).join(', ')}`),
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
      toast(t('place_removed'));
    },
  });
  if (ctx.openCompare || ctx.openJourney) {
    root.appendChild(el('div.places-tools', { role: 'group', 'aria-label': 'Place tools' },
      ctx.openCompare
        ? el('button.btn.btn-sm', { type: 'button', onclick: () => ctx.openCompare?.() }, t('cmp_open'))
        : null,
      ctx.openJourney
        ? el('button.btn.btn-sm', { type: 'button', onclick: () => ctx.openJourney?.() }, t('jny_open'))
        : null,
    ));
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
      el('div.alert-title', null, `${alert.icon} ${alert.title}`),
      el('div', null, alert.text),
    );
    root.appendChild(alertEl);
  }

  /* ---------- rain nowcast ---------- */
  const nowcast = nowcastCard(s, units);
  if (nowcast) {
    root.appendChild(sectionTitle(t('sec_nowcast')));
    root.appendChild(nowcast);
  }

  /* ---------- day timeline (profile-driven, additive) ---------- */
  const timeline = computeDayTimeline(s, profile);
  if (timeline) {
    root.appendChild(sectionTitle(t('sec_yourday')));
    root.appendChild(dayTimelineCard(timeline));
  }

  /* ---------- For You ---------- */
  const forYou = computeForYou(s, profile);
  if (forYou && forYou.cards.length) {
    root.appendChild(sectionTitle(`✨ ${t('sec_foryou')}${forYou.greeting ? ` · ${forYou.greeting}` : ''}`));
    const rail = el('div.foryou-rail');
    for (const c of forYou.cards) {
      rail.appendChild(el(`div.card.foryou-card.${toneClass(c.tone)}`,
        el('div.foryou-head', el('span.foryou-icon', null, c.icon), el('span', null, c.title)),
        el('div.foryou-text', null, rich(c.text)),
      ));
    }
    root.appendChild(rail);
  }

  /* ---------- hourly strip ---------- */
  root.appendChild(sectionTitle(t('sec_48h')));
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
            [`🌡 ${t('day_feels')}`, h.apparent_temperature != null ? temp(h.apparent_temperature, units) : '—'],
            [`💧 ${t('rain_simple')}`, `${Math.round(h.precipitation_probability ?? 0)}% · ${rainMm(h.precipitation, units)}`],
            [`${t('wind')}`, `${h.wind_speed_10m != null ? wind(h.wind_speed_10m, units) : '—'}${h.wind_gusts_10m != null ? ` · ${t('gusts')} ${wind(h.wind_gusts_10m, units)}` : ''}`],
            [`${t('humidity')}`, h.relative_humidity_2m != null ? `${Math.round(h.relative_humidity_2m)}%` : '—'],
            [`${t('dew_point')}`, h.dew_point_2m != null ? temp(h.dew_point_2m, units) : '—'],
            [`${t('uv')}`, h.uv_index != null ? `${Math.round(h.uv_index * 10) / 10}` : '—'],
          ].map(([k, v]) => el('span', null, el('b', null, k), v))));
        }
      },
    },
      el('div.h-time', null, hourLabel(h.time, clock)),
      el('div.h-icon', null, h.wx?.icon ?? '·'),
      el('div.h-val', null, temp(h.temperature_2m, units)),
      el('div.h-sub', null, `${Math.round(h.precipitation_probability ?? 0)}%`),
    );
    return card;
  });
  root.appendChild(strip);
  root.appendChild(hourDetail);

  /* ---------- temp curve ---------- */
  const curve = tempCurve(h48.slice(0, 24));
  if (curve) {
    root.appendChild(sectionTitle(t('sec_curve')));
    root.appendChild(card(curve));
  }

  /* ---------- 10-day ---------- */
  root.appendChild(sectionTitle(t('sec_10day')));
  const bd = computeBestDays(s);
  const tenList = tenDayList(s, units, bd);
  if (tenList) {
    const tenWrap = el('div', null, tenList);
    tenWrap.appendChild(el('div.ten-hint', null, t('ten_hint')));
    root.appendChild(tenWrap);
  } else {
    root.appendChild(weekGrid(s.days, (d, i) => simpleWeekCell(d, i, units)));
  }

  /* ---------- farm weather (interest-gated, additive) ---------- */
  if (profile?.interests?.includes('farming')) {
    const farmCards = computeFarmCards(s);
    if (farmCards.length) {
      root.appendChild(sectionTitle(`🌾 ${t('sec_farm')}`));
      const grid = el('div.insight-grid');
      for (const c of farmCards) {
        grid.appendChild(el(`div.card.insight-card.${toneClass(c.tone)}`,
          el('div.insight-head', el('span.insight-icon', null, c.icon), el('span', null, c.title)),
          el('div.insight-text', null, rich(c.text)),
        ));
      }
      root.appendChild(grid);
      /* extra stat tiles: soil + ET0 */
      const h0 = s.hours[0] ?? {};
      root.appendChild(statTiles([
        [h0.soil_moisture_0_to_1cm != null ? `${Math.round(Math.min(100, (h0.soil_moisture_0_to_1cm / 0.4) * 100))}%` : '—', 'Soil 0–1 cm'],
        [h0.soil_moisture_3_to_9cm != null ? `${Math.round(Math.min(100, (h0.soil_moisture_3_to_9cm / 0.4) * 100))}%` : '—', 'Soil 3–9 cm'],
        [h0.soil_temperature_0_to_7cm != null ? temp(h0.soil_temperature_0_to_7cm) : '—', 'Soil temp'],
        [h0.et0_fao_evapotranspiration != null ? `${Math.round((h0.et0_fao_evapotranspiration ?? 0) * 24 * 10) / 10} mm/d` : '—', 'Evapo‑transpiration'],
      ]));
    }
  }

  /* ---------- Mausam says ---------- */
  const insights = computeInsights(s);
  if (insights.length) {
    root.appendChild(sectionTitle(t('sec_says')));
    const grid = el('div.insight-grid');
    for (const ins of insights) {
      grid.appendChild(el(`div.card.insight-card.${toneClass(ins.tone)}`,
        el('div.insight-head', el('span.insight-icon', null, ins.icon), el('span', null, ins.title)),
        el('div.insight-text', null, rich(ins.text)),
      ));
    }
    root.appendChild(grid);
  }

  /* ---------- details grid ---------- */
  const n = s.now;
  root.appendChild(sectionTitle(t('sec_detail')));
  root.appendChild(statTiles([
    [`${Math.round(n.humidity ?? 0)}%`, t('humidity')],
    [wind(n.wind, units), `${t('wind')} ${n.wind_dir != null ? compass(n.wind_dir) : ''}`],
    [n.gusts != null ? wind(n.gusts, units) : '—', t('gusts')],
    [`${n.uv != null ? Math.round(n.uv * 10) / 10 : '—'}`, `${t('uv')} · ${n.uvLabel ?? ''}`],
    [visibility(n.visibility), t('visibility')],
    [n.pressure != null ? `${Math.round(n.pressure)} hPa` : '—', t('pressure')],
    [n.dew != null ? temp(n.dew) : '—', t('dew_point')],
    [`${n.cloud != null ? Math.round(n.cloud) : '—'}%`, t('cloud_cover')],
  ]));

  /* ---------- AQI + sun row ---------- */
  const sun = s.sun;
  const row = el('div.row-2');
  row.appendChild(aqiCardV2(s));

  const fmt = (iso) => (iso ? iso.slice(11, 16) : '—');
  const imd = s.bundle?.imd;
  const sunCard = card(
    el('div.card-h', null, `${t('sec_sun')}${imd?.ok ? ' · IMD' : ''}`),
    kvList([
      [`🌅 ${t('sunrise')}`, fmt(sun?.sunrise)],
      [`🌇 ${t('sunset')}`, fmt(sun?.sunset)],
      [`⏳ ${t('day_length')}`, sun?.dayLength ?? '—'],
      ...(imd?.ok && imd.obs?.moonrise ? [['🌙 ' + t('moonrise'), imd.obs.moonrise]] : []),
      ...(imd?.ok && imd.obs?.moonset ? [['🌙 ' + t('moonset'), imd.obs.moonset]] : []),
    ]),
  );
  row.appendChild(sunCard);
  root.appendChild(row);

  /* ---------- sea & coast (only where marine data exists) ---------- */
  const marine = s.extras?.marine;
  if (marine?.now?.waveHeightM != null) {
    root.appendChild(sectionTitle(`🌊 ${t('sec_coast')}`));
    const wave = marine.now.waveHeightM;
    root.appendChild(card(
      el('div.kv-list',
        el('div.kv-row', el('span.kv-label', null, '🌊 Waves now'), el('span.kv-value', null, `${Math.round(wave * 10) / 10} m · ${Math.round(marine.now.wavePeriodS ?? 0)} s`)),
        ...marine.days.slice(0, 3).map((d) =>
          el('div.kv-row',
            el('span.kv-label', null, dateLabel(d.date)),
            el('span.kv-value', null, d.waveMaxM != null ? `max ${Math.round(d.waveMaxM * 10) / 10} m` : '—'))),
      ),
    ));
  }

  /* ---------- river watch (only when abnormal) ---------- */
  const flood = s.extras?.flood;
  if (flood?.peak && flood.peak.ratio >= 1.5) {
    root.appendChild(sectionTitle(`🏞️ ${t('sec_flood')}`));
    const ratio = Math.round(flood.peak.ratio * 10) / 10;
    root.appendChild(el(`div.alert.alert-${flood.peak.ratio >= 3 ? 'danger' : 'warn'}.dash-alert`,
      { role: 'alert' },
      el('div.alert-title', null, `🏞️ River flow ${ratio}× normal`),
      el('div', null, `Peak around ${dateLabel(flood.peak.date)} — ${Math.round(flood.peak.discharge)} m³/s vs usual ${Math.round(flood.peak.mean)} m³/s. People near the river: stay alert, follow local administration.`),
    ));
  }

  /* ---------- IMD enrichment ---------- */
  if (imd?.ok) {
    root.appendChild(sectionTitle(t('sec_imd')));
    root.appendChild(card(
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
    ));
  }

  /* ---------- personalisation nudge ---------- */
  if (!profile && !store.flags.get('nudgeDismissed')) {
    root.appendChild(el('div.card.nudge-card',
      el('div.nudge-text',
        el('div.nudge-title', null, `✨ ${t('nudge_title')}`),
        el('div.nudge-sub', null, t('nudge_sub')),
      ),
      el('div.nudge-actions',
        el('button.btn.btn-primary', { onclick: () => ctx.openYou?.() }, t('nudge_cta')),
        el('button.btn', { onclick: () => { store.flags.set('nudgeDismissed', true); ctx.rerender?.(); } }, t('nudge_skip')),
      ),
    ));
  }
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
