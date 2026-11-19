/**
 * you.js — "Make Mausam yours" — the volatile profile editor (v3).
 *
 * Lives inside Settings as its first block (the former You tab). The
 * draft/save model is now VISIBLE: every mutation flips a sticky state
 * bar to "unsaved changes", the summary line under the section title
 * re-reads the draft live, and the section eyebrows carry live counts.
 * Starter packs pre-fill chips — starting points, never identities.
 */

import { el, clear } from '../utils/dom.js';
import { icon } from './icons.js';
import { t } from '../core/i18n.js';
import {
  INTERESTS, SENSITIVITIES, PACKS,
  emptyProfile, getProfile, saveProfile, clearProfile,
} from '../core/profile.js';

let mount = null;
let hooks = null;
let draft = null;
let built = false;
let lastTarget = null;
let dirty = false;

export function wireYouPage(mountEl, hooksIn) {
  mount = mountEl;
  hooks = hooksIn;
}

/** Re-render the page (called when the tab opens or profile changed). */
export function renderYou() {
  if (!mount) return;
  renderYouInto(mount);
}

/* v0.8.57: the You tab merged into Settings — renderYouInto lets any
   container host the profile editor (Settings renders it as its first
   block). Same draft/hooks lifecycle; callers only pick the target. */
export function renderYouInto(target) {
  if (!target) return;
  lastTarget = target;
  /* re-renders happen on theme/lang/accent switches — an unsaved draft
     must survive them (silently discarding a half-edited profile is the
     kind of data loss a settings page never commits). Only a clean
     state re-syncs from storage. */
  if (!dirty || !draft) {
    draft = JSON.parse(JSON.stringify(getProfile() ?? emptyProfile()));
    dirty = false;
  }
  build(target);
  built = true;
}

export function isYouBuilt() { return built; }

/* ---------- live meta: summary + state bar + counts ----------
   syncMeta() touches only text nodes and class lists — never rebuilds —
   so it is safe to call from every keystroke and tap without stealing
   focus or scroll. */
function syncMeta() {
  const sum = document.getElementById('you-sum');
  if (sum) sum.textContent = sumText();
  const intCount = document.getElementById('you-int-count');
  if (intCount) intCount.textContent = intCountText();
  const sensCount = document.getElementById('you-sens-count');
  if (sensCount) sensCount.textContent = sensCountText();
  paintState();
}

function paintState() {
  const state = document.getElementById('you-state');
  if (!state) return;
  clear(state);
  if (dirty) {
    state.appendChild(el('span.you-dirty-dot', { 'aria-hidden': 'true' }));
    state.appendChild(el('span', null, t('you_dirty')));
    state.classList.add('is-dirty');
  } else {
    state.classList.remove('is-dirty');
    if (draft.savedAt) {
      state.appendChild(el('span', null,
        `${t('saved_since')} ${new Date(draft.savedAt).toLocaleString()}`));
    }
  }
}

function sumText() {
  if (!draft.name) return t('you_sum_hint');
  const bits = [draft.name];
  const n = intCount();
  if (n) bits.push(t('you_count', { n }));
  return bits.join(' · ');
}

function intCount() {
  return (draft.interests?.length ?? 0) + (draft.customTags?.length ?? 0);
}
function intCountText() {
  const n = intCount();
  return n ? t('you_count', { n }) : '';
}
function sensCountText() {
  const s = Object.values(draft.sensitive ?? {}).filter(Boolean).length;
  return s ? t('you_count', { n: s }) : '';
}

/** Every draft mutation routes through touch(): flips the dirty flag and
    repaints the live meta. Cheap on purpose — no re-render. */
function touch() {
  dirty = true;
  syncMeta();
}

