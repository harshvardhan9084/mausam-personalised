/**
 * explore.js — two keyless tools that ride on the places rail (v0.6):
 *
 *  ⚖ Compare   — current temp / next-24 h rain / CPCB AQI for every saved
 *                place side by side, with quick verdicts (coolest, driest,
 *                cleanest). Free Open-Meteo forecast + air-quality calls,
 *                parallel, cached per session.
 *  🧳 Journey  — the sky along a route: origin → destination sampled into
 *                ~6 points, each probed for hourly conditions at the chosen
 *                departure, with a plain-language verdict.
 *
 * Both are plain modals — no page chrome, mobile-first, degraded data
 * shown as "—" instead of errors.
 */

import { el, clear, trapFocus } from '../utils/dom.js';
import { geocodeSearch } from '../api/open-meteo.js';
import { describeWeather } from '../api/wmo.js';
import { computeCPCBAqi } from '../core/aqi-cpcb.js';
import { temp as fmtTemp, wind as fmtWind } from '../utils/format.js';
import { t, getLang } from '../core/i18n.js';
import { icon, tipIcon } from './icons.js';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

/* ---------------- tiny fetchers ---------------- */

function miniJSON(url, signal) {
  return fetch(url, { signal }).then((res) => {
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  });
}

/** Current + next-24h summary for one place. */
function probePlace(place, signal) {
  const url =
    `${FORECAST_URL}?latitude=${place.lat}&longitude=${place.lon}` +
    '&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m' +
    '&hourly=temperature_2m,precipitation_probability,weather_code&forecast_days=2' +
    '&timezone=auto';
  return miniJSON(url, signal).then((j) => {
    const cur = j?.current ?? {};
    const hours = j?.hourly?.time ?? [];
    const pops = j?.hourly?.precipitation_probability ?? [];
    const now = Date.now();
    let idx = hours.findIndex((h) => new Date(h).getTime() >= now - 3600000);
    if (idx < 0) idx = 0;
    const next24 = pops.slice(idx, idx + 24).filter((v) => v != null);
    return {
      temp: cur.temperature_2m ?? null,
      feels: cur.apparent_temperature ?? null,
      code: cur.weather_code ?? 0,
      isDay: cur.is_day !== 0,
      wind: cur.wind_speed_10m ?? null,
      popMax24: next24.length ? Math.max(...next24) : null,
      hourlyFrom: idx,
      times: hours,
      tempsH: j?.hourly?.temperature_2m ?? [],
    };
  });
}

