/**
 * placename.js — place names render in the READER's script (v0.8.32).
 *
 * The i18n trilogy (v0.8.26–28) taught the UI, the geocoder and Mitra to
 * speak Hindi — but a PLACE NAME is data, and data baked at pick time in
 * the then-current language. Save "Mumbai" in English, switch to हिन्दी,
 * and every chip / header / hero / compare row still reads Latin amid a
 * Devanagari interface; the reverse bothers an English reader the same
 * way. This module is the system fix: a name-resolution layer every
 * surface goes through instead of touching `.name` directly.
 *
 *   pickName(loc)   → the stored variant matching the ACTIVE language,
 *                     falling back to the primary name; fires a lazy
 *                     one-shot resolution for the missing variant.
 *   pickAdmin1(loc) / pickCountry(loc) — same semantics for the subtitle
 *                     fields the geocoder localises.
 *
 * Resolution (ensureAlt) asks BigDataCloud's keyless reverse-geocode
 * endpoint — the SAME service the GPS path has trusted since v0.5 — for
 * the missing language, then patches every persisted copy (destinations
 * + location store) AND the live object, and fires 'mausam:placename'
 * so wired surfaces re-render. A Latin primary can also resolve through
 * the Open-Meteo geocoder (which matches Latin names in every language,
 * but drops Devanagari queries unless language=hi — verified by curl in
 * the v0.8.28 cycle). Everything is failure-silent: a place the services
 * cannot translate keeps its primary name, exactly the pre-0.8.32 look.
 *
 * Pure data hygiene: no polling, no extra calls until a script mismatch
 * is actually on screen, one attempt per place per language per session.
 */

import { getLang } from './i18n.js';
import { store } from './storage.js';

/** True if the string contains Devanagari — the same range rule the
 *  geocoder client uses to route queries (v0.8.28). */
export function scriptOf(s) {
  return /[\u0900-\u097F]/.test(String(s ?? '')) ? 'hi' : 'en';
}

/* ---------------- one-shot resolution state ---------------- */

const tried = new Set(); // "lat,lon:lang" — attempted this session (success or not)
const inflight = new Set();

const coordKey = (loc) => `${Number(loc?.lat ?? 0).toFixed(2)},${Number(loc?.lon ?? 0).toFixed(2)}`;

/** Does this place still owe us a name in `lang`? */
function needsAlt(loc, lang) {
  return Boolean(
    loc && loc.name != null && loc.lat != null &&
    scriptOf(loc.name) !== lang && !loc.nameAlt
  );
}

async function reverseResolve(loc, lang) {
  // 1) BigDataCloud reverse geocode — city/locality level, localised.
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${loc.lat}&longitude=${loc.lon}&localityLanguage=${lang}`,
      { signal: AbortSignal.timeout(6000) },
    );
    const j = await res.json();
    const name = j.city || j.locality || j.principalSubdivision || '';
    if (name) {
      return { name, admin1: j.principalSubdivision || '', country: j.countryName || '' };
    }
  } catch { /* fall through to the geocoder */ }
  // 2) Latin-primary fallback via the Open-Meteo geocoder (en→hi only —
  //    it drops Devanagari queries unless language=hi, so hi→en has no
  //    query to send; BigDataCloud above is that direction's only path).
  if (scriptOf(loc.name) === 'en' && lang === 'hi') {
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(loc.name)}&count=5&language=hi&format=json`,
        { signal: AbortSignal.timeout(6000) },
      );
      const j = await res.json();
      const hit = (j?.results ?? []).find(
        (r) => Math.abs(r.latitude - loc.lat) < 0.2 && Math.abs(r.longitude - loc.lon) < 0.2
      );
      if (hit?.name) return { name: hit.name, admin1: hit.admin1 ?? '', country: hit.country ?? '' };
    } catch { /* give up quietly */ }
  }
  return null;
}

/** Write the alt variant into every persisted copy of this place. */
function patchPlaces(loc, alt) {
  const near = (a) => Math.abs(a.lat - loc.lat) < 0.05 && Math.abs(a.lon - loc.lon) < 0.05;
  const withAlt = (d) => ({ ...d, nameAlt: alt.name, admin1Alt: alt.admin1 ?? '', countryAlt: alt.country ?? '' });
  let touched = false;
  const list = (store.destinations.get() ?? []).map((d) => {
    if (!near(d) || d.nameAlt) return d;
    touched = true;
    return withAlt(d);
  });
  if (touched) store.destinations.set(list);
  const cur = store.location.get();
  if (cur && near(cur) && !cur.nameAlt) {
    store.location.set(withAlt(cur));
    touched = true;
  }
  if (touched) window.dispatchEvent(new CustomEvent('mausam:placename'));
}

/** Resolve + patch once per place per language per session. */
function ensureAlt(loc, lang) {
  const key = `${coordKey(loc)}:${lang}`;
  if (tried.has(key) || inflight.has(key)) return;
  inflight.add(key);
  reverseResolve(loc, lang)
    .then((alt) => {
      if (!alt?.name) return;
      // live objects (currentLocation, modal ctx) update in place so the
      // next render is correct even before the stores re-read
      if (!loc.nameAlt) {
        loc.nameAlt = alt.name;
        loc.admin1Alt = alt.admin1 ?? '';
        loc.countryAlt = alt.country ?? '';
      }
      patchPlaces(loc, alt);
    })
    .catch(() => { /* stay silent — the primary name is already on screen */ })
    .finally(() => {
      inflight.delete(key);
      tried.add(key);
    });
}

/* ---------------- the reader-facing pickers ---------------- */

/** The place's name in the ACTIVE language (lazy-resolves the variant). */
export function pickName(loc) {
  if (!loc?.name) return loc?.name ?? '';
  const lang = getLang();
  if (scriptOf(loc.name) === lang) return loc.name;
  ensureAlt(loc, lang);
  return loc.nameAlt ?? loc.name;
}

/** The admin1 subtitle in the ACTIVE language (follows pickName's resolution). */
export function pickAdmin1(loc) {
  if (!loc?.admin1) return '';
  const lang = getLang();
  if (scriptOf(loc.name) === lang) return loc.admin1;
  return loc.admin1Alt ?? loc.admin1;
}

/** The country in the ACTIVE language (follows pickName's resolution). */
export function pickCountry(loc) {
  if (!loc?.country) return '';
  const lang = getLang();
  if (scriptOf(loc.name) === lang) return loc.country;
  return loc.countryAlt ?? loc.country;
}
