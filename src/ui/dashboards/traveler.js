/**
 * dashboards/traveler.js — Traveler dashboard.
 * Answer: "What should I pack, when should I go, and how do my saved
 * destinations compare right now?" Destinations are LIVE-fetched.
 */

import { el, clear } from '../../utils/dom.js';
import { temp } from '../../utils/format.js';
import { describeWeather } from '../../api/wmo.js';
import { fetchWeatherBundle, geocodeSearch } from '../../api/open-meteo.js';
import { computeCPCBAqi } from '../../core/aqi-cpcb.js';
import { store } from '../../core/storage.js';
import { hero, sectionTitle, card, alert, hourlyStrip, scoredHourCard, weekGrid, simpleWeekCell, footerNote, scoreColor } from '../shared.js';
import { travelerAdvisory } from '../../core/engine.js';

export function renderTraveler(root, snapshot, units, ctx) {
  const a = travelerAdvisory(snapshot);
  const s = snapshot;

  root.appendChild(
    hero(
      `✈️ Travel outlook — ${s.locationLabel || 'your location'}`,
      el('div.hero-big', null, `Best day this week: ${a.best.label} (${a.best.date.slice(5)})`),
      el('div.hero-sub', null, `${a.best.wx.label} · ${temp(a.best.temp_min, units)}–${temp(a.best.temp_max, units)} · rain ${Math.round(a.best.precip_prob_max ?? 0)}% · score ${a.best.score}/100`)
    )
  );

  /* worst day warning */
  if (a.worst.score < 45) {
    root.appendChild(
      alert('warn', `⚠️ Avoid ${a.worst.label} — ${a.worst.wx.label}, rain ${Math.round(a.worst.precip_prob_max ?? 0)}%, score only ${a.worst.score}/100.`)
    );
  }

  /* packing list */
  root.appendChild(sectionTitle('Packing checklist — generated from this week\u2019s forecast'));
  root.appendChild(
    card(
      el('div.kv-list', null,
        a.packing.map(([icon, item, why]) =>
          el('div.kv-row', null,
            el('span.kv-label', null, `${icon} ${item}`),
            el('span.kv-value', { style: { color: 'var(--muted)' } }, why)
          )
        )
      )
    )
  );

  /* destinations */
  root.appendChild(sectionTitle('Saved destinations — live weather', true));
  const destSection = el('div', null);
  root.appendChild(destSection);
  renderDestinations(destSection, units, ctx);

  /* add-destination hint */
  root.appendChild(
    el('div', { style: { marginBottom: '20px', fontSize: '0.8rem', color: 'var(--muted)' } },
      'Tap the city name in the header to search anywhere in the world, then come back — the comparison refreshes automatically.')
  );

  /* hourly rain */
  root.appendChild(sectionTitle('Hourly rain risk — plan your departure'));
  root.appendChild(
    hourlyStrip(a.scored.slice(0, 24), (h) =>
      scoredHourCard(h, {
        value: `${Math.round(h.precipitation_probability ?? 0)}%`,
        sub: temp(h.temperature_2m, units),
        title: `${h.wx.label} — rain ${Math.round(h.precipitation_probability ?? 0)}%`,
      })
    )
  );

  /* week grid */
  root.appendChild(sectionTitle('7-day forecast'));
  root.appendChild(weekGrid(s.days, (d, i) => {
    const cell = simpleWeekCell(d, i, units);
    cell.appendChild(el('div.w-score', { style: { color: scoreColor(d.score) } }, `${d.score}/100`));
    return cell;
  }));

  root.appendChild(footerNote());
}

/* ---------- live destination cards ---------- */

