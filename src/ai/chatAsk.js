/**
 * chatAsk.js — v0.8.39 "the conversation answers back".
 *
 * The board's verdicts became askable in v0.8.37/38 (farm rows, crops
 * cards, Mausam-says, for-you, the tiles); Mitra's OWN cards were the
 * last verdicts that dead-ended — the reply drew a window verdict, an
 * AQI number, a warning, and the natural next question ("why that
 * slot?", "is that number safe?") had nowhere to land.
 *
 * This table derives each chat card's follow-up from the SAME validated
 * data the card renders (contract.js output) — the question is born
 * with the card, parameterised by the numbers it shows, in the reader's
 * language. It never improvises from prose and never invents data.
 *
 *   window-card → asks about the top window's slot
 *   aqi-card    → asks about the number itself
 *   alert       → asks what the warning means for today's plans
 *   wear-list   → asks why these layers / what to swap
 *
 * Facts and charts (now-card, hourly-timeline, temp-chart, rain-bars,
 * sun-card, note, chips, …) return null — no fake affordances on data
 * that is not a verdict. Kept free of DOM imports so the table is
 * unit-testable in node (scripts/test_chat_ask.mjs).
 */

import { t } from '../core/i18n.js';

export function chatAsk(c, d) {
  if (!d || typeof d !== 'object') return null;
  switch (c) {
    case 'window-card': {
      const slot = Array.isArray(d.windows) ? d.windows.find((w) => w && w.slot)?.slot : null;
      return slot ? t('ask_chat_win', { t: String(slot) }) : null;
    }
    case 'aqi-card':
      return d.aqi != null ? t('ask_chat_aqi', { n: Math.round(d.aqi) }) : null;
    case 'alert': {
      const x = typeof d.title === 'string' ? d.title.trim() : '';
      return x ? t('ask_chat_alert', { x }) : null;
    }
    case 'wear-list':
      return Array.isArray(d.items) && d.items.length ? t('ask_chat_wear') : null;
    default:
      return null;
  }
}
