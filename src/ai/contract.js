/**
 * contract.js — the MausamUI contract between the AI and the frontend.
 *
 * The assistant may embed rich UI inside its streamed text using a fenced
 * block. The renderer (render.js) maps these to real components built with
 * the app's design system. Everything is validated here first — malformed
 * or unsupported payloads NEVER break the chat; they degrade to readable
 * fallbacks (render.js decides how).
 *
 * Wire format (inside assistant text):
 *
 *   ```mausam-ui
 *   {"v":1,"c":"hourly-timeline","t":"Next 12 hours","d":{ ... }}
 *   ```
 *
 *   v — contract version (must be 1)
 *   c — component type (must be in REGISTRY below)
 *   t — optional human title shown on the card
 *   d — component data, shape checked per type
 *
 * Rules for the AI (mirrored in prompt.js):
 *   - plain text first; use a component only when it clearly communicates
 *     better than prose
 *   - 1–3 components per reply, numbers must come from the provided data
 *   - never wrap two components in one fence — one fence per component
 */

export const CONTRACT_VERSION = 1;
export const FENCE = 'mausam-ui';

/**
 * Registry: type → { d: validator(d) → cleaned d (throws on invalid), blurb }
 * Validators coerce aggressively and clamp sizes; they throw only when the
 * payload cannot be rendered meaningfully at all.
 */
const isStr = (v) => typeof v === 'string';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
function arr(v, max) {
  if (!Array.isArray(v)) throw new Error('expected array');
  return v.slice(0, max);
}
function str(v, fallback = '') {
  return isStr(v) ? v : fallback;
}
function numOr(v, fallback = null) {
  const n = toNum(v);
  return n == null ? fallback : n;
}

