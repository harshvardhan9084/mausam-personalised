/**
 * profiles.js — user-created profiles. The core of Mausam as a product.
 *
 * A profile is NOT an account: nothing leaves the device. It is the
 * personalisation context the whole app reads:
 *   { id, name, emoji, color, home, lens, sensitivities, createdAt }
 *
 * The five classic presets live on as LENSES — starting points the user
 * picks during onboarding, not identities forced on them.
 */

import { get, set } from './storage.js';
import { PERSONAS } from './personas.js';

const KEY_LIST = 'profiles.v2';
const KEY_ACTIVE = 'activeProfile';

/** Accent palette for profile colours (key → CSS color). */
export const ACCENTS = {
  blue:   { label: 'Sky',      hex: '#4f8ef7' },
  green:  { label: 'Field',    hex: '#4caf82' },
  orange: { label: 'Ember',    hex: '#f7874f' },
  leaf:   { label: 'Leaf',     hex: '#8bc34a' },
  violet: { label: 'Orchid',   hex: '#9b59f7' },
  yellow: { label: 'Sun',      hex: '#f7c44f' },
};

/** Avatar emoji set — covers the lenses plus everyday identities. */
export const AVATARS = [
  '🏃', '🚴', '🧗', '🏊', '🧘',
  '🚗', '🏍️', '🚆',
  '🌾', '👨‍🌾', '👩‍🌾',
  '✈️', '🧳',
  '🎉', '💍',
  '🧑‍💻', '👩‍🏫', '🧑‍🍳', '🧕', '🧒',
];

export const SENSITIVITY_KEYS = ['heat', 'cold', 'rain', 'air'];

export const SENSITIVITY_INFO = {
  heat: { label: 'Heat', emoji: '🥵', hint: 'You struggle in hot weather' },
  cold: { label: 'Cold', emoji: '🥶', hint: 'You feel the cold quickly' },
  rain: { label: 'Rain', emoji: '☔', hint: 'Getting soaked is a big deal for you' },
  air:  { label: 'Air quality', emoji: '😷', hint: 'Asthma / pollution-sensitive' },
};

export const LENS_INFO = {
  fitness:     { icon: '🏃', name: 'Outdoor fitness', desc: 'Runs, rides, outdoor workouts', why: 'Best workout windows, heat & hydration risk' },
  commuter:    { icon: '🚗', name: 'Commuter',         desc: 'The daily office run',         why: 'Morning/evening drive risk, fog alerts' },
  agriculture: { icon: '🌾', name: 'Farming',          desc: 'Fields, crops, irrigation',    why: 'Irrigation plan, soil moisture, spray windows' },
  traveler:    { icon: '✈️', name: 'Travel',           desc: 'Trips & weekends away',        why: 'Packing lists, best days, destination cards' },
  event:       { icon: '🎉', name: 'Events',           desc: 'Outdoor plans & gatherings',   why: 'Event windows, rain risk, setup warnings' },
};

export const EMOJI_BY_LENS = {
  fitness: '🏃', commuter: '🚗', agriculture: '🌾', traveler: '✈️', event: '🎉',
};

let cache = null;

/** Validate profile data. Returns { ok, errors:{field:msg} }. */
export function validate(data, { existingId = null, all = null } = {}) {
  const errors = {};
  const list = all ?? listProfiles();
  const name = (data.name ?? '').trim();
  if (!name) errors.name = 'A name is needed — even a nickname works.';
  else if (name.length > 24) errors.name = 'Keep it under 24 characters.';
  else if (list.some((p) => p.id !== existingId && p.name.toLowerCase() === name.toLowerCase())) {
    errors.name = `You already have a profile called “${name}”.`;
  }
  if (!data.home || typeof data.home.lat !== 'number' || typeof data.home.lon !== 'number') {
    errors.home = 'Pick a home city so forecasts have an anchor.';
  }
  if (!LENS_INFO[data.lens]) errors.lens = 'Choose what Mausam should optimise for.';
  return { ok: Object.keys(errors).length === 0, errors };
}

