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
        set('destinations', list.slice(-6)); // cap at 6
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
};
