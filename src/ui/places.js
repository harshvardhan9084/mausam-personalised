/**
 * places.js — "Your places" rail: the cities the user visits, one tap away.
 *
 * Real weather products remember your places. Mausam auto-remembers every
 * location you pick (searched or GPS), shows them as chips with live
 * temperature, lets you switch with one tap and forget with one tap.
 * Temps are fetched lazily, in parallel, with an in-memory TTL cache so
 * re-renders never refetch.
 */

import { el, clear } from '../utils/dom.js';
import { temp as fmtTemp } from '../utils/format.js';
import { describeWeather } from '../api/wmo.js';
import { store } from '../core/storage.js';
import { t } from '../core/i18n.js';

/* ---------------- live mini-temps (lazy + cached) ---------------- */

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const TTL = 10 * 60 * 1000; // 10 min
const cache = new Map(); // "lat,lon" -> {at, temp, code, isDay}

// Tiny one-shot JSON getter (no retries — chips degrade to "—" gracefully)
function getJSONMini(url) {
  return fetch(url).then((res) => {
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  });
}

/**
 * Kick off (or reuse) the probe for one place; returns a promise resolving
 * to {temp, code, isDay}. Literal commas in the list param — the forecast
 * API rejects %2C-encoded lists.
 */
function probe(place) {
  const key = `${place.lat.toFixed(2)},${place.lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit);
  const p = getJSONMini(
    `${FORECAST_URL}?latitude=${place.lat}&longitude=${place.lon}` +
    '&current=temperature_2m,weather_code,is_day&timezone=auto&forecast_days=1'
  )
    .then((j) => {
      const out = {
        at: Date.now(),
        temp: j?.current?.temperature_2m ?? null,
        code: j?.current?.weather_code ?? null,
        isDay: j?.current?.is_day === 1,
      };
      cache.set(key, out);
      return out;
    })
    .catch(() => ({ at: Date.now(), temp: null, code: null, isDay: true }));
  cache.set(key, p);
  return p;
}

/* ---------------- remember places ---------------- */

/** Auto-remember a place the user chose (dedupe by ~0.05°, cap 8). */
export function rememberPlace(loc) {
  if (!loc || loc.lat == null) return;
  const list = store.destinations.get().filter(
    (d) => Math.abs(d.lat - loc.lat) >= 0.05 || Math.abs(d.lon - loc.lon) >= 0.05
  );
  list.unshift({
    name: loc.name,
    admin1: loc.admin1 ?? '',
    country: loc.country ?? '',
    lat: loc.lat,
    lon: loc.lon,
  });
  store.destinations.set(list.slice(0, 8));
}

/* ---------------- the rail ---------------- */

/**
 * Render the places rail into `mount`.
 * @param {HTMLElement} mount
 * @param {Object} ctx {current, units, onSelect(loc), onAdd(), onForget(i), isCurrent(place)}
 */
export function renderPlaces(mount, ctx) {
  clear(mount);
  const saved = store.destinations.get();
  if (!saved.length && !ctx.current) return;

  const rail = el('div.places-rail', { role: 'list', 'aria-label': t('sec_places') });

  // current place chip first
  const cur = ctx.current;
  const curChip = el('button.place-chip.place-current', {
    type: 'button', role: 'listitem',
    title: [cur?.admin1, cur?.country].filter(Boolean).join(', '),
    onclick: () => {}, // already there
  },
    el('span.place-dot', { 'aria-hidden': 'true' }),
    el('span.place-name', null, cur?.name ?? '—'),
    el('span.place-temp', { 'data-keep': '1' }, '…'),
  );
  rail.appendChild(curChip);
  if (cur) {
    probe(cur).then((r) => {
      const t = curChip.querySelector('.place-temp');
      if (t && r.temp != null) t.textContent = fmtTemp(r.temp, ctx.units);
      else if (t) t.textContent = '';
    });
  }

  saved.forEach((p, i) => {
    const isCurrent = Math.abs(p.lat - (cur?.lat ?? 999)) < 0.05 && Math.abs(p.lon - (cur?.lon ?? 999)) < 0.05;
    if (isCurrent) return;
    const chip = el('div.place-chip-wrap', { role: 'listitem' },
      el('button.place-chip', {
        type: 'button',
        title: [p.admin1, p.country].filter(Boolean).join(', '),
        onclick: () => ctx.onSelect?.(p),
      },
        el('span.place-name', null, p.name),
        el('span.place-temp', null, '…'),
      ),
      el('button.place-forget', {
        type: 'button', 'aria-label': `Forget ${p.name}`, title: `Forget ${p.name}`,
        onclick: (e) => { e.stopPropagation(); ctx.onForget?.(i); },
      }, '✕'),
    );
    rail.appendChild(chip);
    probe(p).then((r) => {
      const t = chip.querySelector('.place-temp');
      if (t && r.temp != null) {
        t.textContent = fmtTemp(r.temp, ctx.units);
        t.title = describeWeather(r.code, !r.isDay)?.label ?? '';
      } else if (t) t.textContent = '';
    });
  });

  // add-place chip
  rail.appendChild(el('button.place-chip.place-add', {
    type: 'button', role: 'listitem', 'aria-label': 'Add a place',
    onclick: () => ctx.onAdd?.(),
  }, t('add_place')));

  mount.appendChild(rail);
}