function build(target) {
  const mount = target ?? null;
  if (!mount) return;
  clear(mount);

  /* ---------- head: eyebrow + live summary line ---------- */
  mount.appendChild(el('div.you-head',
    el('div.you-block-title', null, t('you_title')),
    el('div.you-sum', { id: 'you-sum', role: 'status' }, sumText()),
  ));

  /* ---------- starter packs ---------- */
  mount.appendChild(blockTitle(t('you_starters')));
  mount.appendChild(el('div.pack-grid',
    PACKS.map((p) => el('button.pack-chip', {
      type: 'button',
      onclick: () => { applyPack(p); },
    }, icon(p.glyph ?? 'home', 'chip-ico'), t(p.label))),
    el('button.pack-chip.pack-fresh', { type: 'button', onclick: () => { draft = emptyProfile(); dirty = true; build(lastTarget); } }, icon('sparkles', 'chip-ico'), t('pack_fresh')),
  ));

  /* ---------- name ---------- */
  mount.appendChild(field(t('you_name'),
    el('input.set-input', {
      type: 'text', placeholder: t('you_name').replace('?', ''), maxlength: '24',
      autocomplete: 'off', value: draft.name ?? '',
      oninput: (e) => { draft.name = e.target.value.trim(); touch(); },
    })
  ));

  /* ---------- gender + age ---------- */
  const genderSel = el('select.set-select', { onchange: (e) => { draft.gender = e.target.value; touch(); } },
    ['', 'female', 'male', 'other'].map((v) =>
      el('option', { value: v, selected: (draft.gender ?? '') === v }, v ? t(`gender_${v}`) : '—')),
  );
  const ageSel = el('select.set-select', { onchange: (e) => { draft.age = e.target.value; touch(); } },
    ['', 'teen', 'young', 'adult', 'senior'].map((v) =>
      el('option', { value: v, selected: (draft.age ?? '') === v }, v ? t(`age_${v}`) : '—')),
  );
  mount.appendChild(el('div.you-2col',
    field(t('you_gender'), genderSel),
    field(t('you_age'), ageSel),
  ));

  /* ---------- schedule ---------- */
  mount.appendChild(blockTitle(t('you_schedule')));
  /* v0.8.9: the chip previously read '⏰ On / Off' — a toggle that never
     said WHAT it toggled. Label it by what it controls; the .on state
     styling (accent ring) already communicates on/off. */
  const schedOn = el('button.chip.you-chip', {
    type: 'button', class: draft.scheduleOn ? 'on' : '',
    onclick: (e) => {
      draft.scheduleOn = !draft.scheduleOn;
      e.currentTarget.classList.toggle('on');
      e.currentTarget.closest('.you-block').querySelector('.you-times').style.display = draft.scheduleOn ? '' : 'none';
      touch();
    },
  }, icon('clock', 'chip-ico'), ' ' + t('you_sched_chip'));
  mount.appendChild(el('div.you-block', schedOn,
    el('div.you-times', { style: { display: draft.scheduleOn ? '' : 'none' } },
      timeField(t('you_wake'), 'wake'),
      timeField(t('you_leave'), 'leaveAm'),
      timeField(t('you_back'), 'backPm'),
      timeField(t('you_sleep'), 'sleep'),
    )
  ));

  /* ---------- interests ---------- */
  mount.appendChild(blockTitle(t('you_interests'), 'you-int-count'));
  mount.appendChild(el('div.chip-grid',
    INTERESTS.map(([id, labelKey, glyph]) =>
      el('button.chip.you-chip', {
        type: 'button',
        class: draft.interests.includes(id) ? 'on' : '',
        'aria-pressed': String(draft.interests.includes(id)),
        onclick: (e) => toggleInterest(id, e.currentTarget),
      }, icon(glyph, 'chip-ico'), t(labelKey))),
    el('button.chip.you-chip.you-add', {
      type: 'button',
      onclick: (e) => {
        const grid = e.currentTarget.parentElement;
        grid.querySelector('.you-own-row')?.remove();
        const row = el('div.you-own-row',
          el('input.set-input', {
            type: 'text', placeholder: t('you_own_ph'), maxlength: '40',
            autocomplete: 'off',
            onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); commit(); } },
          }),
          el('button.btn.btn-sm.btn-primary', { type: 'button', 'aria-label': 'Add', title: 'Add', onclick: () => commit() }, '✓'),
        );
        grid.appendChild(row);
        row.querySelector('input').focus();
        function commit() {
          const inp = row.querySelector('input');
          const val = inp.value.trim();
          if (!val) return;
          draft.customTags = [...new Set([...(draft.customTags ?? []), val])];
          inp.value = '';
          buildTags();
          touch();
        }
      },
    }, t('you_add_own')),
  ));
  const tagsMount = el('div.custom-tags');
  mount.appendChild(tagsMount);
  function buildTags() {
    clear(tagsMount);
    if (!draft.customTags.length) return;
    tagsMount.appendChild(el('div.chip-grid',
      draft.customTags.map((tag, i) =>
        el('button.chip.you-chip.on.tag-chip', {
          type: 'button', title: t('place_removed'), 'aria-pressed': 'true',
          onclick: () => { draft.customTags.splice(i, 1); buildTags(); touch(); },
        }, `${tag} ✕`)),
    ));
  }
  buildTags();

  /* ---------- sensitivities ---------- */
  mount.appendChild(blockTitle(t('you_sens'), 'you-sens-count'));
  mount.appendChild(el('div.chip-grid',
    SENSITIVITIES.map(([id, labelKey, glyph]) =>
      el('button.chip.you-chip', {
        type: 'button',
        class: draft.sensitive?.[id] ? 'on' : '',
        'aria-pressed': String(Boolean(draft.sensitive?.[id])),
        onclick: (e) => {
          draft.sensitive = draft.sensitive ?? {};
          draft.sensitive[id] = !draft.sensitive[id];
          e.currentTarget.classList.toggle('on');
          e.currentTarget.setAttribute('aria-pressed', String(draft.sensitive[id]));
          touch();
        },
      }, icon(glyph, 'chip-ico'), t(labelKey))),
  ));

  /* ---------- tone ---------- */
  mount.appendChild(blockTitle(t('you_tone')));
  mount.appendChild(el('div.seg-group.set-seg',
    ['simple', 'detailed', 'fun'].map((tone) =>
      el('button.seg-btn', {
        type: 'button', class: draft.tone === tone ? 'active' : '',
        'aria-pressed': String(draft.tone === tone),
        onclick: (e) => {
          draft.tone = tone;
          e.currentTarget.parentElement.querySelectorAll('.seg-btn').forEach((b) => {
            b.classList.remove('active'); b.setAttribute('aria-pressed', 'false');
          });
          e.currentTarget.classList.add('active');
          e.currentTarget.setAttribute('aria-pressed', 'true');
          touch();
        },
      }, t(`you_tone_${tone}`))),
  ));

  /* ---------- notes ---------- */
  mount.appendChild(field(t('you_notes'),
    el('textarea.set-input.you-notes', {
      rows: '3', maxlength: '400', placeholder: t('you_notes_ph'),
      oninput: (e) => { draft.notes = e.target.value; touch(); },
    }, draft.notes ?? '')
  ));

  /* ---------- sticky state bar ----------
     The draft/save model made visible: live unsaved dot or saved-at on
     the left, Reset + Save on the right. Sticks above the bottom nav so
     the actions are never scrolled out of reach. */
  mount.appendChild(el('div.sheet-actions.you-actions',
    el('div.you-state', { id: 'you-state', role: 'status', 'aria-live': 'polite' }),
    el('div.you-actions-btns',
      el('button.btn.btn-sm', { type: 'button', onclick: reset }, t('you_reset')),
      el('button.btn.btn-sm.btn-primary', { type: 'button', onclick: save }, t('you_save')),
    ),
  ));
  paintState();

  function timeField(label, key) {
    return el('label.you-time', null, label + ' ',
      el('select.you-select', {
        onchange: (e) => { draft.schedule = draft.schedule ?? {}; draft.schedule[key] = e.target.value; touch(); },
      },
        HOURS.map((h) => el('option', { value: h, selected: h === (draft.schedule?.[key] ?? '07:00') }, h))));
  }
}