function destinationSearchBox(ctx) {
  const input = el('input.search-input', {
    type: 'search',
    placeholder: 'Add a destination — e.g. Shimla, Jaipur…',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'Add a destination to compare',
    style: { marginBottom: '0' },
  });
  const results = el('div.search-results', { style: { position: 'static', boxShadow: 'none', marginTop: '6px', display: 'none' } });

  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 2) {
        results.style.display = 'none';
        return;
      }
      clear(results).style.display = 'block';
      results.appendChild(el('div.search-empty', null, 'Searching…'));
      try {
        const found = await geocodeSearch(q);
        clear(results);
        if (!found.length) {
          results.appendChild(el('div.search-empty', null, `No places found for “${q}”`));
          return;
        }
        for (const r of found) {
          results.appendChild(
            el('button.search-result', {
              type: 'button',
              onclick: () => {
                store.destinations.add({ name: r.name, admin1: r.admin1, country: r.country, lat: r.latitude, lon: r.longitude });
                ctx.rerender();
              },
            },
            el('span.result-name', null, r.name),
            el('span.result-sub', null, [r.admin1, r.country].filter(Boolean).join(', '))
            )
          );
        }
      } catch {
        clear(results).appendChild(el('div.search-empty', null, 'Search failed — check connection'));
      }
    }, 300);
  });

  return el('div', { style: { maxWidth: '440px', marginBottom: '22px' } },
    el('div.search-wrap', { style: { marginBottom: '0' } }, el('span.search-icon', { 'aria-hidden': 'true' }, '🔍'), input),
    results
  );
}

async function renderDestinations(container, units, ctx) {
  clear(container).appendChild(el('div.search-empty', null, 'Loading destinations…'));
  const destinations = store.destinations.get();

  clear(container);
  if (!destinations.length) {
    container.appendChild(
      el('div.state-card', { style: { padding: '24px 16px' } },
        el('div.state-icon', null, '🗺️'),
        el('div.state-title', null, 'No saved destinations yet'),
        el('div.state-sub', null, 'Add cities below and Mausam fetches their live conditions for side-by-side comparison.')
      )
    );
  } else {
    const grid = el('div.dest-grid');
    container.appendChild(grid);
    await Promise.all(
      destinations.map(async (dest, i) => {
        let inner;
        try {
          const bundle = await fetchWeatherBundle(dest.lat, dest.lon);
          const now = bundle.current;
          const wx = describeWeather(now.weather_code, now.is_day !== 1);
          const today = bundle.days[0];
          const rain = today?.precip_prob_max ?? 0;
          store.bundle.set(dest.lat, dest.lon, bundle);

          let alertLine = null;
          if (rain >= 70) alertLine = ['⚠️', `Rain ${rain}% — pack rain gear`, 'var(--yellow)'];
          else if ((today?.temp_max ?? 0) >= 42) alertLine = ['⚠️', `Extreme heat ${Math.round(today.temp_max)}°C`, 'var(--red)'];
          else if ((today?.temp_min ?? 99) <= 4) alertLine = ['⚠️', `Cold ${Math.round(today.temp_min)}°C`, 'var(--sky)'];

          inner = el('div',
            null,
            el('div.dest-name', null, `📍 ${dest.name}`),
            el('div.dest-temp', null, temp(now.temperature_2m, units)),
            el('div.dest-cond', null, `${wx.label} · rain ${rain}%`),
            el('div.dest-alert', { style: { color: alertLine ? alertLine[2] : 'var(--green)' } }, alertLine ? `${alertLine[0]} ${alertLine[1]}` : '✅ No alerts')
          );
        } catch {
          inner = el('div',
            null,
            el('div.dest-name', null, `📍 ${dest.name}`),
            el('div.dest-cond', { style: { marginTop: '8px' } }, 'Could not load — offline?')
          );
        }

        grid.appendChild(
          el('div.dest-card', null, inner,
            el('button.dest-remove', {
              title: 'Remove',
              'aria-label': `Remove ${dest.name}`,
              onclick: () => {
                store.destinations.removeAt(i);
                ctx.rerender();
              },
            }, '✕')
          )
        );
      })
    );
  }

  container.appendChild(
    el('div', null,
      el('div.sec-title', { style: { marginBottom: '8px' } }, '➕ Add a destination'),
      destinationSearchBox(ctx)
    )
  );
}
