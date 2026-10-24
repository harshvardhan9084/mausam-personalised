/**
 * settings.js — the settings sheet.
 *
 * Sections: AI assistant (provider / Gemini key / model, with test),
 * IMD official data (optional key, with test), Units, Theme, About.
 * The Gemini key is stored ONLY in this browser (localStorage) and is
 * sent exclusively to Google's Gemini endpoint.
 */

import { el, clear } from '../utils/dom.js';
import { store } from '../core/storage.js';
import { aiSettings } from '../ai/client.js';
import { geminiChat } from '../ai/gemini.js';

const MODEL_OPTIONS = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
];

let refs = null;      // injected DOM refs from index.html
let hooks = null;     // { onUnitsChange, onThemeChange, onImdChange }

export function wireSettings(domRefs, hooksIn) {
  refs = domRefs;
  hooks = hooksIn;
  const { overlay, closeBtn, aiSection, imdSection } = refs;

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) close();
  });

  buildAiSection(aiSection);
  buildImdSection(imdSection);
}

export function openSettings(focusSection = null) {
  refs.overlay.classList.add('active');
  refreshAiSection();
  if (focusSection === 'ai') {
    setTimeout(() => refs.aiSection.querySelector('input')?.focus({ preventScroll: true }), 80);
  }
}
export function closeSettings() { refs.overlay.classList.remove('active'); }
export function close() { closeSettings(); }

/* ================================================================
   AI SECTION
================================================================ */

let aiEls = null;