/** Sanitise + normalise a profile payload into a storable object. */
function normalise(data, existing = null) {
  const now = Date.now();
  const sensitivities = {};
  for (const k of SENSITIVITY_KEYS) sensitivities[k] = Boolean(data.sensitivities?.[k]);
  return {
    id: existing?.id ?? `p_${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    name: String(data.name ?? '').trim().slice(0, 24),
    emoji: AVATARS.includes(data.emoji) ? data.emoji : (EMOJI_BY_LENS[data.lens] ?? '🙂'),
    color: ACCENTS[data.color] ? data.color : 'blue',
    home: {
      name: String(data.home?.name ?? 'Home').slice(0, 60),
      admin1: String(data.home?.admin1 ?? '').slice(0, 60),
      country: String(data.home?.country ?? '').slice(0, 60),
      lat: Number(data.home?.lat),
      lon: Number(data.home?.lon),
    },
    lens: LENS_INFO[data.lens] ? data.lens : 'fitness',
    sensitivities,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

/* ------------------------------------------------------------------
   Profile store (localStorage-backed, namespaced via storage.js)
------------------------------------------------------------------ */

export function listProfiles() {
  if (cache) return cache;
  const raw = get(KEY_LIST, []);
  cache = Array.isArray(raw) ? raw : [];
  return cache;
}

function persist(list) {
  cache = list;
  set(KEY_LIST, list);
}

export function getProfile(id) {
  return listProfiles().find((p) => p.id === id) ?? null;
}

export function createProfile(data) {
  const check = validate(data);
  if (!check.ok) return { ok: false, errors: check.errors };
  const profile = normalise(data);
  persist([...listProfiles(), profile]);
  return { ok: true, profile };
}

export function updateProfile(id, patch) {
  const existing = getProfile(id);
  if (!existing) return { ok: false, errors: { id: 'Profile not found.' } };
  const merged = normalise({ ...existing, ...patch, home: patch.home ?? existing.home }, existing);
  const check = validate(merged, { existingId: id });
  if (!check.ok) return { ok: false, errors: check.errors };
  persist(listProfiles().map((p) => (p.id === id ? merged : p)));
  return { ok: true, profile: merged };
}

export function deleteProfile(id) {
  const list = listProfiles();
  const next = list.filter((p) => p.id !== id);
  if (next.length === list.length) return false;
  persist(next);
  if (activeProfileId() === id) {
    set(KEY_ACTIVE, next[0]?.id ?? null);
  }
  return true;
}

export function activeProfileId() {
  return get(KEY_ACTIVE, null);
}

export function activeProfile() {
  const id = activeProfileId();
  return (id && getProfile(id)) || listProfiles()[0] || null;
}

export function setActiveProfile(id) {
  if (!getProfile(id)) return false;
  set(KEY_ACTIVE, id);
  return true;
}

/* ------------------------------------------------------------------
   One-time migration from the preset-only era (v1 → v2).
   A stored persona + location becomes a real owned profile.
------------------------------------------------------------------ */
export function migrateLegacy() {
  if (get(KEY_LIST, null) !== null) return false; // already on v2
  const legacyPersona = get('persona', null);
  if (!legacyPersona || !PERSONAS[legacyPersona]) return false;
  const legacyLoc = get('location', null);
  const legacyUnits = get('units', 'metric');
  const profile = normalise({
    name: 'Me',
    emoji: EMOJI_BY_LENS[legacyPersona] ?? '🙂',
    color: legacyPersona === 'fitness' ? 'green'
      : legacyPersona === 'commuter' ? 'orange'
      : legacyPersona === 'agriculture' ? 'leaf'
      : legacyPersona === 'traveler' ? 'violet'
      : 'yellow',
    home: legacyLoc ?? { name: 'Ghaziabad', admin1: 'Uttar Pradesh', country: 'India', lat: 28.6692, lon: 77.4538 },
    lens: legacyPersona,
    sensitivities: {},
  });
  persist([profile]);
  set(KEY_ACTIVE, profile.id);
  return true;
}

/** Human line describing a profile, used across UI. */
export function profileTagline(p) {
  const lens = LENS_INFO[p.lens];
  const sens = SENSITIVITY_KEYS.filter((k) => p.sensitivities?.[k]).map((k) => SENSITIVITY_INFO[k].emoji);
  return [lens ? `${lens.icon} ${lens.name}` : null, sens.join(' '), p.home?.name ? `📍 ${p.home.name}` : null]
    .filter(Boolean).join(' · ');
}