const HOURS = Array.from({ length: 24 * 2 }, (_, i) => {
  const h = Math.floor(i / 2), m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
});

function blockTitle(text, countId = null) {
  const title = el('span.you-block-title-text', null, text);
  const kids = [title];
  if (countId) kids.push(el('span.you-count', { id: countId }));
  return el('div.you-block-title', null, ...kids);
}
function field(label, control) {
  return el('div.you-block', el('div.you-label', null, label), control);
}

function toggleInterest(id, btn) {
  const list = new Set(draft.interests ?? []);
  if (list.has(id)) list.delete(id); else list.add(id);
  draft.interests = [...list];
  btn.classList.toggle('on');
  btn.setAttribute('aria-pressed', String(list.has(id)));
  touch();
}

function applyPack(pack) {
  draft.interests = [...pack.interests];
  draft.customTags = draft.customTags ?? [];
  draft.sensitive = { heat: false, cold: false, rain: false, air: false, dust: false, humidity: false };
  for (const s of pack.sens ?? []) draft.sensitive[s] = true;
  if (pack.schedule) { draft.schedule = { ...draft.schedule, ...pack.schedule }; draft.scheduleOn = true; }
  build(lastTarget);
  touch();
}

function reset() {
  clearProfile();
  draft = emptyProfile();
  dirty = false;
  build(lastTarget);
  hooks?.onSaved?.();
}

function save() {
  draft.savedAt = Date.now();
  saveProfile(draft);
  dirty = false;
  syncMeta();
  hooks?.onSaved?.();
  toast(t('you_stored'));
}

function toast(msg) {
  const tEl = el('div.mausam-toast', { role: 'status' }, msg);
  document.body.appendChild(tEl);
  requestAnimationFrame(() => tEl.classList.add('show'));
  setTimeout(() => {
    tEl.classList.remove('show');
    setTimeout(() => tEl.remove(), 350);
  }, 2400);
}
