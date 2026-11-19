/**
 * you.js — "Make Mausam yours" — the volatile profile editor (v4, designed).
 *
 * Lives inside Settings as its first zone card. The signature of the page
 * is here: a live Mitra preview bubble that re-reads the draft as you
 * edit — every keystroke and tap re-answers "how will Mitra talk to me?"
 * with a blur-in swap (the page's one authored motion moment; reduced-
 * motion users get the text change without the animation).
 *
 * The draft/save model stays visible: every mutation flips the sticky
 * state bar, section titles carry live counts, starter packs pre-fill
 * chips — starting points, never identities.
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
   container host the profile editor (Settings renders it as the body of
   the profile zone card). Same draft/hooks lifecycle; callers only pick
   the target. The sticky save bar is a page-level sibling: youActionBar(). */
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

/* ---------- label maps for the live preview ---------- */
const INT_LABEL = Object.fromEntries(INTERESTS.map(([id, labelKey]) => [id, labelKey]));
const SENS_ORDER = ['heat', 'cold', 'rain', 'air', 'dust', 'humidity'];

/* ---------- the signature: live Mitra preview ----------
   syncMeta() touches only text nodes and class lists — never rebuilds —
   so it is safe to call from every keystroke and tap without stealing
   focus or scroll. The preview text swaps with a blur-in (filter is in
   the motion palette; WAAPI fill:none keeps the resting state identical
   to a no-JS load). */
function syncMeta() {
  setPreview(previewText());
  const intCount = document.getElementById('you-int-count');
  if (intCount) intCount.textContent = intCountText();
  const sensCount = document.getElementById('you-sens-count');
  if (sensCount) sensCount.textContent = sensCountText();
  paintState();
}

function setPreview(text) {
  const txt = document.getElementById('you-prev-text');
  if (!txt || txt.textContent === text) return;
  txt.textContent = text;
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try {
    txt.animate(
      [
        { opacity: 0, transform: 'translateY(5px)', filter: 'blur(4px)' },
        { opacity: 1, transform: 'translateY(0)', filter: 'blur(0px)' },
      ],
      { duration: 220, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
    );
  } catch { /* very old engines: text already updated */ }
}

function previewText() {
  const name = (draft.name ?? '').trim();
  const tone = draft.tone ?? 'simple';
  const intKey = draft.interests?.[0] ? INT_LABEL[draft.interests[0]] : null;
  const sensId = SENS_ORDER.find((s) => draft.sensitive?.[s]);
  if (!name && !intKey && !sensId && !draft.scheduleOn) return t('you_prev_empty');
  /* labels arrive Title Case ("Commute") — inside a sentence they ride
     lowercase; the final charAt-capitalize restores sentence-initial */
  const lc = (w) => w.charAt(0).toLowerCase() + w.slice(1);
  const intT = intKey ? lc(t(intKey)) : t('you_prev_fb_int');
  const sensT = sensId ? lc(t(`you_prev_sens_${sensId}`)) : t('you_prev_fb_sens');
  let body = t(`you_prev_${tone}`, { interest: intT, sens: sensT });
  if (name) body = `${name}, ${body}`;
  body = body.charAt(0).toUpperCase() + body.slice(1);
  if (draft.scheduleOn) body += ' ' + t('you_prev_sched', { t: draft.schedule?.leaveAm ?? '07:00' });
  return body;
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
  const mount = target;
  if (!mount) return;
  clear(mount);

  /* ---------- the signature: live Mitra preview bubble ---------- */
  mount.appendChild(el('div.you-prev',
    el('div.you-prev-head',
      el('span.you-prev-avatar', { 'aria-hidden': 'true' }, icon('chat', 'you-prev-ico')),
      el('span', null, t('nav_mitra')),
    ),
    el('div.you-prev-text', { id: 'you-prev-text', role: 'status' }, previewText()),
  ));

  /* ---------- quick starts: one-tap packs, horizontal scroller ---------- */
  mount.appendChild(el('div.set-rowcol',
    el('div.set-row-t', null, t('you_quick')),
    el('div.pack-scroll',
      PACKS.map((p) => el('button.pack-chip', {
        type: 'button',
        onclick: () => { applyPack(p); },
      }, icon(p.glyph ?? 'home', 'chip-ico'), t(p.label))),
      el('button.pack-chip.pack-fresh', {
        type: 'button', onclick: () => { draft = emptyProfile(); dirty = true; build(lastTarget); },
      }, icon('sparkles', 'chip-ico'), t('pack_fresh')),
    ),
  ));

  /* ---------- name ---------- */
  mount.appendChild(el('div.set-rowcol',
    el('div.set-row-t', null, t('you_name_r')),
    el('input.set-input', {
      type: 'text', placeholder: t('you_name').replace(/\s*\(.*\)\s*$/, ''), maxlength: '24',
      autocomplete: 'off', value: draft.name ?? '',
      oninput: (e) => { draft.name = e.target.value.trim(); touch(); },
    }),
  ));

  /* ---------- gender + age: compact label-left / select-right rows ---------- */
  const genderSel = el('select.set-select.set-select-sm', { onchange: (e) => { draft.gender = e.target.value; touch(); } },
    ['', 'female', 'male', 'other'].map((v) =>
      el('option', { value: v, selected: (draft.gender ?? '') === v }, v ? t(`gender_${v}`) : '—')),
  );
  const ageSel = el('select.set-select.set-select-sm', { onchange: (e) => { draft.age = e.target.value; touch(); } },
    ['', 'teen', 'young', 'adult', 'senior'].map((v) =>
      el('option', { value: v, selected: (draft.age ?? '') === v }, v ? t(`age_${v}`) : '—')),
  );
  mount.appendChild(row(genderRowTitle(), genderSel));
  mount.appendChild(row(el('div.set-row-t', null, t('you_age_r')), ageSel));

  /* ---------- schedule: toggle row + 2×2 time grid ---------- */
  const timesGrid = el('div.you-times',
    timeField(t('you_wake'), 'wake'),
    timeField(t('you_leave'), 'leaveAm'),
    timeField(t('you_back'), 'backPm'),
    timeField(t('you_sleep'), 'sleep'),
  );
  timesGrid.style.display = draft.scheduleOn ? '' : 'none';
  mount.appendChild(el('div.set-rowcol',
    el('div.set-row',
      el('div.set-row-tx',
        el('div.set-row-t', null, t('you_sched_t')),
        el('div.set-row-d', null, t('you_sched_d')),
      ),
      switchEl(draft.scheduleOn, (on, btn) => {
        draft.scheduleOn = on;
        timesGrid.style.display = on ? '' : 'none';
        touch();
      }),
    ),
    timesGrid,
  ));

  /* ---------- interests ---------- */
  const tagsBox = el('div.custom-tags');
  const paintTags = () => {
    clear(tagsBox);
    if (!draft.customTags.length) return;
    tagsBox.appendChild(el('div.chip-grid',
      draft.customTags.map((tag, i) =>
        el('button.chip.you-chip.on.tag-chip', {
          type: 'button', title: t('place_removed'), 'aria-pressed': 'true',
          onclick: () => { draft.customTags.splice(i, 1); paintTags(); touch(); },
        }, `${tag} ✕`)),
    ));
  };
  paintTags();
  mount.appendChild(el('div.set-rowcol',
    titleWithCount(t('you_interests'), 'you-int-count'),
    el('div.chip-grid',
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
            paintTags();
            touch();
          }
        },
      }, t('you_add_own')),
    ),
    tagsBox,
  ));

  /* ---------- sensitivities ---------- */
  mount.appendChild(el('div.set-rowcol',
    titleWithCount(t('you_sens'), 'you-sens-count'),
    el('div.chip-grid',
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
    ),
  ));

  /* ---------- tone ---------- */
  mount.appendChild(el('div.set-row',
    el('div.set-row-tx', el('div.set-row-t', null, t('you_tone'))),
    el('div.set-row-ctl',
      el('div.seg-group.seg-compact',
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
      ),
    ),
  ));

  /* ---------- notes ---------- */
  mount.appendChild(el('div.set-rowcol',
    el('div.set-row-t', null, t('you_notes')),
    el('textarea.set-input.you-notes', {
      rows: '3', maxlength: '400', placeholder: t('you_notes_ph'),
      oninput: (e) => { draft.notes = e.target.value; touch(); },
    }, draft.notes ?? ''),
  ));

  /* ---------- sticky save bar is a page-level sibling (youActionBar) ---------- */
  paintState();

  function genderRowTitle() {
    return el('div.set-row-tx',
      el('div.set-row-t', null, t('you_gender_r')),
      el('div.set-row-d', null, t('you_gender_d')),
    );
  }

  function timeField(label, key) {
    return el('label.you-time', null,
      el('span.you-time-l', null, label),
      el('select.you-select', {
        onchange: (e) => { draft.schedule = draft.schedule ?? {}; draft.schedule[key] = e.target.value; touch(); },
      },
        HOURS.map((h) => el('option', { value: h, selected: h === (draft.schedule?.[key] ?? '07:00') }, h))),
    );
  }
}

