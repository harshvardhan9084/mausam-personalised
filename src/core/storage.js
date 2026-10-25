/**
 * storage.js — tiny typed wrapper over localStorage with JSON + in-memory fallback.
 * Keys are namespaced under "mausam:".
 */

const PREFIX = 'mausam:';
const memory = new Map();

function available() {
  try {
    const k = `${PREFIX}__probe`;
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}
const hasLS = typeof window !== 'undefined' && available();

export function get(key, fallback = null) {
  try {
    const raw = hasLS ? window.localStorage.getItem(PREFIX + key) : memory.get(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function set(key, value) {
  const raw = JSON.stringify(value);
  try {
    if (hasLS) window.localStorage.setItem(PREFIX + key, raw);
    else memory.set(PREFIX + key, raw);
  } catch {
    /* quota exceeded — ignore */
  }
}

export function remove(key) {
  try {
    if (hasLS) window.localStorage.removeItem(PREFIX + key);
    else memory.delete(PREFIX + key);
  } catch {
    /* ignore */
  }
}

/** App state helpers. */
export const store = {
  persona: {
    get: () => get('persona'),
    set: (id) => set('persona', id),
  },
  location: {
    get: () => get('location'), // {name, admin1, country, lat, lon, isGeo?}
    set: (loc) => set('location', loc),
  },
  units: {
    get: () => get('units', 'metric'), // 'metric' | 'imperial'
    set: (u) => set('units', u),
  },
  theme: {
    get: () => get('theme', 'auto'), // 'auto' | 'dark' | 'light'
    set: (t) => set('theme', t),
  },
  destinations: {
    get: () => get('destinations', []), // [{name, admin1, country, lat, lon}]
    set: (list) => set('destinations', list),
    add: (dest) => {
      const list = get('destinations', []);
      if (!list.some((d) => Math.abs(d.lat - dest.lat) < 0.01 && Math.abs(d.lon - dest.lon) < 0.01)) {
        list.push(dest);
        set('destinations', list.slice(-8)); // cap at 8
      }
    },
    removeAt: (i) => {
      const list = get('destinations', []);
      list.splice(i, 1);
      set('destinations', list);
    },
  },
  bundle: {
    // last good weather bundle, for instant paint + offline
    get: (lat, lon) => get(`bundle:${lat.toFixed(2)},${lon.toFixed(2)}`),
    set: (lat, lon, bundle) => set(`bundle:${lat.toFixed(2)},${lon.toFixed(2)}`, bundle),
  },
  imdKey: {
    get: () => get('imdKey', ''),
    set: (k) => set('imdKey', String(k ?? '').trim()),
    has: () => Boolean(String(get('imdKey', '')).trim()),
  },
  ai: {
    // AI assistant settings. The key never leaves this browser except to
    // the provider the user chose (Google's Gemini API).
    get: () => get('ai', { provider: 'auto', geminiKey: '', model: 'gemini-3.5-flash-lite' }),
    set: (cfg) => set('ai', { ...get('ai', {}), ...cfg }),
  },
  you: {
    // v1 personalisation (kept for migration; prefer store.profile)
    get: () => get('you', null),
    set: (p) => set('you', p),
    clear: () => remove('you'),
  },
  profile: {
    // v2 profile — deep, volatile, user-shaped (see core/profile.js)
    get: () => get('profile', null),
    set: (p) => set('profile', p),
    clear: () => remove('profile'),
  },
  lang: {
    // UI language: 'en' | 'hi'
    get: () => get('lang', 'en'),
    set: (l) => set('lang', l),
  },
  aiLang: {
    // Mitra's reply language: 'auto' | 'en' | 'hi' | 'hinglish'
    get: () => get('aiLang', 'auto'),
    set: (l) => set('aiLang', l),
  },
  clock: {
    // '12' | '24'
    get: () => get('clock', '12'),
    set: (c) => set('clock', c),
  },
  accent: {
    // accent color id, see tokens.css [data-accent]
    get: () => get('accent', ''),
    set: (a) => set('accent', a),
  },
  dataSaver: {
    // tier-2 friendly: fewer background calls, radar lazy & paused
    get: () => get('dataSaver', false),
    set: (v) => set('dataSaver', Boolean(v)),
  },
  notif: {
    // { on: bool } — in-app alerts while Mausam is open
    get: () => get('notif', { on: false }),
    set: (v) => set('notif', v),
  },
  optionalCache: {
    // small cache for optional API bundles (flood/marine/archive)
    get: (key) => get(`opt:${key}`, null),
    set: (key, val, ttlMin = 60) => set(`opt:${key}`, { at: Date.now(), ttl: ttlMin * 60000, val }),
    fresh: (key) => {
      const hit = get(`opt:${key}`, null);
      return hit && Date.now() - hit.at < hit.ttl ? hit.val : null;
    },
  },
  flags: {
    get: (name, fallback = null) => get(`flag:${name}`, fallback),
    set: (name, value) => set(`flag:${name}`, value),
  },
  chats: {
    // Mitra conversation history: {list: [{id, at, title, msgs:[{role,text}]}], currentId}
    // Kept small: mitra.js caps the list at 30 conversations / 60 msgs each.
    get: () => get('chats', { list: [], currentId: null }),
    set: (v) => set('chats', v),
  },
  exportAll: () => {
    const out = {};
    try {
      for (let i = 0; i < (hasLS ? window.localStorage.length : 0); i++) {
        const k = window.localStorage.key(i);
        if (k?.startsWith(PREFIX)) out[k.slice(PREFIX.length)] = get(k.slice(PREFIX.length));
      }
    } catch { /* best effort */ }
    return { app: 'mausam', version: '0.5', exportedAt: new Date().toISOString(), data: out };
  },
  importAll: (dump) => {
    if (!dump || dump.app !== 'mausam' || typeof dump.data !== 'object') return false;
    try {
      for (const [k, v] of Object.entries(dump.data)) set(k, v);
      return true;
    } catch { return false; }
  },
  wipeAll: () => {
    try {
      if (hasLS) {
        const keys = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k?.startsWith(PREFIX)) keys.push(k);
        }
        keys.forEach((k) => window.localStorage.removeItem(k));
      }
      memory.clear();
    } catch { /* ignore */ }
  },
};
