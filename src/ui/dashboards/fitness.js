/**
 * dashboards/fitness.js — Outdoor Fitness dashboard.
 * Answer: "WHEN should I train today, and what do I need?"
 */

import { el } from '../../utils/dom.js';
import { temp, hourLabel } from '../../utils/format.js';
import { hero, sectionTitle, card, statTiles, kvList, alert, hourlyStrip, scoredHourCard, weekGrid, simpleWeekCell, nowRow, aqiPill, footerNote, scoreColor } from '../shared.js';
import { fitnessAdvisory } from '../../core/engine.js';
import { computeCPCBAqi, uvLabel } from '../../core/aqi-cpcb.js';

export function renderFitness(root, snapshot, units) {
  const a = fitnessAdvisory(snapshot);
  const s = snapshot;

  /* hero: best run windows */
  const win1 = a.windows[0];
  const win2 = a.windows[1];
  root.appendChild(
    hero(
      `🏃 ${s.locationLabel || 'Your location'} — Best run windows`,
      el('div', null,
        win1
          ? el('div.hero-big', null, win1.slot)
          : el('div.hero-big', null, 'No good window in the next 24h'),
        win1
          ? el('div', { style: { marginBottom: '10px' } },
              el('span.badge', { style: { background: 'color-mix(in srgb, ' + win1.color + ' 18%, transparent)', color: win1.color } }, `${win1.rating} · ${win1.score}/100`),
              el('span', { style: { fontSize: '0.84rem', color: 'var(--muted)', marginLeft: '10px' } }, win1.reason)
            )
          : null,
        win2
          ? el('div', { style: { fontSize: '0.9rem' } },
              'Also good: ', el('strong', null, win2.slot), ' ',
              el('span.badge', { style: { background: 'color-mix(in srgb, ' + win2.color + ' 18%, transparent)', color: win2.color } }, `${win2.rating} · ${win2.score}/100`)
            )
          : null
      ),
      a.avoid ? el('div.hero-sub', { style: { marginTop: '8px', color: 'var(--red)' } }, `⛔ Avoid: ${a.avoid}`) : el('div.hero-sub', null, '✅ No prolonged unsafe stretch in the next 24 hours')
    )
  );

  /* air + heat alert */
  const aqi = s.currentAqi;
  if (aqi.aqi != null && aqi.aqi > 150) {
    root.appendChild(
      alert('danger',
        `😷 CPCB AQI ${aqi.aqi} (${aqi.category}, dominant ${aqi.dominant}). ${aqi.advice} `,
        el('strong', null, `Heat index ${s.now.hi}°C.`)
      )
    );
  } else if (s.now.hi >= 40) {
    root.appendChild(
      alert('warn', `🌡️ Heat index ${s.now.hi}°C — train early or indoors. `, el('strong', null, a.hydrationTips[1] ?? a.hydrationTips[0]))
    );
  } else if (aqi.aqi != null) {
    root.appendChild(alert('ok', `😷 Air quality: CPCB AQI ${aqi.aqi} (${aqi.category}). ${aqi.advice}`));
  }

  /* hourly run safety */
  root.appendChild(sectionTitle('Hourly run score — next 24 hours'));
  root.appendChild(
    hourlyStrip(a.scored.slice(0, 24), (h) =>
      scoredHourCard(h, {
        value: `${h.score}`,
        sub: `${temp(h.temperature_2m, units)}${h.aqi != null ? ` · ${h.aqi}` : ''}`,
        title: h.band ? `Run score ${h.score}/100 — ${h.band.label}` : '',
      })
    )
  );

  /* current conditions */
  root.appendChild(sectionTitle('Current conditions'));
  root.appendChild(
    statTiles([
      [temp(s.now.temp, units, true), 'Temperature'],
      [`${(s.uvNow.value ?? 0).toFixed(1)}`, `UV — ${s.uvNow.label}`],
      [s.currentAqi.aqi != null ? `${s.currentAqi.aqi}` : '—', s.currentAqi.aqi != null ? `AQI (${s.currentAqi.category})` : 'AQI n/a', s.currentAqi.color],
      [`${Math.round(s.now.wind ?? 0)} km/h`, 'Wind'],
    ])
  );

  /* gear + week */
  root.appendChild(
    el('div.row-2', null,
      card(
        el('div.sec-title', { style: { marginBottom: '8px' } }, 'Gear checklist — auto from conditions'),
        kvList(a.gear.map(([icon, item, why]) => [`${icon} ${item}`, why]))
      ),
      card(
        el('div.sec-title', { style: { marginBottom: '8px' } }, 'Best days this week'),
        ...a.weekBest.map((d) =>
          el('div', { style: { padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '0.87rem' } },
            `✅ ${d.day} `, el('span.badge.badge-green', null, `${d.score}/100`), el('div', { style: { color: 'var(--muted)', fontSize: '0.78rem', marginTop: '2px' } }, d.note)
          )
        ),
        el('div', { style: { paddingTop: '10px', fontSize: '0.78rem', color: 'var(--muted)' } },
          'Hydration: ', a.hydrationTips.join(' · '))
      )
    )
  );

  /* week grid */
  root.appendChild(sectionTitle('7-day outlook'));
  root.appendChild(weekGrid(s.days, (d, i) => {
    const cell = simpleWeekCell(d, i, units);
    cell.appendChild(el('div.w-score', { style: { color: scoreColor(d.score) } }, `${d.score}/100`));
    return cell;
  }));

  root.appendChild(footerNote());
}
