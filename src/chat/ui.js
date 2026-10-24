/**
 * ui.js — Mausam Mitra chat panel.
 *
 * Product-grade behaviours:
 *  - component-driven bubbles (see components.js)
 *  - typing indicator, staggered card reveal, auto-scroll (stick-to-bottom)
 *  - full error handling: failed answers get a retry chip, offline gets an
 *    honest banner, empty input is ignored, send is locked while thinking
 *  - input history (↑), 300-char cap, Esc closes, focus is managed
 *  - suggestion chips can trigger UI actions (edit/new profile, settings)
 */

import { el, clear } from '../utils/dom.js';
import { setStateGetter, answer, welcomeMessage } from './brain.js';
import { renderComponent } from './components.js';

const MAX_LEN = 300;

/**
 * @param {{onAction?: (action:string)=>void}} handlers
 *   onAction: 'new-profile' | 'edit-profile' | 'switch-profile' | 'open-imd-settings'
 */
export function wireChat(handlers = {}) {
  /* ---------------- DOM ---------------- */
  const fab = el('button.chat-fab', {
    id: 'chat-fab',
    type: 'button',
    'aria-label': 'Open Mausam Mitra chat',
    'aria-expanded': 'false',
    onclick: () => toggle(),
  }, el('span.chat-fab-icon', { 'aria-hidden': 'true' }, '💬'));

  const statusDot = el('span.chat-status-dot', { title: 'Connection status' });
  const panel = el('div.chat-panel', {
    id: 'chat-panel',
    role: 'dialog',
    'aria-label': 'Mausam Mitra — weather assistant',
  },
    el('div.chat-head',
      el('div.chat-head-id',
        el('div.chat-avatar', { 'aria-hidden': 'true' }, '🌦️'),
        el('div',
          el('div.chat-title', null, 'Mausam Mitra'),
          el('div.chat-status', null, statusDot, el('span', { id: 'chat-status-text' }, 'online · live data'))
        )
      ),
      el('button.chat-close', { type: 'button', 'aria-label': 'Close chat', onclick: () => close() }, '✕')
    ),
    el('div.chat-msgs', { id: 'chat-msgs', role: 'log', 'aria-live': 'polite' }),
    el('form.chat-inputbar',
      {
        onsubmit: (e) => { e.preventDefault(); submit(); },
      },
      el('input.chat-input', {
        id: 'chat-input',
        type: 'text',
        placeholder: 'Ask about rain, air, timing…',
        maxlength: String(MAX_LEN),
        autocomplete: 'off',
        'aria-label': 'Ask the weather assistant',
      }),
      el('button.chat-send', { id: 'chat-send', type: 'submit', 'aria-label': 'Send message' }, '➤')
    )
  );

  const msgs = panel.querySelector('#chat-msgs');
  const input = panel.querySelector('#chat-input');
  const sendBtn = panel.querySelector('#chat-send');
  const statusText = panel.querySelector('#chat-status-text');
  document.body.append(fab, panel);

  /* ---------------- state ---------------- */
  let open = false;
  let busy = false;
  let ctx = {}; // conversation memory handed to brain.answer
  let welcomed = false;
  let lastRaw = '';
  const history = [];
  let historyIdx = -1;

  setStateGetter(() => window.__mausamState ?? {});

  /* ---------------- helpers ---------------- */

  function stickToBottom(force = false) {
    const nearBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 120;
    if (nearBottom || force) msgs.scrollTop = msgs.scrollHeight;
  }

  function bubble(role, node) {
    const b = el(`div.chat-msg.${role}`, null, node);
    msgs.appendChild(b);
    requestAnimationFrame(() => stickToBottom());
    return b;
  }

  function setBusy(on) {
    busy = on;
    sendBtn.disabled = on;
    sendBtn.textContent = on ? '…' : '➤';
    sendBtn.setAttribute('aria-busy', String(on));
  }

  function setConnection(online) {
    statusDot.classList.toggle('off', !online);
    statusText.textContent = online ? 'online · live data' : 'offline · cached data';
  }
  window.addEventListener('online', () => setConnection(true));
  window.addEventListener('offline', () => setConnection(false));

  /* ---------------- rendering answers ---------------- */

  async function renderAnswer(raw, parsed) {
    const typing = bubble('bot', el('div.typing', { 'aria-label': 'Assistant is typing' },
      el('span'), el('span'), el('span')));

    try {
      const { components, ctx: nextCtx } = await answer(raw, parsed, ctx);
      ctx = nextCtx;
      typing.remove();
      for (const comp of components) {
        const node = renderComponent(comp, window.__mausamState ?? {}, {
          onSend: (msg) => {
            if (typeof msg === 'string') send(msg);
          },
          onAction: (action) => handlers.onAction?.(action),
        });
        if (node) {
          bubble('bot', node);
          await new Promise((r) => setTimeout(r, 90)); // gentle stagger
        }
      }
      stickToBottom(true);
    } catch (err) {
      console.error('Chat answer failed:', err);
      typing.remove();
      bubble('bot', el('div.chat-error',
        el('div.chat-error-title', null, '⚠️ Something broke on my side'),
        el('div.chat-error-text', null, err?.message ?? 'Unexpected error while building the answer.'),
        el('button.chip', {
          type: 'button',
          onclick: () => {
            if (lastRaw) send(lastRaw, { isRetry: true });
          },
        }, '↻ Try again')
      ));
    } finally {
      setBusy(false);
      input.focus({ preventScroll: true });
    }
  }

  /* ---------------- sending ---------------- */

  async function send(raw, { isRetry = false } = {}) {
    const text = String(raw ?? '').trim().slice(0, MAX_LEN);
    if (!text || busy) return;
    if (!isRetry) {
      lastRaw = text;
      history.push(text);
      if (history.length > 20) history.shift();
    }
    historyIdx = -1;
    bubble('user', el('div.chat-user-text', null, text));
    setBusy(true);
    input.value = '';

    const { classify } = await import('./nlu.js');
    const parsed = classify(text);
    await renderAnswer(text, parsed);
  }

  function submit() {
    send(input.value);
  }

  /* ---------------- open/close ---------------- */

  function openPanel() {
    open = true;
    panel.classList.add('active');
    fab.classList.add('hidden');
    fab.setAttribute('aria-expanded', 'true');
    setConnection(navigator.onLine);
    if (!welcomed) {
      welcomed = true;
      for (const comp of welcomeMessage()) {
        const node = renderComponent(comp, {}, {
          onSend: (msg) => send(msg),
          onAction: (a) => handlers.onAction?.(a),
        });
        if (node) bubble('bot', node);
      }
    }
    setTimeout(() => input.focus({ preventScroll: true }), 60);
  }

  function closePanel() {
    open = false;
    panel.classList.remove('active');
    fab.classList.remove('hidden');
    fab.setAttribute('aria-expanded', 'false');
    fab.focus({ preventScroll: true });
  }

  async function toggle() {
    open ? closePanel() : openPanel();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) closePanel();
  });

  /* ---------------- input behaviour ---------------- */

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && history.length && !input.value) {
      historyIdx = historyIdx < 0 ? history.length - 1 : Math.max(0, historyIdx - 1);
      input.value = history[historyIdx] ?? '';
      e.preventDefault();
    } else if (e.key === 'ArrowDown' && historyIdx >= 0) {
      historyIdx += 1;
      if (historyIdx >= history.length) { historyIdx = -1; input.value = ''; }
      else input.value = history[historyIdx];
      e.preventDefault();
    }
  });

  return {
    open: openPanel,
    close: closePanel,
    toggle,
    /** Hide/show the FAB (e.g. while the onboarding wizard is on screen). */
    setHidden(on) {
      fab.classList.toggle('hidden', Boolean(on));
      if (on && open) closePanel();
    },
    reset() {
      clear(msgs);
      welcomed = false;
      ctx = {};
      lastRaw = '';
      if (open) openPanel();
    },
  };
}