function row(titleNode, ctl) {
  return el('div.set-row',
    el('div.set-row-tx', titleNode),
    el('div.set-row-ctl', ctl),
  );
}

function titleWithCount(text, countId) {
  return el('div.set-row-t.set-row-t-count',
    el('span', null, text),
    el('span.you-count', { id: countId }),
  );
}

/* local switch — settings.js owns the toggle grammar, but importing it
   here would cycle (settings.js imports you.js). Same markup, same CSS. */
function switchEl(on, onChange) {
  const knob = el('span.toggle-knob');
  const btn = el('button.toggle', {
    type: 'button', role: 'switch', 'aria-checked': String(on), class: on ? 'on' : '',
    onclick: () => {
      const next = !btn.classList.contains('on');
      btn.classList.toggle('on', next);
      btn.setAttribute('aria-checked', String(next));
      onChange(next, btn);
    },
  }, knob);
  return btn;
}

const HOURS = Array.from({ length: 24 * 2 }, (_, i) => {
  const h = Math.floor(i / 2), m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
});

/* ---------- sticky state bar (page-level, above the bottom nav) ----------
   The draft→save model made visible: live unsaved dot or saved-at stamp on
   the left, Reset + Save on the right. Rendered by settings.js right after
   the profile zone so the bar's sticky range is the whole page. */
export function youActionBar() {
  const bar = el('div.sheet-actions.you-actions',
    el('div.you-state', { id: 'you-state', role: 'status', 'aria-live': 'polite' }),
    el('div.you-actions-btns',
      el('button.btn.btn-sm', { type: 'button', onclick: reset }, t('you_reset')),
      el('button.btn.btn-sm.btn-primary', { type: 'button', onclick: save }, t('you_save')),
    ),
  );
  /* paintState looks the bar up by id — it only resolves once the bar is
     in the document (settings.js appends it right after this returns).
     One frame of deference beats a permanently blank state line. */
  requestAnimationFrame(() => paintState());
  return bar;
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