/** CPCB AQI (from PM2.5/PM10) for one place. */
function probeAqi(place, signal) {
  const url = `${AIR_URL}?latitude=${place.lat}&longitude=${place.lon}&current=pm2_5,pm10&timezone=auto`;
  return miniJSON(url, signal).then((j) => {
    const pm25 = j?.current?.pm2_5;
    const pm10 = j?.current?.pm10;
    if (pm25 == null && pm10 == null) return null;
    const aqi = computeCPCBAqi({ pm25, pm10 });
    return aqi?.aqi ?? null;
  }).catch(() => null);
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ---------------- shared modal plumbing ---------------- */

function buildModal(title, onclose) {
  const overlay = el('div.modal-overlay.active', { role: 'dialog', 'aria-modal': 'true' });
  const focusCtl = trapFocus(overlay);
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  const close = () => {
    document.removeEventListener('keydown', onEsc);
    focusCtl.closeFocus();
    try { onclose?.(); } catch { /* ignore */ }
    overlay.remove();
  };
  document.addEventListener('keydown', onEsc);
  const box = el('div.modal-box.explore-box',
    el('div.modal-header',
      el('span.modal-title', null, title),
      el('button.modal-close', { type: 'button', 'aria-label': 'Close', onclick: close }, '✕'),
    ),
  );
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  // production nicety: land focus on the modal's own text field when it has one
  requestAnimationFrame(() => {
    box.querySelector('input[type="search"], input[type="text"]')?.focus();
  });
  return { overlay, box, close };
}

/** Debounced place search row → onPick(place). */
function searchRow(box, onPick, placeholder, signalCtl) {
  const results = el('div.explore-results');
  const wrap = el('div.search-wrap',
    el('span.search-icon', { 'aria-hidden': 'true' }, '🔍'),
    el('input.search-input', {
      type: 'search', placeholder, autocomplete: 'off', spellcheck: 'false',
      'aria-label': placeholder,
      oninput: (e) => {
        const q = e.target.value.trim();
        clearTimeout(wrap._tm);
        if (q.length < 2) { clear(results); return; }
        wrap._tm = setTimeout(async () => {
          clear(results).appendChild(el('div.explore-searching', null, t('searching')));
          try {
            const hits = await geocodeSearch(q, signalCtl?.signal);
            clear(results);
            if (!hits?.length) { results.appendChild(el('div.explore-searching', null, t('no_results'))); return; }
            for (const h of hits.slice(0, 5)) {
              results.appendChild(el('button.explore-hit', {
                type: 'button',
                onclick: () => { e.target.value = ''; clear(results); onPick(h); },
              }, `${h.name}${h.admin1 ? `, ${h.admin1}` : ''}`));
            }
          } catch {
            clear(results).appendChild(el('div.explore-searching', null, t('search_fail')));
          }
        }, 350);
      },
    }),
  );
  box.appendChild(wrap);
  box.appendChild(results);
  return { wrap, results };
}

/** Normalise a geocode hit OR a saved place into {name, admin1, country, lat, lon}. */
function normPlace(h) {
  return {
    name: h.name,
    admin1: h.admin1 ?? '',
    country: h.country ?? '',
    lat: h.lat ?? h.latitude,
    lon: h.lon ?? h.longitude,
  };
}

/* ================================================================
   ⚖ COMPARE
================================================================ */

const cmpCache = new Map(); // "lat,lon" -> {at, data}
const CMP_TTL = 10 * 60 * 1000;

function cmpKey(p) { return `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`; }

async function getPlaceData(p, signal) {
  const key = cmpKey(p);
  const hit = cmpCache.get(key);
  if (hit && Date.now() - hit.at < CMP_TTL) return hit.data;
  const [wx, aqi] = await Promise.all([probePlace(p, signal), probeAqi(p, signal)]);
  const data = { wx, aqi };
  cmpCache.set(key, { at: Date.now(), data });
  return data;
}

/**
 * @param {Object} ctx {location, units}
 */
export function openCompare(ctx) {
  const ctl = new AbortController();
  const { overlay, box } = buildModal(t('cmp_title'), () => ctl.abort());
  const added = []; // session-only extra places from search
  const listWrap = el('div.cmp-list');
  const verdict = el('div.cmp-verdict');
  const units = ctx?.units ?? 'metric';

  function currentList() {
    const all = [];
    if (ctx?.location) all.push(ctx.location);
    for (const p of added) all.push(p);
    // dedupe by ~0.05°
    return all.filter((p, i) => !all.slice(0, i).some((q) => Math.abs(q.lat - p.lat) < 0.05 && Math.abs(q.lon - p.lon) < 0.05)).slice(0, 8);
  }

  function rowFor(p, data, isCurrent) {
    const wx = data?.wx;
    const cond = wx ? describeWeather(wx.code, !wx.isDay) : null;
    return el('div.cmp-row',
      el('div.cmp-place',
        el('span.cmp-dot', { class: isCurrent ? 'is-current' : '' }),
        el('div.cmp-names',
          el('span.cmp-name', null, p.name),
          el('span.cmp-sub', null, [p.admin1, p.country].filter(Boolean).join(', ')),
        ),
      ),
      el('div.cmp-temp', null,
        el('b', null, wx?.temp != null ? fmtTemp(wx.temp, units) : '—'),
        el('span.cmp-cond', null, `${cond?.icon ?? ''} ${cond?.label ?? ''}`.trim() || '—'),
        el('span.cmp-feels', null, wx?.feels != null ? `${t('feels_like')} ${fmtTemp(wx.feels, units)}` : ''),
      ),
      el('div.cmp-cell',
        el('span.cmp-k', null, t('cmp_rain24')),
        el('span.cmp-v', null, wx?.popMax24 != null ? `${wx.popMax24}%` : '—'),
      ),
      el('div.cmp-cell',
        el('span.cmp-k', null, t('cmp_aqi')),
        el('span.cmp-v', { class: aqiToneClass(data?.aqi) }, data?.aqi != null ? String(data.aqi) : '—'),
      ),
    );
  }

  async function refresh() {
    clear(listWrap).appendChild(el('div.explore-searching', null, t('searching')));
    const list = currentList();
    const datas = await Promise.all(list.map((p) => getPlaceData(p, ctl.signal).catch(() => null)));
    clear(listWrap);
    list.forEach((p, i) => listWrap.appendChild(rowFor(p, datas[i], i === 0)));

    // verdicts
    clear(verdict);
    const withData = list.map((p, i) => ({ p, d: datas[i] })).filter((x) => x.d?.wx?.temp != null);
    if (withData.length >= 2) {
      const coolest = withData.reduce((a, b) => (b.d.wx.temp < a.d.wx.temp ? b : a));
      verdict.appendChild(el('span.cmp-verdict-pill', null, icon('thermo', 'pill-ico'), ` ${t('cmp_verdict_cooler', { c: coolest.p.name })}`));
      const driest = withData.filter((x) => x.d.wx.popMax24 != null).reduce((a, b) => ((b.d.wx.popMax24 ?? 100) < (a.d.wx.popMax24 ?? 100) ? b : a), withData[0]);
      if (driest?.d?.wx?.popMax24 != null) {
        verdict.appendChild(el('span.cmp-verdict-pill', null, tipIcon('sun', 'pill-ico'), ` ${t('cmp_verdict_drier', { c: driest.p.name })}`));
      }
      const clean = withData.filter((x) => x.d?.aqi != null).reduce((a, b) => (b.d.aqi < a.d.aqi ? b : a), withData.find((x) => x.d?.aqi != null));
      if (clean?.d?.aqi != null) {
        verdict.appendChild(el('span.cmp-verdict-pill', null, icon('wind', 'pill-ico'), ` ${t('cmp_verdict_cleaner', { c: clean.p.name })}`));
      }
    }
  }

  box.appendChild(verdict);
  box.appendChild(listWrap);

  const addRow = el('div.cmp-add-row');
  box.appendChild(addRow);
  searchRow(addRow, (h) => {
    added.push(normPlace(h));
    addRow.querySelector('.explore-results')?.replaceChildren();
    refresh();
  }, t('cmp_add_ph'), ctl);

  if (!currentList().length) {
    clear(listWrap).appendChild(el('div.explore-searching', null, t('cmp_empty')));
    box.querySelector('input')?.focus();
  } else {
    refresh();
  }
}

function aqiToneClass(aqi) {
  if (aqi == null) return '';
  if (aqi <= 100) return 'aqi-ok';
  if (aqi <= 200) return 'aqi-mid';
  if (aqi <= 300) return 'aqi-bad';
  return 'aqi-severe';
}

/* ================================================================
   🧳 JOURNEY
================================================================ */

/**
 * @param {Object} ctx {location (origin), units}
 */
export function openJourney(ctx) {
  const ctl = new AbortController();
  const { overlay, box } = buildModal(t('jny_title'), () => ctl.abort());
  const units = ctx?.units ?? 'metric';

  let from = ctx?.location ?? null;
  let to = null;
  let depart = 'now';

  const fromBtn = el('button.explore-from', { type: 'button', onclick: () => searchFrom() },
    `${t('jny_from')}: ${from ? `📍 ${from.name}` : t('jny_pick_from')}`);
  const toBtn = el('button.explore-from', { type: 'button', onclick: () => searchTo() },
    `${t('jny_to')}: ${to ? `📍 ${to.name}` : t('jny_empty_to')}`);

  const depSeg = el('div.set-seg.dep-seg',
    ['now', '3h', 'morning', 'evening'].map((k) =>
      el(`button.chip${depart === k ? '.on' : ''}`, {
        type: 'button', dataset: { dep: k },
        onclick: (e) => {
          depart = k;
          depSeg.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.dep === k));
        },
      }, t(`jny_${k === '3h' ? '3h' : k}`)),
    ),
  );

  const goBtn = el('button.btn.btn-primary.btn-lg', { type: 'button', onclick: () => run() }, `🛣 ${t('jny_go')}`);
  const out = el('div.jny-out');

  function searchFrom() {
    const slot = el('div.jny-search');
    fromBtn.after(slot);
    searchRow(slot, (h) => {
      from = normPlace(h);
      fromBtn.textContent = `${t('jny_from')}: 📍 ${from.name}`;
      slot.remove();
    }, t('jny_pick_from'), ctl);
  }
  function searchTo() {
    const slot = el('div.jny-search');
    toBtn.after(slot);
    searchRow(slot, (h) => {
      to = normPlace(h);
      toBtn.textContent = `${t('jny_to')}: 📍 ${to.name}`;
      toBtn.classList.remove('hint');
      slot.remove();
    }, t('jny_empty_to'), ctl);
  }

  box.append(fromBtn, toBtn, el('div.cmp-add-row'),
    el('div.set-label', null, t('jny_depart')), depSeg, goBtn, out);

  function departTarget(extraH = 0) {
    const now = new Date();
    if (depart === 'now') return { target: now.getTime() + extraH * 3600000, label: t('jny_now') };
    if (depart === '3h') return { target: now.getTime() + 3 * 3600000 + extraH * 3600000, label: t('jny_3h') };
    const d = new Date(now); d.setDate(d.getDate() + 1); d.setMinutes(0, 0, 0);
    if (depart === 'morning') { d.setHours(8); return { target: d.getTime() + extraH * 3600000, label: t('jny_morning') }; }
    d.setHours(18); return { target: d.getTime() + extraH * 3600000, label: t('jny_evening') };
  }

  async function run() {
    if (!from || !to) { toBtn.classList.add('hint'); return; }
    clear(out).appendChild(el('div.explore-searching', null, t('jny_calculating')));
    const km = haversineKm(from, to);
    const durH = Math.max(1, Math.min(14, km / 45)); // tier-2 road average
    const N = Math.min(6, Math.max(4, Math.round(km / 150) + 4));
    const points = [];
    for (let i = 0; i < N; i++) {
      const f = i / (N - 1);
      points.push({
        f,
        lat: from.lat + (to.lat - from.lat) * f,
        lon: from.lon + (to.lon - from.lon) * f,
        km: Math.round(km * f),
      });
    }

    const probes = await Promise.all(points.map(async (pt) => {
      const url =
        `${FORECAST_URL}?latitude=${pt.lat.toFixed(3)}&longitude=${pt.lon.toFixed(3)}` +
        '&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m' +
        `&forecast_days=7&timezone=auto`;
      try {
        const j = await miniJSON(url, ctl.signal);
        const times = j?.hourly?.time ?? [];
        // nearest hourly slot to (departure + journey progress)
        const { target } = departTarget(pt.f * durH);
        let idx = 0, best = Infinity;
        for (let i = 0; i < times.length; i++) {
          const d = Math.abs(new Date(times[i]).getTime() - target);
          if (d < best) { best = d; idx = i; }
        }
        return {
          ...pt,
          at: times[idx],
          temp: j?.hourly?.temperature_2m?.[idx] ?? null,
          pop: j?.hourly?.precipitation_probability?.[idx] ?? null,
          code: j?.hourly?.weather_code?.[idx] ?? 0,
          wind: j?.hourly?.wind_speed_10m?.[idx] ?? null,
        };
      } catch {
        return { ...pt, at: null, temp: null, pop: null, code: 0, wind: null };
      }
    }));

    clear(out);
    const depLabel = departTarget(0).label;
    out.appendChild(el('div.jny-headline',
      el('b', null, `📍 ${from.name} → ${to.name}`),
      el('span.jny-km', null, `· ~${Math.round(km)} km · ${depLabel}${durH >= 1 ? ` · ${t('jny_eta')} ~${durH.toFixed(0)} h` : ''}`),
    ));

    const rows = el('div.jny-rows');
    for (const p of probes) {
      const cond = describeWeather(p.code, false);
      const mark = p.f === 0 ? '🚩' : p.f === 1 ? '🏁' : '📍';
      rows.appendChild(el('div.jny-row',
        el('span.jny-mark', null, mark),
        el('div.jny-place',
          el('b', null, p.f === 0 ? from.name : p.f === 1 ? to.name : `${Math.round(p.km)} km`),
          el('span.jny-cond', null, cond?.label ?? ''),
        ),
        el('div.jny-num',
          el('span', null, p.temp != null ? fmtTemp(p.temp, units) : '—'),
          el(`span.jny-pop${(p.pop ?? 0) >= 50 ? '.wet' : ''}`, null, p.pop != null ? `${p.pop}%` : '—'),
          el('span.jny-wind', null, p.wind != null ? fmtWind(p.wind, units) : '—'),
        ),
      ));
    }
    out.appendChild(rows);

    // verdict
    const pops = probes.map((p) => p.pop ?? 0);
    const worst = Math.max(...pops, 0);
    const worstIdx = pops.indexOf(worst);
    out.appendChild(el(`div.jny-verdict.${worst >= 70 ? 'bad' : worst >= 40 ? 'care' : 'ok'}`,
      el('b', null, tipIcon('rain', 'pill-ico'), ` ${t('jny_worst_rain', { p: worst })}`),
      el('span', null,
        worst >= 70 ? t('jny_verdict_bad')
          : worst >= 40 ? t('jny_verdict_care')
            : t('jny_verdict_ok')),
      worst >= 40 && probes[worstIdx] ? el('span.jny-where', null, `~ ${Math.round(probes[worstIdx].km)} km`) : null,
    ));
  }
}
