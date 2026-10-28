/**
 * you.js — "Make Mausam yours" — the volatile profile page (v2).
 *
 * Full tab page (not a modal). Everything is optional, everything is
 * editable any time, saving is instant and the app re-shapes itself.
 * Starter packs pre-fill chips — starting points, never identities.
 */

import { el, clear } from '../utils/dom.js';
import { icon } from './icons.js';
import { store } from '../core/storage.js';
import { t } from '../core/i18n.js';
import {
  INTERESTS, SENSITIVITIES, PACKS,
  emptyProfile, getProfile, saveProfile, clearProfile,
} from '../core/profile.js';

let mount = null;
let hooks = null;
let draft = null;
let built = false;

export function wireYouPage(mountEl, hooksIn) {
  mount = mountEl;
  hooks = hooksIn;
}

/** Re-render the page (called when the tab opens or profile changed). */
export function renderYou() {
  if (!mount) return;
  draft = JSON.parse(JSON.stringify(getProfile() ?? emptyProfile()));
  build();
  built = true;
}

export function isYouBuilt() { return built; }

function build() {
  clear(mount);

  /* ---------- intro ---------- */
  mount.appendChild(el('div.you-intro',
    el('div.you-hello', null, icon('you', 'you-hello-ico'), draft.name ? ` ${t('nav_you')} · ${draft.name}` : ` ${t('you_title')}`),
    el('div.you-intro-text', null, t('you_intro')),
  ));

  /* ---------- starter packs ---------- */
  mount.appendChild(blockTitle(t('you_starters')));
  mount.appendChild(el('div.pack-grid',
    PACKS.map((p) => el('button.pack-chip', {
      type: 'button',
      onclick: () => { applyPack(p); },
    }, icon(p.glyph ?? 'home', 'chip-ico'), t(p.label))),
    el('button.pack-chip.pack-fresh', { type: 'button', onclick: () => { draft = emptyProfile(); build(); } }, icon('sparkles', 'chip-ico'), t('pack_fresh')),
  ));

  /* ---------- name ---------- */
  mount.appendChild(field(t('you_name'),
    el('input.set-input', {
      type: 'text', placeholder: t('you_name').replace('?', ''), maxlength: '24',
      autocomplete: 'off', value: draft.name ?? '',
      oninput: (e) => { draft.name = e.target.value.trim(); },
    })
  ));

  /* ---------- gender + age ---------- */
  const genderSel = el('select.set-select', { onchange: (e) => { draft.gender = e.target.value; } },
    ['', 'female', 'male', 'other'].map((v) =>
      el('option', { value: v, selected: (draft.gender ?? '') === v }, v ? t(`gender_${v}`) : '—')),
  );
  const ageSel = el('select.set-select', { onchange: (e) => { draft.age = e.target.value; } },
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
  /* v0.8.11: the clock emoji joins the glyph language — UI chrome on this page
     (identity emoji on the pack/interest chips stay by design). */
  const schedOn = el('button.chip.you-chip', {
    type: 'button', class: draft.scheduleOn ? 'on' : '',
    onclick: (e) => {
      draft.scheduleOn = !draft.scheduleOn;
      e.currentTarget.classList.toggle('on');
      e.currentTarget.closest('.you-block').querySelector('.you-times').style.display = draft.scheduleOn ? '' : 'none';
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
  mount.appendChild(blockTitle(t('you_interests')));
  mount.appendChild(el('div.chip-grid',
    INTERESTS.map(([id, labelKey, glyph]) =>
      el('button.chip.you-chip', {
        type: 'button',
        class: draft.interests.includes(id) ? 'on' : '',
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
          type: 'button', title: t('place_removed'),
          onclick: () => { draft.customTags.splice(i, 1); buildTags(); },
        }, `${tag} ✕`)),
    ));
  }
  buildTags();

  /* ---------- sensitivities ---------- */
  mount.appendChild(blockTitle(t('you_sens')));
  mount.appendChild(el('div.chip-grid',
    SENSITIVITIES.map(([id, labelKey, glyph]) =>
      el('button.chip.you-chip', {
        type: 'button',
        class: draft.sensitive?.[id] ? 'on' : '',
        onclick: (e) => {
          draft.sensitive = draft.sensitive ?? {};
          draft.sensitive[id] = !draft.sensitive[id];
          e.currentTarget.classList.toggle('on');
        },
      }, icon(glyph, 'chip-ico'), t(labelKey))),
  ));

  /* ---------- tone ---------- */
  mount.appendChild(blockTitle(t('you_tone')));
  mount.appendChild(el('div.seg-group.set-seg',
    ['simple', 'detailed', 'fun'].map((tone) =>
      el('button.seg-btn', {
        type: 'button', class: draft.tone === tone ? 'active' : '',
        onclick: (e) => {
          draft.tone = tone;
          e.currentTarget.parentElement.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
        },
      }, t(`you_tone_${tone}`))),
  ));

  /* ---------- notes ---------- */
  mount.appendChild(field(t('you_notes'),
    el('textarea.set-input.you-notes', {
      rows: '3', maxlength: '400', placeholder: t('you_notes_ph'),
      oninput: (e) => { draft.notes = e.target.value; },
    }, draft.notes ?? '')
  ));

  /* ---------- actions ---------- */
  mount.appendChild(el('div.sheet-actions.you-actions',
    el('button.btn.btn-primary.btn-lg', { type: 'button', onclick: save }, t('you_save')),
    el('button.btn.btn-lg', { type: 'button', onclick: () => { clearProfile(); draft = emptyProfile(); build(); hooks?.onSaved?.(); } }, t('you_reset')),
  ));
  if (draft.savedAt) {
    mount.appendChild(el('div.you-saved-at', null,
      `${t('saved_since')}: ${new Date(draft.savedAt).toLocaleString()}`));
  }
  mount.appendChild(el('div.you-privacy', null, icon('lock', 'chip-ico'), ' ', t('you_intro')));

  function timeField(label, key) {
    return el('label.you-time', null, label + ' ',
      el('select.you-select', {
        onchange: (e) => { draft.schedule = draft.schedule ?? {}; draft.schedule[key] = e.target.value; },
      },
        HOURS.map((h) => el('option', { value: h, selected: h === (draft.schedule?.[key] ?? '07:00') }, h))));
  }
}

const HOURS = Array.from({ length: 24 * 2 }, (_, i) => {
  const h = Math.floor(i / 2), m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
});

function blockTitle(text) {
  return el('div.you-block-title', null, text);
}
function field(label, control) {
  return el('div.you-block', el('div.you-label', null, label), control);
}

function toggleInterest(id, btn) {
  const list = new Set(draft.interests ?? []);
  list.has(id) ? list.delete(id) : list.add(id);
  draft.interests = [...list];
  btn.classList.toggle('on');
}

function applyPack(pack) {
  draft.interests = [...pack.interests];
  draft.customTags = draft.customTags ?? [];
  draft.sensitive = { heat: false, cold: false, rain: false, air: false, dust: false, humidity: false };
  for (const s of pack.sens ?? []) draft.sensitive[s] = true;
  if (pack.schedule) { draft.schedule = { ...draft.schedule, ...pack.schedule }; draft.scheduleOn = true; }
  build();
}

function save() {
  saveProfile(draft);
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
