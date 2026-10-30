/**
 * settings.js — the Settings page (v0.5).
 *
 * Full tab page. Sections: app language, units, clock, theme, accent
 * colour, AI assistant (provider / reply language / Gemini key+model+test),
 * IMD optional key, rain & heat notifications, data saver, data & privacy
 * (export / import / wipe), about.
 * The Gemini key lives only in this browser and is sent only to Google.
 */

import { el, clear } from '../utils/dom.js';
import { icon, setIcon } from './icons.js';
import { store } from '../core/storage.js';
import { t, setLang } from '../core/i18n.js';
import { aiSettings } from '../ai/client.js';
import { geminiChat } from '../ai/gemini.js';

const MODEL_OPTIONS = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
];

const ACCENTS = [
  ['', 'Default blue'],
  ['blue', 'Blue'], ['green', 'Green'], ['orange', 'Orange'],
  ['pink', 'Pink'], ['purple', 'Purple'], ['teal', 'Teal'],
  ['red', 'Red'], ['yellow', 'Yellow'],
];

let mount = null;
let hooks = null;

export function wireSettingsPage(mountEl, hooksIn) {
  mount = mountEl;
  hooks = hooksIn;
}

export function renderSettings() {
  if (!mount) return;
  clear(mount);
  build();
}

function build() {
  clear(mount);
  mount.appendChild(el('div.page-h', null, icon('settings', 'page-ico'), ' ', t('set_title')));

  /* ---------------- language ---------------- */
  mount.appendChild(section(t('set_lang'),
    el('div.seg-group.set-seg',
      segBtn(store.lang.get() === 'en', 'English', () => switchLang('en')),
      segBtn(store.lang.get() === 'hi', 'हिंदी', () => switchLang('hi')),
    )
  ));

  /* ---------------- units ---------------- */
  mount.appendChild(section(t('set_units'),
    el('div.seg-group.set-seg',
      segBtn(store.units.get() !== 'imperial', '°C · km/h', () => setUnits('metric')),
      segBtn(store.units.get() === 'imperial', '°F · mph', () => setUnits('imperial')),
    )
  ));

  /* ---------------- clock ---------------- */
  mount.appendChild(section(t('set_clock'),
    el('div.seg-group.set-seg',
      segBtn(store.clock.get() !== '24', t('set_misc_12'), () => setClock('12')),
      segBtn(store.clock.get() === '24', t('set_misc_24'), () => setClock('24')),
    )
  ));

  /* ---------------- theme ---------------- */
  mount.appendChild(section(t('set_theme'),
    el('div.seg-group.set-seg',
      segBtn(store.theme.get() === 'auto', 'Auto', () => setTheme('auto')),
      segBtn(store.theme.get() === 'dark', [icon('moon', 'chip-ico'), ' Dark'], () => setTheme('dark')),
      segBtn(store.theme.get() === 'light', [icon('sun', 'chip-ico'), ' Light'], () => setTheme('light')),
    )
  ));

  /* ---------------- accent ---------------- */
  mount.appendChild(section(t('set_accent'),
    el('div.accent-row',
      ACCENTS.map(([id, name]) =>
        el('button.accent-swatch', {
          type: 'button', title: name, 'aria-label': name,
          class: (store.accent.get() ?? '') === id ? 'on' : '',
          onclick: () => { store.accent.set(id); hooks?.onAccentChange?.(id); renderSettings(); },
        }, el('span.accent-dot', { 'data-accent-id': id }))),
    )
  ));

  /* ---------------- AI ---------------- */
  buildAiSection();

  /* ---------------- IMD ---------------- */
  buildImdSection();

  /* ---------------- notifications ---------------- */
  buildNotifSection();

  /* ---------------- install the app ---------------- */
  buildInstallSection();

  /* ---------------- data saver ---------------- */
  mount.appendChild(section(t('set_data'),
    toggleRow(t('set_datasaver'), t('set_datasaver_t'), store.dataSaver.get(), (on) => {
      store.dataSaver.set(on);
      hooks?.onDataSaverChange?.(on);
    })
  ));

  /* ---------------- data & privacy ---------------- */
  mount.appendChild(section(t('set_backup'),
    el('div.key-actions',
      el('button.btn', { type: 'button', onclick: exportData }, icon('download', 'chip-ico'), ' ', t('set_export')),
      el('button.btn', { type: 'button', onclick: importData }, icon('upload', 'chip-ico'), ' ', t('set_import')),
      el('button.btn.btn-danger', { type: 'button', onclick: wipeData }, icon('trash', 'chip-ico'), ' ', t('set_wipe')),
    ),
    el('div.privacy-note', null, icon('lock', 'chip-ico'), ' ', t('you_intro')),
  ));

  /* ---------------- about ---------------- */
  mount.appendChild(section(t('set_about'),
    el('div.ver-row', null,
      el('span.ver-label', null, t('set_version')),
      el('span.ver-badge', null, 'v0.8.34'),
      el('span.ver-note', null, 'zero-dependency PWA · no accounts · no tracking'),
    ),
    el('div.set-help', null, t('set_about_t')),
  ));
}

