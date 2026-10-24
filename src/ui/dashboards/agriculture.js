/**
 * dashboards/agriculture.js — Agriculture dashboard.
 * Answer: "Should I irrigate, spray, or work the field today?"
 * Uses real soil moisture, precipitation sum and humidity from Open-Meteo.
 */

import { el } from '../../utils/dom.js';
import { hourLabel } from '../../utils/format.js';
import { hero, sectionTitle, card, statTiles, alert, hourlyStrip, scoredHourCard, footerNote } from '../shared.js';
import { agricultureAdvisory } from '../../core/engine.js';

export function renderAgriculture(root, snapshot, units) {
  const a = agricultureAdvisory(snapshot);
  const s = snapshot;

  root.appendChild(
    hero(
      `🌾 Farm advisory — ${s.locationLabel || 'your location'}`,
      el('div.hero-big', null, a.todayAction),
      el('div.hero-sub', null,
        `Soil moisture (0–1 cm): `, el('strong', { style: { color: a.soilStatus.color } }, a.soilStatus.label),
        ` · rain next 3 days: ${a.rain3.toFixed(1)} mm`
      )
    )
  );

  /* fungal alert */
  if (a.fungal) {
    root.appendChild(alert(a.fungal.cls, `🦠 ${a.fungal.level} fungal risk — ${a.fungal.text}`));
  }
  if (a.frost) {
    root.appendChild(alert('danger', '❄️ Frost risk this week — minimum temperature near 0–2°C. Protect sensitive crops.'));
  }

  /* soil & weather stats */
  root.appendChild(sectionTitle('Soil & weather now'));
  root.appendChild(
    statTiles([
      [a.soilPct != null ? `${a.soilPct}%` : '—', 'Soil moisture', a.soilStatus.color],
      [`${Math.round(s.now.humidity ?? 0)}%`, 'Air humidity'],
      [`${(s.hours[0]?.precipitation_probability ?? 0)}%`, 'Rain today'],
      [`${Math.round(s.now.temp ?? 0)}°C`, 'Temperature'],
    ])
  );

  /* irrigation schedule */
  root.appendChild(sectionTitle('7-day irrigation plan'));
  root.appendChild(
    card(
      el('div.table-wrap', null,
        el('table.irr-table', null,
          el('thead', null, el('tr', null, el('th', null, 'Day'), el('th', null, 'Rain forecast'), el('th', null, 'Action'))),
          el('tbody', null,
            a.schedule.map((row) =>
              el('tr', null,
                el('td', null, el('strong', null, row.day)),
                el('td', null, `${row.rain.toFixed(1)} mm · ${Math.round(row.prob)}%`),
                el('td', null, `${row.icon} ${row.action}`)
              )
            )
          )
        )
      )
    )
  );

  /* fieldwork hours */
  root.appendChild(sectionTitle('Best fieldwork hours today'));
  root.appendChild(
    hourlyStrip(a.fieldScored.slice(0, 24), (h) =>
      scoredHourCard(h, {
        value: `${h.score}`,
        sub: `${Math.round(h.precipitation_probability ?? 0)}% 💧`,
        title: `Fieldwork score ${h.score}/100 — ${h.band?.label ?? ''}`,
      })
    )
  );

  /* windows + notes */
  root.appendChild(
    el('div.row-2', null,
      card(
        el('div.sec-title', { style: { marginBottom: '8px' } }, 'Longest dry windows'),
        ...a.fieldWindows.map((w) =>
          el('div', { style: { padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '0.88rem', display: 'flex', justifyContent: 'space-between', gap: '10px' } },
            el('span', null, el('strong', null, w.slot)),
            el(`span.badge.${w.band.badge}`, null, `${w.score}/100`)
          )
        )
      ),
      card(
        el('div.sec-title', { style: { marginBottom: '8px' } }, 'Notes'),
        el('div', { style: { fontSize: '0.87rem', lineHeight: 1.7 } },
          `• Spray window: prefer ${a.fungal ? 'a dry, low-wind slot below' : 'any'} ${Math.max(...s.hours.slice(0, 12).map((h) => h.wind_speed_10m ?? 0)).toFixed(0)} km/h wind.`,
          el('br'),
          `• Irrigate early morning or after 5 PM to cut evaporation losses.`,
          el('br'),
          `• Data source: Open-Meteo soil & precipitation model — validate with a field check before large operations.`
        )
      )
    )
  );

  root.appendChild(footerNote());
}
