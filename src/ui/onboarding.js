/**
 * onboarding.js — "make it YOURS" wizard.
 *
 * Runs three ways:
 *   mode 'first'  — no profiles exist yet; must finish (no escape hatch)
 *   mode 'create' — adding another profile; Esc/cancel returns to app
 *   mode 'edit'   — prefilled with an existing profile + delete option
 *
 * Steps: welcome → identity (name/avatar/colour) → home city →
 * focus (lens + sensitivities) → ready (personal watch-list preview).
 * Everything the user enters stays on the device — stated, not implied.
 */

import { el, clear, sleep } from '../utils/dom.js';
import { geocodeSearch } from '../api/open-meteo.js';
import {
  ACCENTS, AVATARS, SENSITIVITY_KEYS, SENSITIVITY_INFO, LENS_INFO,
  EMOJI_BY_LENS, createProfile, updateProfile, deleteProfile, validate,
} from '../core/profiles.js';
import { watchList } from '../core/personalise.js';

const STEP_TITLES = ['Welcome', 'You', 'Home', 'Focus', 'Ready'];

/**
 * @param {{root:HTMLElement, mode:'first'|'create'|'edit', profile?:object|null,
 *          onDone:(profile:object)=>void, onCancel?:()=>void}} opts
 */
export function runOnboarding({ root, mode, profile = null, onDone, onCancel }) {
  const isEdit = mode === 'edit';
  const steps = isEdit ? [1, 2, 3, 4] : [0, 1, 2, 3, 4];
  let stepIdx = 0;

  const draft = {
    name: profile?.name ?? '',
    emoji: profile?.emoji ?? null,
    color: profile?.color ?? 'blue',
    home: profile?.home ?? null,
    lens: profile?.lens ?? null,
    sensitivities: { ...(profile?.sensitivities ?? {}) },
  };

  /* ---------- shell ---------- */
  const shell = el('div.ob-shell');
  root.append(shell);

  function header() {
    const cancellable = isEdit || mode === 'create'; // first-run must finish
    return el('div.ob-head',
      el('div.ob-brand', null,
        el('img', { src: 'icons/favicon.svg', alt: '' }),
        el('span', null, 'Mausam')
      ),
      cancellable
        ? el('button.btn.btn-icon', {
            type: 'button',
            'aria-label': isEdit ? 'Cancel editing' : 'Cancel new profile',
            onclick: () => onCancel?.(),
          }, '✕')
        : null
    );
  }

  function progress() {
    if (isEdit) return null;
    return el('div.ob-progress', { 'aria-label': `Step ${stepIdx + 1} of ${steps.length}` },
      STEP_TITLES.map((title, i) => el('div.ob-dot',
        {
          class: i === stepIdx ? 'now' : i < stepIdx ? 'done' : '',
          title,
        }
      ))
    );
  }

  function navRow({ onBack, nextLabel = 'Next →', nextDisabled, onNext, backLabel = '← Back' }) {
    return el('div.ob-nav',
      onBack ? el('button.btn', { type: 'button', onclick: onBack }, backLabel) : el('span'),
      el('button.btn.btn-primary', {
        type: 'button',
        disabled: nextDisabled || undefined,
        onclick: onNext,
      }, nextLabel)
    );
  }

  /* ---------- step 0 · welcome ---------- */
  function stepWelcome() {
    return el('div.ob-step',
      el('div.ob-hero-icon', null, '🌤️'),
      el('h1.ob-title', null, 'Weather that knows you'),
      el('p.ob-sub', null,
        'Mausam builds a personal profile — your city, what you care about, what your body struggles with — and turns raw forecasts into decisions: when to run, what to wear, whether to irrigate.'),
      el('div.ob-privacy',
        el('span', { 'aria-hidden': 'true' }, '🔒'),
        ' No account, no sign-up, no tracking. Your profile lives only in this browser.'
      ),
      navRow({
        nextLabel: "Let's build it →",
        onNext: () => next(),
      })
    );
  }

  /* ---------- step 1 · identity ---------- */
  function stepIdentity(errs = {}) {
    const nameInput = el('input.ob-input', {
      type: 'text',
      placeholder: 'What should I call you?',
      value: draft.name,
      maxlength: '24',
      autocomplete: 'off',
      'aria-label': 'Your name',
      id: 'ob-name',
    });
    nameInput.addEventListener('input', () => {
      draft.name = nameInput.value;
      nameInput.closest('.ob-field')?.querySelector('.ob-err')?.remove();
    });

    let pickedEmoji = draft.emoji;
    const emojiGrid = el('div.ob-emoji-grid', { role: 'radiogroup', 'aria-label': 'Pick an avatar' });
    for (const em of AVATARS) {
      const b = el('button.ob-emoji', {
        type: 'button',
        role: 'radio',
        'aria-checked': String(pickedEmoji === em),
        class: pickedEmoji === em ? 'picked' : '',
        onclick: (e) => {
          pickedEmoji = em;
          emojiGrid.querySelectorAll('.ob-emoji').forEach((x) => {
            x.classList.remove('picked');
            x.setAttribute('aria-checked', 'false');
          });
          e.currentTarget.classList.add('picked');
          e.currentTarget.setAttribute('aria-checked', 'true');
        },
      }, em);
      emojiGrid.appendChild(b);
    }

    const colorRow = el('div.ob-color-row', { role: 'radiogroup', 'aria-label': 'Pick your accent colour' });
    for (const [key, meta] of Object.entries(ACCENTS)) {
      colorRow.appendChild(el('button.ob-color', {
        type: 'button',
        role: 'radio',
        'aria-checked': String(draft.color === key),
        title: meta.label,
        class: draft.color === key ? 'picked' : '',
        style: { '--c': meta.hex },
        onclick: (e) => {
          draft.color = key;
          colorRow.querySelectorAll('.ob-color').forEach((x) => {
            x.classList.remove('picked');
            x.setAttribute('aria-checked', 'false');
          });
          e.currentTarget.classList.add('picked');
          e.currentTarget.setAttribute('aria-checked', 'true');
        },
      }));
    }

    const wrap = el('div.ob-step',
      el('h2.ob-title-sm', null, isEdit ? 'Edit your identity' : 'First — who are you?'),
      el('div.ob-field', null,
        el('label.ob-label', { for: 'ob-name' }, 'Name'),
        nameInput,
        errs.name ? el('div.ob-err', { role: 'alert' }, errs.name) : null
      ),
      el('div.ob-field', null, el('div.ob-label', null, 'Avatar'), emojiGrid),
      el('div.ob-field', null, el('div.ob-label', null, 'Accent colour'), colorRow),
      navRow({
        onBack: isEdit ? null : () => back(),
        nextDisabled: false,
        onNext: () => {
          const check = validate({ ...draft, home: draft.home ?? { lat: null } }, { existingId: profile?.id });
          if (check.errors.name) { rerender(1, check.errors); return; }
          draft.emoji = pickedEmoji;
          next();
        },
        nextLabel: isEdit ? 'Next' : 'Next →',
      })
    );
    setTimeout(() => nameInput.focus(), 50);
    return wrap;
  }

  /* ---------- step 2 · home ---------- */
  let searchAbort = null;
  let searchSeq = 0;

  function stepHome(errs = {}) {
    const resultsBox = el('div.ob-results');
    const input = el('input.ob-input', {
      type: 'search',
      placeholder: 'Search your city — e.g. Ghaziabad, Pune, Patna…',
      autocomplete: 'off',
      'aria-label': 'Search for your home city',
      id: 'ob-city',
    });
    const geoBtn = el('button.btn', { type: 'button', onclick: useMyLocation }, '📍 Use my location');

    function setSelected(loc) {
      draft.home = loc;
      rerender(2);
    }

    async function useMyLocation() {
      resultsBox.replaceChildren(el('div.ob-result-note', null, 'Locating you…'));
      if (!navigator.geolocation) {
        resultsBox.replaceChildren(el('div.ob-result-note', null, 'Your browser does not support location. Search for your city instead.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude: lat, longitude: lon } = pos.coords;
          let label = 'Current location';
          try {
            // Best-effort reverse geocode (OpenStreetMap). Fails → generic label.
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 6000);
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&accept-language=en`, { signal: ctrl.signal });
            clearTimeout(timer);
            const j = await res.json();
            label = j.address?.city || j.address?.town || j.address?.village || j.address?.county || label;
          } catch { /* keep generic label */ }
          setSelected({ name: label, admin1: '', country: '', lat, lon, isGeo: true });
        },
        (err) => {
          resultsBox.replaceChildren(el('div.ob-result-note', null,
            err.code === 1 ? 'Location permission denied — no problem, search instead.' : 'Could not get your location — search for your city instead.'));
        },
        { timeout: 10000, maximumAge: 300000 }
      );
    }

    let debounce = null;
    input.addEventListener('input', () => {
      clearTimeout(debounce);
      const q = input.value.trim();
      if (q.length < 2) { resultsBox.replaceChildren(); return; }
      debounce = setTimeout(async () => {
        searchAbort?.abort();
        const seq = ++searchSeq;
        const ctrl = new AbortController();
        searchAbort = ctrl;
        resultsBox.replaceChildren(el('div.ob-result-note', null, 'Searching…'));
        try {
          const list = await geocodeSearch(q, ctrl.signal);
          if (seq !== searchSeq) return;
          if (!list.length) {
            resultsBox.replaceChildren(el('div.ob-result-note', null, `No places found for “${q}” — check spelling?`));
            return;
          }
          resultsBox.replaceChildren(...list.slice(0, 6).map((r) => el('button.ob-result', {
            type: 'button',
            onclick: () => setSelected({
              name: r.name, admin1: r.admin1, country: r.country, lat: r.latitude, lon: r.longitude,
            }),
          },
          el('span.result-name', null, r.name),
          el('span.result-sub', null, [r.admin1, r.country].filter(Boolean).join(', '))
          )));
        } catch (err) {
          if (err.name !== 'AbortError' && seq === searchSeq) {
            resultsBox.replaceChildren(el('div.ob-result-note', null, 'Search failed — check your connection and try again.'));
          }
        }
      }, 320);
    });

    const selected = draft.home
      ? el('div.ob-selected',
          el('span', { 'aria-hidden': 'true' }, '✅'),
          ' Home set: ',
          el('b', null, draft.home.name),
          draft.home.admin1 ? `, ${draft.home.admin1}` : null
        )
      : null;

    return el('div.ob-step',
      el('h2.ob-title-sm', null, isEdit ? 'Edit home city' : 'Where do you live?'),
      el('p.ob-hint', null, 'Forecasts anchor to your home city. You can still check anywhere else, anytime.'),
      el('div.ob-field', null, input, errs.home ? el('div.ob-err', { role: 'alert' }, errs.home) : null),
      el('div.ob-geo-row', null, geoBtn),
      selected,
      resultsBox,
      navRow({
        onBack: isEdit ? null : () => back(),
        onNext: () => {
          if (!draft.home) { rerender(2, { home: 'Pick a home city so forecasts have an anchor.' }); return; }
          next();
        },
        nextLabel: isEdit ? 'Next' : 'Next →',
      })
    );
  }

  /* ---------- step 3 · focus ---------- */
  function stepFocus(errs = {}) {
    const lensGrid = el('div.ob-lens-grid', { role: 'radiogroup', 'aria-label': 'What should Mausam optimise for?' });
    for (const [id, info] of Object.entries(LENS_INFO)) {
      lensGrid.appendChild(el('button.ob-lens', {
        type: 'button',
        role: 'radio',
        'aria-checked': String(draft.lens === id),
        class: draft.lens === id ? 'picked' : '',
        onclick: (e) => {
          draft.lens = id;
          if (!draft.emoji) draft.emoji = EMOJI_BY_LENS[id];
          lensGrid.querySelectorAll('.ob-lens').forEach((x) => {
            x.classList.remove('picked');
            x.setAttribute('aria-checked', 'false');
          });
          e.currentTarget.classList.add('picked');
          e.currentTarget.setAttribute('aria-checked', 'true');
        },
      },
        el('div.ob-lens-icon', null, info.icon),
        el('div', null,
          el('div.ob-lens-name', null, info.name),
          el('div.ob-lens-desc', null, info.desc),
          el('div.ob-lens-why', null, info.why)
        )
      ));
    }

    const chipRow = el('div.ob-chip-row', { role: 'group', 'aria-label': 'Sensitivities (optional)' });
    for (const key of SENSITIVITY_KEYS) {
      const info = SENSITIVITY_INFO[key];
      const chip = el('button.ob-chip', {
        type: 'button',
        'aria-pressed': String(Boolean(draft.sensitivities[key])),
        class: draft.sensitivities[key] ? 'on' : '',
        title: info.hint,
        onclick: () => {
          draft.sensitivities[key] = !draft.sensitivities[key];
          chip.classList.toggle('on', draft.sensitivities[key]);
          chip.setAttribute('aria-pressed', String(Boolean(draft.sensitivities[key])));
        },
      }, `${info.emoji} ${info.label}`);
      chipRow.appendChild(chip);
    }

    return el('div.ob-step',
      el('h2.ob-title-sm', null, isEdit ? 'Edit focus' : 'What should Mausam optimise for first?'),
      el('p.ob-hint', null, 'This becomes your dashboard lens. You can ask the assistant about anything else, anytime.'),
      el('div.ob-field', null, lensGrid, errs.lens ? el('div.ob-err', { role: 'alert' }, errs.lens) : null),
      el('div.ob-field', null,
        el('div.ob-label', null, 'Your body (optional — sharpens the advice)'),
        chipRow
      ),
      navRow({
        onBack: isEdit ? null : () => back(),
        onNext: () => {
          if (!LENS_INFO[draft.lens]) { rerender(3, { lens: 'Choose what Mausam should optimise for.' }); return; }
          next();
        },
        nextLabel: isEdit ? 'Next' : 'Next →',
      })
    );
  }

  /* ---------- step 4 · ready ---------- */
  function stepReady(errs = {}) {
    const watch = watchList(draft);
    const saveError = el('div.ob-err', { role: 'alert', style: { display: 'none' } });

    const delBtn = isEdit
      ? el('button.btn.btn-danger', {
          type: 'button',
          onclick: (e) => {
            const b = e.currentTarget;
            if (b.dataset.armed !== '1') {
              b.dataset.armed = '1';
              b.textContent = 'Tap again to confirm delete';
              setTimeout(() => { b.dataset.armed = '0'; b.textContent = 'Delete profile'; }, 4000);
              return;
            }
            deleteProfile(profile.id);
            onCancel?.({ deleted: true });
          },
        }, 'Delete profile')
      : null;

    return el('div.ob-step',
      el('h2.ob-title-sm', null, isEdit ? 'Save your changes' : `${draft.name || 'You'}'s profile is ready`),
      el('p.ob-hint', null, isEdit ? 'Review and save.' : 'Here is what Mausam will watch for you:'),
      el('div.ob-watch',
        watch.map(([icon, title, why]) => el('div.ob-watch-row',
          el('span.ob-watch-icon', null, icon),
          el('div', null,
            el('div.ob-watch-title', null, title),
            el('div.ob-watch-why', null, why)
          )
        ))
      ),
      el('div.ob-privacy', null,
        el('span', { 'aria-hidden': 'true' }, '🔒'),
        ' Stored only on this device. No account. No cloud.'
      ),
      saveError,
      el('div.ob-nav.ob-nav-col',
        el('button.btn.btn-primary', {
          type: 'button',
          onclick: async () => {
            const btn = shell.querySelector('.ob-nav .btn-primary');
            btn.disabled = true;
            btn.textContent = isEdit ? 'Saving…' : 'Setting up…';
            try {
              if (isEdit) {
                const res = updateProfile(profile.id, draft);
                if (!res.ok) {
                  saveError.textContent = Object.values(res.errors)[0] ?? 'Could not save.';
                  saveError.style.display = 'block';
                  btn.disabled = false;
                  btn.textContent = 'Save changes';
                  return;
                }
                onDone(res.profile);
              } else {
                const res = createProfile(draft);
                if (!res.ok) {
                  saveError.textContent = Object.values(res.errors)[0] ?? 'Could not save.';
                  saveError.style.display = 'block';
                  btn.disabled = false;
                  btn.textContent = 'Open my dashboard';
                  return;
                }
                await sleep(250);
                onDone(res.profile);
              }
            } catch (err) {
              saveError.textContent = 'Unexpected error while saving — please try again.';
              saveError.style.display = 'block';
              btn.disabled = false;
              btn.textContent = isEdit ? 'Save changes' : 'Open my dashboard';
            }
          },
        }, isEdit ? 'Save changes' : 'Open my dashboard →'),
        delBtn,
        el('button.btn', { type: 'button', onclick: () => onCancel?.() }, isEdit ? 'Cancel' : '← Back')
      )
    );
  }

  /* ---------- flow ---------- */

  const STEP_FNS = [stepWelcome, stepIdentity, stepHome, stepFocus, stepReady];
  let currentErrors = {};

  function rerender(stepIdxOverride, errors = {}) {
    if (stepIdxOverride != null) { stepIdx = stepIdxOverride; currentErrors = errors; }
    clear(shell);
    const fn = STEP_FNS[steps[stepIdx]];
    shell.append(
      header(),
      progress(),
      fn(currentErrors)
    );
  }

  function next() {
    if (stepIdx < steps.length - 1) { stepIdx += 1; currentErrors = {}; rerender(); }
  }
  function back() {
    if (stepIdx > 0) { stepIdx -= 1; currentErrors = {}; rerender(); }
  }

  rerender();
  return { destroy: () => clear(root) };
}
