/**
 * profile.js — the volatile, deeply-custom "You" profile (v2).
 *
 * Design contract (from the user):
 *   - custom: 20+ interest chips + unlimited free-text tags + schedule +
 *     sensitivities + tone + free-form notes — the user shapes it freely
 *   - volatile: editable any time, instantly applied, never blocking,
 *     never gating data; stored on-device only
 *   - starter packs PRE-FILL the chips (starting points, not identities —
 *     the user edits everything afterwards)
 */

import { store } from './storage.js';
import { t } from './i18n.js';

/* ---------------- catalog ---------------- */

/* v0.8.13: third element = chrome glyph key (icons.js) — the You page
   speaks the same stroke-glyph language as the rest of the app. */
export const INTERESTS = [
  ['commute', 'int_commute', 'scooter'],
  ['farming', 'int_farming', 'crops'],
  ['health', 'int_health', 'pulse'],
  ['fitness', 'int_fitness', 'run'],
  ['cricket', 'int_cricket', 'cricket'],
  ['travel', 'int_travel', 'compass'],
  ['laundry', 'int_laundry', 'shirt'],
  ['cooking', 'int_cooking', 'pan'],
  ['kids', 'int_kids', 'backpack'],
  ['elders', 'int_elders', 'heart'],
  ['wedding', 'int_wedding', 'ring'],
  ['skin', 'int_skin', 'sparkles'],
  ['pets', 'int_pets', 'paw'],
  ['shop', 'int_shop', 'shop'],
  ['fishing', 'int_fishing', 'fish'],
  ['cycling', 'int_cycling', 'bike'],
  ['photography', 'int_photography', 'camera'],
  ['events', 'int_events', 'diya'],
  ['study', 'int_study', 'book'],
  ['construction', 'int_construction', 'bricks'],
];

export const SENSITIVITIES = [
  ['heat', 'sens_heat', 'thermo'],
  ['cold', 'sens_cold', 'snowflake'],
  ['rain', 'sens_rain', 'umbrella'],
  ['air', 'sens_air', 'wind'],
  ['dust', 'sens_dust', 'haze'],
  ['humidity', 'sens_humidity', 'droplet'],
];

export const PACKS = [
  { id: 'farmer', label: 'pack_farmer', glyph: 'crops', interests: ['farming'], sens: ['heat', 'dust'], schedule: { wake: '05:30', leaveAm: '06:30', backPm: '18:00', sleep: '22:00' } },
  { id: 'student', label: 'pack_student', glyph: 'backpack', interests: ['study', 'commute'], sens: [], schedule: { wake: '06:30', leaveAm: '07:30', backPm: '16:00', sleep: '23:00' } },
  { id: 'commute', label: 'pack_commute', glyph: 'scooter', interests: ['commute', 'laundry'], sens: ['rain'], schedule: { wake: '07:00', leaveAm: '08:30', backPm: '18:30', sleep: '23:30' } },
  { id: 'home', label: 'pack_home', glyph: 'home', interests: ['laundry', 'cooking', 'kids'], sens: [], schedule: { wake: '06:00', leaveAm: '09:00', backPm: '17:30', sleep: '22:30' } },
  { id: 'wedding', label: 'pack_wedding', glyph: 'ring', interests: ['wedding', 'events', 'travel'], sens: [], schedule: { wake: '07:30', leaveAm: '10:00', backPm: '22:00', sleep: '00:00' } },
  { id: 'fitness', label: 'pack_fitness', glyph: 'run', interests: ['fitness', 'cycling', 'health'], sens: ['air'], schedule: { wake: '05:45', leaveAm: '06:15', backPm: '19:00', sleep: '22:30' } },
  { id: 'travel', label: 'pack_travel', glyph: 'compass', interests: ['travel', 'photography'], sens: [], schedule: { wake: '07:00', leaveAm: '09:00', backPm: '20:00', sleep: '23:00' } },
  { id: 'shop', label: 'pack_shop', glyph: 'shop', interests: ['shop', 'commute'], sens: ['rain'], schedule: { wake: '07:30', leaveAm: '09:00', backPm: '21:00', sleep: '23:30' } },
  { id: 'elder', label: 'pack_elder', glyph: 'heart', interests: ['elders', 'health'], sens: ['heat', 'cold'], schedule: { wake: '05:30', leaveAm: '06:30', backPm: '18:00', sleep: '21:30' } },
];