/* ================= builders ================= */

function section(title, ...children) {
  return el('div.settings-block.page-block', el('div.settings-h', null, title), ...children);
}

function buildInstallSection() {
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) {
    /* v0.8.17 "the install moment deserves design": the installed state stops
       being a plain text row and wears the v0.8.12 tone-card language
       (green tint, check glyph, what-installing-means body). */
    mount.appendChild(section(t('inst_row'),
      el('div.notif-flow.notif-flow-done', { role: 'status' },
        el('div.notif-flow-head', null, icon('check', 'notif-flow-ico'),
          el('b', null, t('inst_done'))),
        el('div.notif-flow-body', null, t('inst_done_b')))));
    return;
  }
  const kids = [el('div.set-help', null, t('inst_row_t'))];
  const evt = window.__mausamInstallEvt;
  if (evt?.prompt) {
    kids.push(el('div.key-actions',
      el('button.btn.btn-primary', {
        type: 'button',
        onclick: async (e2) => {
          try {
            evt.prompt();
            const { outcome } = await evt.userChoice;
            if (outcome === 'accepted') window.__mausamInstallEvt = null;
            renderSettings();
          } catch { /* ignore */ }
        },
      }, icon('download', 'chip-ico'), ' ', t('inst_btn')),
    ));
  } else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    kids.push(el('div.set-help', null, t('inst_ios_hint')));
  }
  mount.appendChild(section(t('inst_row'), ...kids));
}

function segBtn(active, label, onclick) {
  return el('button.seg-btn', { type: 'button', class: active ? 'active' : '', onclick }, label);
}

function toggleRow(title, help, on, onChange) {
  const knob = el('span.toggle-knob');
  const btn = el('button.toggle', {
    type: 'button', role: 'switch', 'aria-checked': String(on), class: on ? 'on' : '',
    onclick: () => {
      const next = !btn.classList.contains('on');
      btn.classList.toggle('on', next);
      btn.setAttribute('aria-checked', String(next));
      onChange(next);
    },
  }, knob);
  return el('div.toggle-row', el('div', el('div.toggle-title', null, title), el('div.set-help', null, help)), btn);
}

/* ---------------- AI section ---------------- */

