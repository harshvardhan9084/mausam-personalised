/**
 * dashboards/commuter.js — Commuter dashboard.
 * Answer: "What will the road actually be like at MY travel hours?"
 * Weather-driven only (visibility, rain, fog, wind) — no invented traffic data.
 */

import { el } from '../../utils/dom.js';
import { visibility, wind } from '../../utils/format.js';
import { hero, sectionTitle, card, kvList, alert, hourlyStrip, scoredHourCard, statTiles, footerNote } from '../shared.js';
import { commuterAdvisory } from '../../core/engine.js';

function commuteBlock(title, c) {
  if (!c) {
    return card(
      el('div.commute-time-label', null, title),
      el('div', { style: { color: 'var(--muted)', fontSize: '0.86rem', padding: '10px 0' } }, 'Outside the forecast range for today.')
    );
  }
  return el(
    'div.commute-block',
    null,
    el('div.commute-time-label', null, title),
    el('div.commute-status', { style: { color: c.band.color } }, `${c.band.label} — score ${c.score}/100`),
    kvList([
      ['Window', c.time],
      ['Visibility', visibility(c.visibility)],
      ['Rain risk', `${Math.round(c.rainRisk)}%`],
      ['Wind gusts', wind(c.gusts, 'metric')],
      ['Getting around', el('span', { style: { color: 'var(--accent)' } }, c.mode)],
    ])
  );
}

export function renderCommuter(root, snapshot, units) {
  const c = commuterAdvisory(snapshot);
  const s = snapshot;

  root.appendChild(
    hero(
      `🚗 Road conditions right now — ${s.locationLabel || 'your location'}`,
      el('div.hero-big', { style: { color: c.nowBand.color } }, `${c.nowBand.label} — ${c.scored[0]?.score ?? '—'}/100`),
      `${s.now.wx.label} · visibility ${visibility(s.hours[0]?.visibility)} · rain risk ${Math.round(s.hours[0]?.precipitation_probability ?? 0)}%`
    )
  );

  /* fog tonight */
  if (c.tonightFog) {
    root.appendChild(
      alert('warn',
        `🌫️ Fog expected around ${c.tonightFog.time.slice(11, 16)} — visibility could fall to `,
        el('strong', null, `${visibility(c.tonightFog.visibility)}`),
        '. Plan earlier departures and use low-beam headlights.'
      )
    );
  }

  /* commute windows */
  root.appendChild(sectionTitle('Your commute windows today'));
  root.appendChild(el('div.row-2', null, commuteBlock('☀️ Morning (07:00–09:59)', c.morning), commuteBlock('🌇 Evening (17:00–19:59)', c.evening)));

  /* hourly road score */
  root.appendChild(sectionTitle('Hourly road score — next 24 hours'));
  root.appendChild(
    hourlyStrip(c.scored.slice(0, 24), (h) =>
      scoredHourCard(h, {
        value: `${h.score}`,
        sub: h.visibility != null && h.visibility < 4000 ? 'foggy' : `${Math.round(h.precipitation_probability ?? 0)}% 💧`,
        title: `Road score ${h.score}/100 — ${h.band?.label ?? ''}`,
      })
    )
  );

  /* at a glance */
  root.appendChild(sectionTitle('Weather at a glance'));
  root.appendChild(
    statTiles([
      [`${Math.round(s.now.temp ?? 0)}°C`, `Feels ${Math.round(s.now.feels ?? 0)}°C`],
      [`${Math.round(s.now.humidity ?? 0)}%`, 'Humidity'],
      [s.currentAqi.aqi != null ? `${s.currentAqi.aqi}` : '—', s.currentAqi.aqi != null ? `AQI ${s.currentAqi.category}` : 'AQI n/a', s.currentAqi.color],
      [wind(s.now.wind, units), 'Wind now'],
    ])
  );

  if (s.currentAqi.aqi != null && s.currentAqi.aqi >= 200) {
    root.appendChild(alert('warn', `😷 CPCB AQI ${s.currentAqi.aqi} (${s.currentAqi.category}). Consider a mask on two-wheelers and keep windows up in traffic.`));
  }

  root.appendChild(footerNote());
}
