/**
 * dashboards/event.js — Event Planner dashboard.
 * Answer: "Is today viable for my outdoor event, and when exactly?"
 */

import { el } from '../../utils/dom.js';
import { hero, sectionTitle, card, kvList, hourlyStrip, scoredHourCard, alert, footerNote } from '../shared.js';
import { eventAdvisory } from '../../core/engine.js';

export function renderEvent(root, snapshot, units) {
  const a = eventAdvisory(snapshot);
  const s = snapshot;
  const todayScore = Math.round(a.scored.slice(0, 12).reduce((acc, h) => acc + h.score, 0) / Math.min(12, a.scored.length));

  root.appendChild(
    hero(
      `🎉 Outdoor event suitability — today`,
      el('div.hero-big', { style: { color: todayScore >= 65 ? 'var(--green)' : todayScore >= 40 ? 'var(--yellow)' : 'var(--red)' } }, `${todayScore}/100 — ${todayScore >= 65 ? 'Good' : todayScore >= 40 ? 'Fair' : 'Poor'}`),
      a.windows[0] ? `Best window: ${a.windows[0].window} · ${a.windows[0].note}` : 'No viable window in the next 16 hours — consider indoors.'
    )
  );

  /* best/worst day */
  root.appendChild(
    el('div.row-2', null,
      el('div.card.accent-border', null,
        el('div.sec-title', { style: { marginBottom: '6px', color: 'var(--accent)' } }, 'Best day this week'),
        el('div', { style: { fontSize: '1.1rem', fontWeight: 800, color: 'var(--green)' } }, `${a.best.label} (${a.best.date.slice(5)})`),
        el('div', { style: { fontSize: '0.82rem', color: 'var(--muted)', marginTop: '4px' } }, `${a.best.wx.label} · rain ${Math.round(a.best.precip_prob_max ?? 0)}%`),
        el('div', { style: { marginTop: '8px' } }, el('span.badge.badge-green', null, `${a.best.score}/100`))
      ),
      el('div.card', null,
        el('div.sec-title', { style: { marginBottom: '6px' } }, 'Worst day — avoid'),
        el('div', { style: { fontSize: '1.1rem', fontWeight: 800, color: 'var(--red)' } }, `${a.worst.label} (${a.worst.date.slice(5)})`),
        el('div', { style: { fontSize: '0.82rem', color: 'var(--muted)', marginTop: '4px' } }, `${a.worst.wx.label} · rain ${Math.round(a.worst.precip_prob_max ?? 0)}%`),
        el('div', { style: { marginTop: '8px' } }, el('span.badge.badge-red', null, `${a.worst.score}/100`))
      )
    )
  );

  /* time windows */
  root.appendChild(sectionTitle('Best time windows — next 16 hours'));
  root.appendChild(
    card(
      ...a.windows.map((w) =>
        el('div.window-row', null,
          el('div', null,
            el('div.window-time', null, w.window),
            el('div.window-note', null, w.note)
          ),
          el('div.window-score', { style: { color: w.color } }, w.score)
        )
      )
    )
  );

  /* hourly comfort */
  root.appendChild(sectionTitle('Hourly event score — plan the timeline'));
  root.appendChild(
    hourlyStrip(a.scored.slice(0, 24), (h) =>
      scoredHourCard(h, {
        value: `${h.score}`,
        sub: `${Math.round(h.precipitation_probability ?? 0)}% 💧`,
        title: `Event score ${h.score}/100 — ${h.band?.label ?? ''}`,
      })
    )
  );

  /* rain alert for the week */
  if (a.worst.precip_prob_max >= 75) {
    root.appendChild(alert('warn', `☂️ ${a.worst.label} shows ${Math.round(a.worst.precip_prob_max)}% rain probability — book an indoor backup if your event spans it.`));
  }

  /* comfort breakdown */
  root.appendChild(sectionTitle('Comfort breakdown — current hour'));
  root.appendChild(card(kvList(a.breakdown)));

  root.appendChild(footerNote());
}
