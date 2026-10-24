/**
 * you.js — "Make Mausam yours": the optional 30-second personalisation.
 *
 * NOT onboarding. The app never forces this, never blocks on it, and the
 * dashboard is 100% complete without it. Filling it simply adds the
 * "For You" rail (commute verdicts, activity windows, sensitivity tips)
 * on top of everything everyone sees. One screen, saved locally, fully
 * resettable.
 */

import { el, clear } from '../utils/dom.js';
import { store } from '../core/storage.js';

const ACTIVITIES = [
  ['commute', '🚗 Commute'],
  ['run', '🏃 Running'],
  ['walk', '🚶 Walking'],
  ['cycling', '🚴 Cycling'],
  ['outdoor', '🧺 Outdoor plans'],
  ['cricket', '🏏 Field sports'],
  ['photography', '📷 Photography'],
  ['laundry', '👕 Laundry'],
];

const SENSITIVITIES = [
  ['heat', '🥵 Heat bothers me'],
  ['cold', '🧣 Cold bothers me'],
  ['rain', '☔ Rain ruins my plans'],
  ['air', '😷 Air quality matters'],
];

const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

let refs = null;
let hooks = null;
let draft = null;

export function wireYou(domRefs, hooksIn) {
  refs = domRefs;
  hooks = hooksIn;
  refs.closeBtn.addEventListener('click', close);
  refs.overlay.addEventListener('click', (e) => { if (e.target === overlaySafe()) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && refs.overlay.classList.contains('active')) close();
  });
  refs.saveBtn.addEventListener('click', save);
  refs.resetBtn.addEventListener('click', reset);
  ensureDraft();
  build();
}

function overlaySafe() { return refs.overlay; }

function ensureDraft() {
  if (draft) return;
  draft = JSON.parse(JSON.stringify(store.you.get() ?? {
    name: '',
    activities: ['commute'],
    commute: { am: '08:00', pm: '18:00' },
    sensitive: { heat: false, cold: false, rain: false, air: false },
  }));
}

export function openYou() {
  draft = null;
  ensureDraft();
  build();
  refs.overlay.classList.add('active');
}

export function close() {
  refs.overlay.classList.remove('active');
}

function build() {
  clear(refs.body);

  /* name */
  refs.body.appendChild(el('div.you-block',
    el('div.you-label', null, 'What should I call you? (optional)'),
    el('input.set-input', {
      type: 'text', placeholder: 'Your name', maxlength: '24', autocomplete: 'off',
      value: draft.name ?? '',
      oninput: (e) => { draft.name = e.target.value.trim(); },
    })
  ));

  /* commute */
  refs.body.appendChild(el('div.you-block',
    el('div.you-label', null, 'Commute times (for traffic-weather verdicts)'),
    el('div.you-times',
      el('label.you-time', null, 'Morning ', selectTime('am', draft.commute?.am ?? '08:00')),
      el('label.you-time', null, 'Evening ', selectTime('pm', draft.commute?.pm ?? '18:00')),
    )
  ));

  /* activities */
  refs.body.appendChild(el('div.you-block',
    el('div.you-label', null, 'I care about'),
    el('div.chip-grid', ACTIVITIES.map(([id, label]) =>
      el('button.chip.you-chip', {
        type: 'button',
        class: (draft.activities ?? []).includes(id) ? 'on' : '',
        onclick: (e) => {
          const list = new Set(draft.activities ?? []);
          list.has(id) ? list.delete(id) : list.add(id);
          draft.activities = [...list];
          e.currentTarget.classList.toggle('on');
        },
      }, label)
    ))
  ));

  /* sensitivities */
  refs.body.appendChild(el('div.you-block',
    el('div.you-label', null, 'Flag anything that hits you harder'),
    el('div.chip-grid', SENSITIVITIES.map(([id, label]) =>
      el('button.chip.you-chip', {
        type: 'button',
        class: draft.sensitive?.[id] ? 'on' : '',
        onclick: (e) => {
          draft.sensitive = draft.sensitive ?? {};
          draft.sensitive[id] = !draft.sensitive[id];
          e.currentTarget.classList.toggle('on');
        },
      }, label)
    ))
  ));

  refs.body.appendChild(el('div.you-note', null,
    'No account, no cloud — this lives in your browser only and only ever ADDS tips on top of the full dashboard.'));
}

function selectTime(key, value) {
  return el('select.you-select', {
    onchange: (e) => { draft.commute = draft.commute ?? {}; draft.commute[key] = e.target.value; },
  }, HOURS.map((h) => el('option', { value: h, selected: h === value }, h)));
}

function save() {
  draft.savedAt = Date.now();
  store.you.set(draft);
  close();
  hooks?.onSaved?.();
}

function reset() {
  store.you.clear();
  close();
  hooks?.onSaved?.();
}