/** Default shape — every field optional-ish, everything editable later. */
export function emptyProfile() {
  return {
    v: 2,
    name: '',
    gender: '',
    age: '',
    schedule: { wake: '07:00', leaveAm: '08:30', backPm: '18:30', sleep: '23:00' },
    scheduleOn: false,
    interests: [],
    customTags: [],
    sensitive: { heat: false, cold: false, rain: false, air: false, dust: false, humidity: false },
    tone: 'simple', // 'simple' | 'detailed' | 'fun'
    notes: '',
    savedAt: null,
  };
}

/* ---------------- accessors ---------------- */

/** Get the active profile, migrating v1 `you` data if present. */
export function getProfile() {
  let p = store.profile.get();
  if (p && p.v === 2) return normalize(p);
  // migrate v1
  const you = store.you.get();
  if (you) {
    p = emptyProfile();
    p.name = you.name ?? '';
    p.interests = Array.isArray(you.activities) ? [...you.activities] : [];
    p.schedule = {
      wake: you.commute?.am ? shiftTime(you.commute.am, -90) : '07:00',
      leaveAm: you.commute?.am ?? '08:30',
      backPm: you.commute?.pm ?? '18:30',
      sleep: you.commute?.pm ? shiftTime(you.commute.pm, 300) : '23:00',
    };
    p.scheduleOn = Boolean(you.commute?.am);
    for (const k of ['heat', 'cold', 'rain', 'air']) p.sensitive[k] = Boolean(you.sensitive?.[k]);
    p.savedAt = you.savedAt ?? Date.now();
    store.profile.set(p);
    return normalize(p);
  }
  return null;
}

export function saveProfile(draft) {
  const p = normalize({ ...emptyProfile(), ...draft, v: 2, savedAt: Date.now() });
  store.profile.set(p);
  return p;
}

export function clearProfile() {
  store.profile.clear();
  store.you.clear();
}

export function hasProfile() {
  return Boolean(getProfile());
}

function normalize(p) {
  const base = emptyProfile();
  const out = { ...base, ...p };
  out.schedule = { ...base.schedule, ...(p.schedule ?? {}) };
  out.sensitive = { ...base.sensitive, ...(p.sensitive ?? {}) };
  out.interests = (p.interests ?? []).filter((x) => typeof x === 'string');
  out.customTags = (p.customTags ?? []).map((x) => String(x).slice(0, 40)).filter(Boolean).slice(0, 12);
  out.tone = ['simple', 'detailed', 'fun'].includes(p.tone) ? p.tone : 'simple';
  out.notes = String(p.notes ?? '').slice(0, 400);
  return out;
}

function shiftTime(hhmm, deltaMin) {
  const m = String(hhmm ?? '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return hhmm;
  let mins = Number(m[1]) * 60 + Number(m[2]) + deltaMin;
  mins = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/* ---------------- derived helpers ---------------- */

export const timeToMin = (hhmm) => {
  const m = String(hhmm ?? '').match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** All personal context as lines for the AI system prompt. */
export function profileForAI(p, lang) {
  if (!p) return null;
  const lines = [];
  if (p.name) lines.push(`Name: ${p.name}`);
  if (p.gender) lines.push(`Gender: ${p.gender}`);
  if (p.age) lines.push(`Age group: ${p.age}`);
  if (p.scheduleOn) {
    lines.push(`Daily schedule (local): wake ${p.schedule.wake}, leave home ${p.schedule.leaveAm}, back ${p.schedule.backPm}, sleep ${p.schedule.sleep}`);
  }
  const labels = p.interests.map((id) => {
    const entry = INTERESTS.find(([i]) => i === id);
    return entry ? t(entry[1]).replace(/^\S+\s/, '') : id;
  });
  if (labels.length) lines.push(`Interests: ${labels.join(', ')}`);
  if (p.customTags.length) lines.push(`Custom interests: ${p.customTags.join(', ')}`);
  const sens = Object.entries(p.sensitive ?? {}).filter(([, v]) => v).map(([k]) => k);
  if (sens.length) lines.push(`Sensitive to: ${sens.join(', ')} — add one considerate, concrete tip when relevant`);
  if (p.notes) lines.push(`User told us: "${p.notes}"`);
  const tone = p.tone === 'fun'
    ? 'Tone: warm, playful, a little filmy is welcome (light Bollywood flavour), still clear.'
    : p.tone === 'detailed'
      ? 'Tone: expert and thorough; explain the why behind numbers.'
      : 'Tone: simple everyday words, short sentences (many users read quickly on phones).';
  lines.push(tone);
  if (lang && lang !== 'auto') lines.push(`Reply language: ${lang === 'hi' ? 'Hindi (Devanagari)' : lang === 'hinglish' ? 'natural Hinglish — Roman-script Hindi mixed with English words, the way Indian friends text' : 'English'}.`);
  return lines.length ? lines.join('\n') : null;
}