function buildAiSection(root) {
  clear(root);
  const cfg = aiSettings();

  const providerBtns = ['auto', 'zai', 'gemini', 'offline'].map((p) =>
    el('button.seg-btn', {
      type: 'button', 'data-provider': p,
      onclick: () => {
        store.ai.set({ provider: p });
        refreshAiSection();
      },
    }, p === 'auto' ? 'Auto' : p === 'zai' ? 'Z.ai preview' : p === 'gemini' ? 'Gemini' : 'Mausam Core')
  );

  const keyInput = el('input.set-input', {
    type: 'password', placeholder: 'Paste your Gemini API key (AIza…)',
    autocomplete: 'off', spellcheck: 'false', value: cfg.geminiKey ?? '',
    oninput: (e) => {
      store.ai.set({ geminiKey: e.target.value.trim() });
      setStatus('', '');
    },
  });

  const showBtn = el('button.btn.btn-xs', {
    type: 'button',
    onclick: () => {
      keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
      showBtn.textContent = keyInput.type === 'password' ? '👁 Show' : '🙈 Hide';
    },
  }, '👁 Show');

  const modelInput = el('input.set-input', {
    type: 'text', value: cfg.model ?? 'gemini-3.5-flash-lite',
    list: 'model-options', spellcheck: 'false', autocomplete: 'off',
    onchange: (e) => {
      const v = e.target.value.trim() || 'gemini-3.5-flash-lite';
      store.ai.set({ model: v });
      setStatus('Model set to ' + v, 'ok');
    },
  });

  const datalist = el('datalist', { id: 'model-options' },
    MODEL_OPTIONS.map((m) => el('option', { value: m })));

  const testBtn = el('button.btn', { type: 'button', onclick: testGemini }, 'Test connection');
  const status = el('div.set-status', { role: 'status' });

  aiEls = { keyInput, modelInput, status, providerBtns };

  root.append(
    el('div.settings-block',
      el('div.settings-h', null, '🤖 AI assistant'),
      el('div.seg-group.set-seg', null, providerBtns),
      el('div.set-help', null,
        'Auto: uses the built-in Z.ai model in the web preview; your Gemini key elsewhere; Mausam Core (offline engine) as the always-available fallback.'),
      el('div#ai-gemini-zone',
        el('div.set-label', null, 'Gemini API key'),
        el('div.key-row', keyInput, showBtn),
        el('div.set-help', null,
          'Your own key — free at ', el('a', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener' }, 'aistudio.google.com/apikey'),
          '. Stored only in this browser, sent only to Google.'),
        el('div.set-label', null, 'Model'),
        modelInput,
        datalist,
        el('div.key-actions', testBtn),
      ),
      status
    )
  );
}

function refreshAiSection() {
  const cfg = aiSettings();
  aiEls?.providerBtns.forEach((b) => b.classList.toggle('active', b.dataset.provider === (cfg.provider ?? 'auto')));
  if (aiEls) {
    aiEls.keyInput.value = cfg.geminiKey ?? '';
    aiEls.modelInput.value = cfg.model ?? 'gemini-3.5-flash-lite';
  }
  const zone = refs.aiSection.querySelector('#ai-gemini-zone');
  const cfgNow = aiSettings();
  const showGemini = cfgNow.provider === 'auto' || cfgNow.provider === 'gemini';
  if (zone) zone.style.display = showGemini ? '' : 'none';
}

function setStatus(text, cls) {
  if (!aiEls) return;
  aiEls.status.textContent = text;
  aiEls.status.className = `set-status ${cls}`;
}

async function testGemini() {
  const cfg = aiSettings();
  if (!cfg.geminiKey) {
    setStatus('Enter a key first.', 'bad');
    return;
  }
  setStatus('Pinging the model…', 'busy');
  const deltas = [];
  try {
    await geminiChat({
      system: 'Reply with exactly: OK',
      history: [],
      userText: 'ping',
      apiKey: cfg.geminiKey,
      model: cfg.model || 'gemini-3.5-flash-lite',
      toolDecls: [],
      runTool: null,
      onText: (d) => deltas.push(d),
      signal: undefined,
    });
    const out = deltas.join('').trim();
    setStatus(`✓ Model responded: “${out.slice(0, 40) || 'OK'}”`, 'ok');
  } catch (err) {
    setStatus(`✗ ${err.message?.slice(0, 160) ?? 'Request failed'}`, 'bad');
  }
}

/* ================================================================
   IMD SECTION
================================================================ */

function buildImdSection(root) {
  clear(root);
  const input = el('input.set-input.mono', {
    type: 'password', placeholder: 'Paste your IMD API key (optional)',
    autocomplete: 'off', spellcheck: 'false', value: store.imdKey.get() ?? '',
    oninput: (e) => setStatusImd('', ''),
  });
  const status = el('div.set-status', { role: 'status' });
  let typed = null;

  root.append(
    el('div.settings-block',
      el('div.settings-h', null, '🌧️ IMD official data (optional)'),
      el('div.set-help', null,
        'Mausam runs fully on Open-Meteo by default. Add a free key from ', el('a', { href: 'https://api.imd.gov.in', target: '_blank', rel: 'noopener' }, 'api.imd.gov.in'),
        ' to enrich the dashboard with the India Meteorological Department’s official 7-day city forecast, observations & moon times.'),
      input,
      el('div.key-actions',
        el('button.btn', { type: 'button', onclick: () => { store.imdKey.set(input.value); testImd(input.value); } }, 'Save & test'),
        el('button.btn', { type: 'button', onclick: () => { store.imdKey.set(''); input.value = ''; setStatusImd('Key cleared — Open-Meteo only.', 'busy'); hooks?.onImdChange?.(); } }, 'Remove')
      ),
      status
    )
  );

  async function testImd(key) {
    if (!key) { setStatusImd('Enter a key first.', 'bad'); return; }
    setStatusImd('Contacting the IMD gateway…', 'busy');
    const { testImdKey } = await import('../api/imd.js');
    try {
      const res = await testImdKey(key.trim());
      if (res.ok) {
        setStatusImd(`✓ ${res.message}${res.sample?.max != null ? ` Today: ${res.sample.max}°/${res.sample.min}°.` : ''}`, 'ok');
        hooks?.onImdChange?.();
      } else {
        setStatusImd(`✗ ${res.message}${res.hint ? ` ${res.hint}` : ''}`, 'bad');
      }
    } catch {
      setStatusImd('✗ Test failed unexpectedly — check the console.', 'bad');
    }
    clearTimeout(typed);
  }
}

function setStatusImd(text, cls) {
  const elStatus = refs.imdSection.querySelector('.set-status');
  if (elStatus) {
    elStatus.textContent = text;
    elStatus.className = `set-status ${cls}`;
  }
}