function buildAiSection() {
  const cfg = aiSettings();
  const status = el('div.set-status', { role: 'status' });

  const providerBtns = ['auto', 'zai', 'gemini', 'offline'].map((p) =>
    el('button.seg-btn', {
      type: 'button', 'data-provider': p,
      class: (cfg.provider ?? 'auto') === p ? 'active' : '',
      onclick: () => {
        store.ai.set({ provider: p });
        refreshGeminiZone();
        [...zone.parentElement.querySelectorAll('[data-provider]')].forEach((b) =>
          b.classList.toggle('active', b.dataset.provider === p));
      },
    }, p === 'auto' ? 'Auto' : p === 'zai' ? 'Z.ai preview' : p === 'gemini' ? 'Gemini' : t('nav_mitra') + ' Core'));

  const aiLangSel = el('select.set-select', {
    onchange: (e) => store.aiLang.set(e.target.value),
  }, ['auto', 'en', 'hi', 'hinglish'].map((v) =>
    el('option', { value: v, selected: (store.aiLang.get() ?? 'auto') === v }, t(`ai_lang_${v}`))));

  const keyInput = el('input.set-input', {
    type: 'password', placeholder: 'AIza…', autocomplete: 'off', spellcheck: 'false',
    value: cfg.geminiKey ?? '',
    oninput: (e) => { store.ai.set({ geminiKey: e.target.value.trim() }); setStatus('', ''); },
  });
  const showBtn = el('button.btn.btn-xs', {
    type: 'button',
    onclick: () => {
      keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
      setIcon(showBtn, keyInput.type === 'password' ? 'eye' : 'eye-off');
    },
  });
  setIcon(showBtn, 'eye');

  const modelInput = el('input.set-input', {
    type: 'text', value: cfg.model ?? 'gemini-3.5-flash-lite',
    list: 'model-options', spellcheck: 'false', autocomplete: 'off',
    onchange: (e) => {
      const v = e.target.value.trim() || 'gemini-3.5-flash-lite';
      store.ai.set({ model: v });
      setStatus(`${t('set_model')}: ${v}`, 'ok');
    },
  });

  const zone = el('div#ai-gemini-zone',
    el('div.set-label', null, t('set_gemini_key')),
    el('div.key-row', keyInput, showBtn),
    el('div.set-help', null, t('set_gemini_help'), ' ',
      el('a', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener' }, 'aistudio.google.com/apikey')),
    el('div.set-label', null, t('set_model')),
    modelInput,
    el('datalist', { id: 'model-options' }, MODEL_OPTIONS.map((m) => el('option', { value: m }))),
    el('div.key-actions', el('button.btn', { type: 'button', onclick: () => testGemini(status) }, t('set_test'))),
  );

  mount.appendChild(section(t('set_ai'),
    el('div.seg-group.set-seg', providerBtns),
    el('div.set-help', null, t('set_ai_help')),
    el('div.set-label', null, t('set_ai_lang')),
    aiLangSel,
    zone,
    status,
  ));

  function refreshGeminiZone() {
    const p = aiSettings().provider ?? 'auto';
    zone.style.display = (p === 'auto' || p === 'gemini') ? '' : 'none';
  }
  refreshGeminiZone();
}

function setStatus(node, text, cls) {
  if (!node) return;
  node.textContent = text;
  node.className = `set-status ${cls}`;
}

async function testGemini(status) {
  const cfg = aiSettings();
  if (!cfg.geminiKey) { setStatus(status, 'Enter a key first.', 'bad'); return; }
  setStatus(status, '…', 'busy');
  const deltas = [];
  try {
    await geminiChat({
      system: 'Reply with exactly: OK',
      history: [], userText: 'ping',
      apiKey: cfg.geminiKey, model: cfg.model || 'gemini-3.5-flash-lite',
      toolDecls: [], runTool: null,
      onText: (d) => deltas.push(d), signal: undefined,
    });
    setStatus(status, `✓ ${deltas.join('').trim().slice(0, 40) || 'OK'}`, 'ok');
  } catch (err) {
    setStatus(status, `✗ ${err.message?.slice(0, 160) ?? 'failed'}`, 'bad');
  }
}

/* ---------------- IMD section ---------------- */

function buildImdSection() {
  const status = el('div.set-status', { role: 'status' });
  const input = el('input.set-input.mono', {
    type: 'password', placeholder: 'api.imd.gov.in key (optional)',
    autocomplete: 'off', spellcheck: 'false', value: store.imdKey.get() ?? '',
    oninput: () => setStatus(status, '', ''),
  });
  mount.appendChild(section(t('set_imd'),
    el('div.set-help', null, t('set_imd_help')),
    input,
    el('div.key-actions',
      el('button.btn', { type: 'button', onclick: () => { store.imdKey.set(input.value); testImd(input.value.trim(), status); } }, t('set_test')),
      el('button.btn', { type: 'button', onclick: () => { store.imdKey.set(''); input.value = ''; setStatus(status, 'Open-Meteo only', 'ok'); hooks?.onImdChange?.(); } }, t('you_reset')),
    ),
    status,
  ));

  async function testImd(key, statusNode) {
    if (!key) { setStatus(statusNode, 'Enter a key first.', 'bad'); return; }
    setStatus(statusNode, '…', 'busy');
    const { testImdKey } = await import('../api/imd.js');
    try {
      const res = await testImdKey(key);
      if (res.ok) {
        setStatus(statusNode, `✓ ${res.message}${res.sample?.max != null ? ` ${res.sample.max}°/${res.sample.min}°` : ''}`, 'ok');
        hooks?.onImdChange?.();
      } else {
        setStatus(statusNode, `✗ ${res.message}${res.hint ? ` ${res.hint}` : ''}`, 'bad');
      }
    } catch {
      setStatus(statusNode, '✗ failed', 'bad');
    }
  }
}

/* ---------------- notifications ---------------- */

/* v0.8.12 "the ask deserves design": the browser permission prompt is a
   one-shot, trust-heavy moment — it never fires cold from a toggle flip.
   Flow: toggle ON (permission 'default') → priming card explains what will
   happen; the browser prompt fires only from the card's Allow button.
   If the browser has notifications blocked, the card becomes a recovery
   path with the actual unblock steps instead of a dead-end "✗ denied".
   Transient 'ask' rides outside the store — renderSettings() is the renderer. */
let notifAsk = null; // null | 'ask'

function notifFlowCard(kind) {
  const blocked = kind === 'blocked';
  return el(`div.notif-flow${blocked ? '.notif-flow-blocked' : ''}`, { role: 'status' },
    el('div.notif-flow-head', null, icon('bell', 'notif-flow-ico'),
      el('b', null, t(blocked ? 'set_notif_blocked_t' : 'set_notif_ask_t'))),
    el('div.notif-flow-body', null,
      t(blocked ? 'set_notif_blocked_b' : 'set_notif_ask_b')),
    blocked
      ? el('div.notif-flow-actions', null,
          el('button.btn.btn-sm', {
            type: 'button',
            onclick: () => { store.notif.set({ on: false }); renderSettings(); },
          }, t('set_notif_gotit')))
      : el('div.notif-flow-actions', null,
          el('button.btn.btn-sm.btn-primary', {
            type: 'button',
            onclick: async () => {
              const perm = await Notification.requestPermission();
              if (perm === 'granted') {
                notifAsk = null;
                store.notif.set({ on: true });
                hooks?.onNotifChange?.();
              } else if (perm === 'denied') {
                // keep the intent — the recovery card now explains the unblock
                notifAsk = null;
                store.notif.set({ on: true });
              } else {
                notifAsk = null; // prompt dismissed — stay silent
              }
              renderSettings();
            },
          }, icon('bell', 'btn-ico'), t('set_notif_allow')),
          el('button.btn.btn-sm', {
            type: 'button',
            onclick: () => { notifAsk = null; renderSettings(); },
          }, t('set_notif_later'))),
  );
}

function buildNotifSection() {
  const notif = store.notif.get() ?? { on: false };
  const supported = 'Notification' in window;
  const granted = supported && Notification.permission === 'granted';
  const denied = supported && Notification.permission === 'denied';
  const statusNote = el('div.set-status');
  const row = toggleRow('', t('set_notif_t'), notif.on && granted, async (on) => {
    if (!supported) {
      store.notif.set({ on: false });
      statusNote.textContent = t('set_notif_denied');
      renderSettings();
      return;
    }
    if (on) {
      const perm = Notification.permission;
      if (perm === 'granted') {
        store.notif.set({ on: true });
        hooks?.onNotifChange?.();
      } else if (perm === 'denied') {
        store.notif.set({ on: true }); // intent kept — recovery card explains the unblock
      } else {
        notifAsk = 'ask'; // prime first; the card's Allow button fires the prompt
      }
      renderSettings();
    } else {
      notifAsk = null;
      store.notif.set({ on: false });
      hooks?.onNotifChange?.();
      renderSettings();
    }
  });
  if (notifAsk === 'ask') {
    mount.appendChild(section(t('set_notif'), row, notifFlowCard('ask')));
    return;
  }
  if (notif.on && denied) {
    mount.appendChild(section(t('set_notif'), row, notifFlowCard('blocked')));
    return;
  }
  if (notif.on && granted) statusNote.textContent = '✓ ' + t('set_notif_on');
  mount.appendChild(section(t('set_notif'), row, statusNote));
}

/* ---------------- data ops ---------------- */

function switchLang(l) {
  setLang(l);
  hooks?.onLangChange?.();
  renderSettings();
}
function setUnits(u) { store.units.set(u); hooks?.onUnitsChange?.(u); renderSettings(); }
function setClock(c) { store.clock.set(c); hooks?.onClockChange?.(c); renderSettings(); }
function setTheme(th) { store.theme.set(th); hooks?.onThemeChange?.(th); renderSettings(); }

function exportData() {
  const dump = store.exportAll();
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'mausam-backup.json' });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast(t('set_exported'));
}

function importData() {
  const inp = el('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
  inp.addEventListener('change', () => {
    const file = inp.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const ok = store.importAll(JSON.parse(String(reader.result)));
        toast(ok ? t('set_imported') : t('set_import_bad'));
        if (ok) location.reload();
      } catch {
        toast(t('set_import_bad'));
      }
    };
    reader.readAsText(file);
  });
  document.body.appendChild(inp);
  inp.click();
  setTimeout(() => inp.remove(), 5000);
}

function wipeData() {
  if (!confirm(t('set_wipe_confirm'))) return;
  store.wipeAll();
  toast(t('set_wiped'));
  setTimeout(() => location.reload(), 600);
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