export const REGISTRY = {
  'now-card': {
    blurb: 'compact current-conditions card',
    validate(d) {
      if (!d || typeof d !== 'object') throw new Error('now-card needs data');
      return {
        place: str(d.place),
        temp: numOr(d.temp),
        feels: numOr(d.feels),
        cond: str(d.cond),
        icon: str(d.icon),
        hi: numOr(d.hi),
        lo: numOr(d.lo),
        humidity: numOr(d.humidity),
        wind: numOr(d.wind),
        updated: str(d.updated),
      };
    },
  },

  'hourly-timeline': {
    blurb: 'horizontal hour-by-hour strip',
    validate(d) {
      const hours = arr(d?.hours, 24).map((h) => ({
        time: str(h?.time),
        temp: numOr(h?.temp),
        pop: numOr(h?.pop),
        icon: str(h?.icon),
        cond: str(h?.cond),
      })).filter((h) => h.time || isNum(h.temp));
      if (!hours.length) throw new Error('no usable hours');
      return { hours };
    },
  },

  'temp-chart': {
    blurb: 'temperature trend line chart',
    validate(d) {
      const labels = arr(d?.labels ?? d?.times, 48).map((l) => str(l));
      const temps = arr(d?.temps ?? d?.values ?? d?.temperatures, 48).map(toNum);
      if (labels.length < 2 || temps.length < 2) throw new Error('need ≥2 points');
      const feelsRaw = d?.feels ?? d?.feels_like ?? d?.apparent;
      const feels = Array.isArray(feelsRaw) ? arr(feelsRaw, 48).map(toNum) : null;
      return { labels, temps, feels: feels && feels.some(isNum) ? feels : null, unit: str(d?.unit, '°C') };
    },
  },

  'rain-bars': {
    blurb: 'precipitation probability bars',
    validate(d) {
      let labels = arr(d?.labels ?? d?.times, 24).map((l) => str(l));
      const pops = arr(d?.pops ?? d?.values ?? d?.bars ?? d?.probabilities ?? d?.chances, 24)
        .map((p) => Math.max(0, Math.min(100, numOr(p, 0))));
      if (!pops.length) throw new Error('need points');
      // numeric hour labels → readable h12 strings
      if (labels.length && labels.every((l) => /^\d{1,2}$/.test(l))) {
        labels = labels.map((l) => {
          const h = Number(l) % 24;
          return (h % 12 === 0 ? 12 : h % 12) + (h >= 12 ? ' PM' : ' AM');
        });
      }
      while (labels.length < pops.length) labels.push('');
      return { labels: labels.slice(0, pops.length), pops };
    },
  },

  'daily-list': {
    blurb: 'multi-day forecast list',
    validate(d) {
      const days = arr(d?.days, 7).map((x) => ({
        label: str(x?.label ?? x?.day),
        date: str(x?.date),
        icon: str(x?.icon),
        cond: str(x?.cond ?? x?.condition),
        hi: numOr(x?.hi ?? x?.max ?? x?.maxC ?? x?.high),
        lo: numOr(x?.lo ?? x?.min ?? x?.minC ?? x?.low),
        pop: numOr(x?.pop ?? x?.rainPop ?? x?.rain ?? x?.precip),
      })).filter((x) => x.label || isNum(x.hi));
      if (!days.length) throw new Error('no days');
      return { days };
    },
  },

  'metrics-grid': {
    blurb: 'grid of labelled stat tiles',
    validate(d) {
      const items = arr(d?.items, 8).map((x) => ({
        label: str(x?.label),
        value: str(x?.value),
        icon: str(x?.icon),
      })).filter((x) => x.label && x.value);
      if (!items.length) throw new Error('no items');
      return { items };
    },
  },

  'advice': {
    blurb: 'contextual do/don’t advice card',
    validate(d) {
      const tone = ['good', 'info', 'warn', 'danger'].includes(d?.tone) ? d.tone : 'info';
      const items = arr(d?.items, 6).map((x) => str(x)).filter(Boolean);
      if (!items.length) throw new Error('no advice items');
      return { tone, title: str(d?.title), items: items.map((x) => ({ icon: null, text: x })) };
    },
  },

  'alert': {
    blurb: 'severity banner',
    validate(d) {
      const severity = ['info', 'warn', 'danger'].includes(d?.severity) ? d.severity : 'warn';
      const title = str(d?.title);
      const text = str(d?.text);
      if (!title && !text) throw new Error('empty alert');
      return { severity, title, text, source: str(d?.source) };
    },
  },

  'compare-table': {
    blurb: 'comparison table (days, cities)',
    validate(d) {
      const columns = arr(d?.columns ?? d?.cols ?? d?.headers, 5).map((c) => str(c));
      const rows = arr(d?.rows ?? d?.data, 8).map((r) => arr(Array.isArray(r) ? r : [r], 5).map((c) => str(c)));
      if (columns.length < 2 || !rows.length) throw new Error('need columns + rows');
      return { columns, rows: rows.map((r) => r.map((c) => c ?? '')) };
    },
  },

  'window-card': {
    blurb: 'best-time windows with verdict',
    validate(d) {
      const windows = arr(d?.windows ?? d?.slots, 4).map((w) => ({
        slot: str(w?.slot ?? w?.time ?? w?.window),
        rating: str(w?.rating ?? w?.quality),
        reason: str(w?.reason ?? w?.why ?? w?.note),
      })).filter((w) => w.slot);
      if (!windows.length) throw new Error('no windows');
      const ratingColor = {
        Good: 'var(--green)', Fair: 'var(--yellow)', Poor: 'var(--red)',
      };
      return {
        title: str(d?.title),
        verdict: str(d?.verdict ?? d?.summary),
        windows: windows.map((w) => ({ ...w, color: ratingColor[w.rating] ?? 'var(--blue)' })),
      };
    },
  },

  'aqi-card': {
    blurb: 'air quality summary',
    validate(d) {
      const aqi = numOr(d?.aqi ?? d?.value ?? d?.index);
      if (aqi == null && !str(d?.category)) throw new Error('no AQI data');
      return {
        aqi,
        category: str(d?.category ?? d?.cat, 'Unknown'),
        dominant: str(d?.dominant ?? d?.pollutant),
        advice: str(d?.advice ?? d?.note),
      };
    },
  },

  'sun-card': {
    blurb: 'sunrise / sunset / moon',
    validate(d) {
      const out = {
        sunrise: str(d?.sunrise), sunset: str(d?.sunset),
        moonrise: str(d?.moonrise), moonset: str(d?.moonset),
        dayLength: str(d?.dayLength), source: str(d?.source),
      };
      if (!out.sunrise && !out.sunset && !out.moonrise) throw new Error('no sun data');
      return out;
    },
  },

  'wear-list': {
    blurb: 'what to wear / carry list',
    validate(d) {
      const items = arr(d?.items, 6).map((x) => {
        if (typeof x === 'string') return { icon: '•', name: x, why: '' };
        return {
          icon: str(x?.icon) || '•',
          name: str(x?.name ?? x?.item ?? x?.title),
          why: str(x?.why ?? x?.reason ?? x?.note),
        };
      }).filter((x) => x.name);
      if (!items.length) throw new Error('no items');
      return { items };
    },
  },

  'chips': {
    blurb: 'clickable follow-up suggestions',
    validate(d) {
      const items = arr(d?.items, 6).map((x) => str(x)).filter(Boolean);
      if (!items.length) throw new Error('no chips');
      return { items };
    },
  },

  'note': {
    blurb: 'small print',
    validate(d) {
      const text = str(d?.text);
      if (!text) throw new Error('empty note');
      return { text };
    },
  },
};

export const PROMPT_CATALOG = Object.entries(REGISTRY)
  .map(([name, spec]) => `- ${name} — ${spec.blurb}`)
  .join('\n');

/** Parse + validate one fenced payload. Returns {ok, payload?, error?}. */
export function parseBlock(rawJSON) {
  let parsed;
  try {
    parsed = JSON.parse(rawJSON);
  } catch {
    return { ok: false, error: 'not valid JSON' };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'not an object' };
  const v = toNum(parsed.v);
  if (v !== CONTRACT_VERSION) return { ok: false, error: `contract version ${v} unsupported` };
  const c = parsed.c;
  if (!isStr(c) || !REGISTRY[c]) return { ok: false, error: `unknown component "${c}"` };
  try {
    const d = REGISTRY[c].validate(parsed.d);
    return { ok: true, payload: { c, t: str(parsed.t), d } };
  } catch (err) {
    return { ok: false, error: `bad ${c} payload: ${err.message}` };
  }
}
