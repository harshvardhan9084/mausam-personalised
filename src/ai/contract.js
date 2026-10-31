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
/**
 * Aggressive numeric coercion — models love "29°C", "35%", "\u22122", "~30".
 * Pull the first number out of a string; handles unicode minus.
 */
const toNum = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const m = v.replace('\u2212', '-').match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  }
  return null;
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
/** First defined value among aliases. */
function pick(obj, ...keys) {
  for (const k of keys) {
    if (obj && obj[k] != null) return obj[k];
  }
  return undefined;
}

export const REGISTRY = {
  'now-card': {
    blurb: 'compact current-conditions card',
    validate(d) {
      if (!d || typeof d !== 'object') throw new Error('now-card needs data');
      return {
        place: str(pick(d, 'place', 'city', 'location', 'area')),
        temp: numOr(pick(d, 'temp', 'tempC', 'temperature')),
        feels: numOr(pick(d, 'feels', 'feelsLike', 'feels_C', 'apparent')),
        cond: str(pick(d, 'cond', 'condition', 'conditions', 'summary', 'text')),
        icon: str(pick(d, 'icon', 'emoji')),
        hi: numOr(pick(d, 'hi', 'max', 'maxC', 'high', 'tempMax')),
        lo: numOr(pick(d, 'lo', 'min', 'minC', 'low', 'tempMin')),
        humidity: numOr(pick(d, 'humidity', 'humidityPct', 'rh')),
        wind: numOr(pick(d, 'wind', 'windKmh', 'windSpeed')),
        updated: str(pick(d, 'updated', 'asOf', 'time')),
      };
    },
  },

  'hourly-timeline': {
    blurb: 'horizontal hour-by-hour strip',
    validate(d) {
      const hours = arr(pick(d, 'hours', 'items', 'list', 'rows', 'data'), 24).map((h) => ({
        time: str(pick(h ?? {}, 'time', 'hour', 'label', 'at')),
        temp: numOr(pick(h ?? {}, 'temp', 'tempC', 'temperature')),
        pop: numOr(pick(h ?? {}, 'pop', 'rain', 'rainPop', 'precip', 'precipProb')),
        icon: str(pick(h ?? {}, 'icon', 'emoji')),
        cond: str(pick(h ?? {}, 'cond', 'condition')),
      })).filter((h) => h.time || isNum(h.temp));
      if (!hours.length) throw new Error('no usable hours');
      return { hours };
    },
  },

  'temp-chart': {
    blurb: 'temperature trend line chart',
    validate(d) {
      const labels = arr(pick(d, 'labels', 'times', 'hours'), 48).map((l) => str(l));
      const temps = arr(pick(d, 'temps', 'values', 'temperatures', 'temp'), 48).map(toNum);
      if (labels.length < 2 || temps.length < 2) throw new Error('need ≥2 points');
      const feelsRaw = pick(d, 'feels', 'feels_like', 'apparent', 'feelsC');
      const feels = Array.isArray(feelsRaw) ? arr(feelsRaw, 48).map(toNum) : null;
      return { labels, temps, feels: feels && feels.some(isNum) ? feels : null, unit: str(d?.unit, '°C') };
    },
  },

  'rain-bars': {
    blurb: 'precipitation probability bars',
    validate(d) {
      let labels = arr(pick(d, 'labels', 'times', 'hours') ?? [], 24).map((l) => str(l));
      const pops = arr(pick(d, 'pops', 'values', 'bars', 'probabilities', 'chances', 'rainChances', 'rain'), 24)
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
      const days = arr(pick(d, 'days', 'items', 'list', 'forecast'), 10).map((x) => ({
        label: str(pick(x ?? {}, 'label', 'day', 'date', 'name')),
        date: str(pick(x ?? {}, 'date')),
        icon: str(pick(x ?? {}, 'icon', 'emoji')),
        cond: str(pick(x ?? {}, 'cond', 'condition', 'summary')),
        hi: numOr(pick(x ?? {}, 'hi', 'max', 'maxC', 'high', 'tempMax', 'temp_max')),
        lo: numOr(pick(x ?? {}, 'lo', 'min', 'minC', 'low', 'tempMin', 'temp_min')),
        pop: numOr(pick(x ?? {}, 'pop', 'rainPop', 'rain', 'precip', 'popMax', 'precipProb')),
      })).filter((x) => x.label || isNum(x.hi));
      if (!days.length) throw new Error('no days');
      return { days };
    },
  },

  'metrics-grid': {
    blurb: 'grid of labelled stat tiles',
    validate(d) {
      const items = arr(pick(d, 'items', 'stats', 'metrics', 'list'), 8).map((x) => ({
        label: str(pick(x ?? {}, 'label', 'name', 'key')),
        value: str(pick(x ?? {}, 'value', 'val', 'text')),
        icon: str(pick(x ?? {}, 'icon', 'emoji')),
      })).filter((x) => x.label && x.value);
      if (!items.length) throw new Error('no items');
      return { items };
    },
  },

  'advice': {
    blurb: 'contextual do/don’t advice card',
    validate(d) {
      const tone = ['good', 'info', 'warn', 'danger'].includes(pick(d, 'tone', 'severity', 'level')) ? pick(d, 'tone', 'severity', 'level') : 'info';
      const items = arr(pick(d, 'items', 'list', 'points', 'tips'), 6).map((x) => {
        if (typeof x === 'string') return x;
        if (x && typeof x === 'object') return str(pick(x, 'text', 'item', 'tip', 'advice', 'title'));
        return '';
      }).filter(Boolean);
      if (!items.length) throw new Error('no advice items');
      return { tone, title: str(pick(d, 'title', 'heading')), items: items.map((x) => ({ icon: null, text: x })) };
    },
  },

  'alert': {
    blurb: 'severity banner',
    validate(d) {
      const severityRaw = pick(d, 'severity', 'level', 'tone');
      const severity = ['info', 'warn', 'danger'].includes(severityRaw) ? severityRaw : 'warn';
      const title = str(pick(d, 'title', 'headline', 'heading'));
      const text = str(pick(d, 'text', 'body', 'message', 'description'));
      if (!title && !text) throw new Error('empty alert');
      return { severity, title, text, source: str(pick(d, 'source', 'via')) };
    },
  },

  'compare-table': {
    blurb: 'comparison table (days, cities)',
    validate(d) {
      const columns = arr(pick(d, 'columns', 'cols', 'headers'), 6).map((c) => str(c));
      const rows = arr(pick(d, 'rows', 'data', 'values'), 10).map((r) => {
        if (Array.isArray(r)) return arr(r, 6).map((c) => str(c ?? ''));
        if (r && typeof r === 'object') return Object.values(r).slice(0, 6).map((c) => (c == null ? '' : typeof c === 'object' ? JSON.stringify(c) : String(c)));
        return [str(r)];
      });
      if (columns.length < 2 || !rows.length) throw new Error('need columns + rows');
      return { columns, rows: rows.map((r) => r.map((c) => c ?? '')) };
    },
  },

  'window-card': {
    blurb: 'best-time windows with verdict',
    validate(d) {
      const windows = arr(pick(d, 'windows', 'slots'), 4).map((w) => ({
        slot: str(pick(w ?? {}, 'slot', 'time', 'window', 'label')),
        rating: str(pick(w ?? {}, 'rating', 'quality')),
        reason: str(pick(w ?? {}, 'reason', 'why', 'note')),
      })).filter((w) => w.slot);
      if (!windows.length) throw new Error('no windows');
      const ratingColor = {
        Good: 'var(--green)', Fair: 'var(--yellow)', Poor: 'var(--red)',
      };
      return {
        title: str(pick(d, 'title')),
        verdict: str(pick(d, 'verdict', 'summary')),
        windows: windows.map((w) => ({ ...w, color: ratingColor[w.rating] ?? 'var(--blue)' })),
      };
    },
  },

  'aqi-card': {
    blurb: 'air quality summary',
    validate(d) {
      const aqi = numOr(pick(d, 'aqi', 'value', 'index', 'aqiValue', 'cpcbAqi'));
      if (aqi == null && !str(pick(d, 'category', 'cat'))) throw new Error('no AQI data');
      return {
        aqi,
        category: str(pick(d, 'category', 'cat'), 'Unknown'),
        dominant: str(pick(d, 'dominant', 'pollutant', 'dominantPollutant')),
        advice: str(pick(d, 'advice', 'note', 'text')),
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
      const items = arr(pick(d, 'items', 'list', 'suggestions', 'wearables'), 6).map((x) => {
        if (typeof x === 'string') return { icon: '•', name: x, why: '' };
        return {
          icon: str(pick(x ?? {}, 'icon', 'emoji')) || '•',
          name: str(pick(x ?? {}, 'name', 'item', 'title', 'label')),
          why: str(pick(x ?? {}, 'why', 'reason', 'note')),
        };
      }).filter((x) => x.name);
      if (!items.length) throw new Error('no items');
      return { items };
    },
  },

  'verify-card': {
    blurb: 'independent-witness verification rows — the Cross-checked ledger, one row per source pair (label + detail + verdict ok|warn|info)',
    validate(d) {
      const rows = arr(pick(d, 'rows', 'items', 'checks'), 4).map((r) => {
        const label = str(pick(r ?? {}, 'label', 'name', 'title'));
        const detail = str(pick(r ?? {}, 'detail', 'text', 'why', 'note'));
        if (!label || !detail) throw new Error('verify row needs label + detail');
        const verdict = str(pick(r ?? {}, 'verdict', 'state'));
        /* Anything the model invents that is not warn/info reads as a
           pass — we never let a typo manufacture a warning. */
        return { label, detail, verdict: verdict === 'warn' || verdict === 'info' ? verdict : 'ok' };
      }).filter((r) => r.label && r.detail);
      if (!rows.length) throw new Error('no verify rows');
      return { rows };
    },
  },

  'chips': {
    blurb: 'clickable follow-up suggestions',
    validate(d) {
      const items = arr(pick(d, 'items', 'options', 'suggestions', 'chips'), 6).map((x) => {
        if (typeof x === 'string') return x;
        if (x && typeof x === 'object') return str(pick(x, 'label', 'text', 'value', 'title'));
        return '';
      }).filter(Boolean);
      if (!items.length) throw new Error('no chips');
      return { items };
    },
  },

  'note': {
    blurb: 'small print',
    validate(d) {
      const text = str(pick(d, 'text', 'body', 'message'));
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
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: 'not an object' };
  // Repair: model put component fields at the ROOT (no "d" wrapper) —
  // e.g. {"v":1,"c":"wear-list","items":[…]} — rewrap everything except
  // the envelope keys as the payload data.
  if (parsed.d == null) {
    const { v, c, t, ...rest } = parsed;
    if (Object.keys(rest).length) parsed = { ...parsed, d: rest };
  }
  const v = toNum(parsed.v);
  if (v != null && v !== CONTRACT_VERSION) return { ok: false, error: `contract version ${v} unsupported` };
  const c = parsed.c;
  if (!isStr(c) || !REGISTRY[c]) return { ok: false, error: `unknown component "${c}"` };
  try {
    const d = REGISTRY[c].validate(parsed.d);
    return { ok: true, payload: { c, t: str(parsed.t), d } };
  } catch (err) {
    return { ok: false, error: `bad ${c} payload: ${err.message}` };
  }
}
