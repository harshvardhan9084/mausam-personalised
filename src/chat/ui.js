/**
 * ui.js — Mausam Mitra chat panel (v3: real streaming + rich components).
 *
 * Behaviour:
 *  - streamed prose renders live (markdown-lite: **bold**, `code`, lists)
 *  - MausamUI cards pop inline as their fences complete (see ai/render.js)
 *  - provider footnote under every answer (Gemini / Z.ai / Mausam Core)
 *  - stop button while streaming, retry on failure, provider-aware error
 *    cards (bad key → open Settings; no key → switch to Mausam Core chip)
 *  - input history (↑), Esc closes, offline dot, focus management
 */

import { el, clear } from '../utils/dom.js';
import { runChatTurn } from '../ai/client.js';
import { renderPayload, renderFallback, proseNode } from '../ai/render.js';

const MAX_LEN = 500;
const MAX_HISTORY = 16;

const SUGGESTIONS = [
  'Will it rain today?',
  'Best time for a run?',
  'What should I wear?',
  'Air quality right now?',
  'Weather in Mumbai?',
  'Plan my weekend',
];

/**
 * @param {{onOpenSettings?: Function}} handlers
 */
export function wireChat(handlers = {}) {
  /* ---------------- DOM ---------------- */
  const fab = el('button.chat-fab', {
    id: 'chat-fab', type: 'button',
    'aria-label': 'Open Mausam Mitra chat', 'aria-expanded': 'false',
    onclick: () => toggle(),
  }, el('span.chat-fab-icon', { 'aria-hidden': 'true' }, '💬'));

  const statusDot = el('span.chat-status-dot', { title: 'Connection status' });
  const providerLabel = el('span.chat-provider-label', null, '');
  const panel = el('div.chat-panel', {
    id: 'chat-panel', role: 'dialog', 'aria-label': 'Mausam Mitra — weather assistant',
  },
    el('div.chat-head',
      el('div.chat-head-id',
        el('div.chat-avatar', { 'aria-hidden': 'true' }, '🌦️'),
        el('div',
          el('div.chat-title', null, 'Mausam Mitra'),
          el('div.chat-status', null, statusDot, el('span', { id: 'chat-status-text' }, 'live data'), el('span', { class: 'chat-status-sep' }, '·'), providerLabel)
        )
      ),
      el('div.chat-head-actions',
        el('button.chat-new', { type: 'button', 'aria-label': 'New conversation', title: 'New conversation', onclick: () => reset() }, '🧹'),
        el('button.chat-close', { type: 'button', 'aria-label': 'Close chat', onclick: () => close() }, '✕')
      )
    ),
    el('div.chat-msgs', { id: 'chat-msgs', role: 'log', 'aria-live': 'polite' }),
    el('form.chat-inputbar', {
      onsubmit: (e) => { e.preventDefault(); submit(); },
    },
      el('input.chat-input', {
        id: 'chat-input', type: 'text',
        placeholder: 'Ask about rain, air, timing, any city…',
        maxlength: String(MAX_LEN), autocomplete: 'off', spellcheck: 'false',
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
  let welcomed = false;
  let controller = null;       // AbortController for the in-flight turn
  let lastQuestion = '';
  let prevQuestion = '';       // question before any meta-command
  const llmHistory = [];       // [{role, text}] for the model
  const inputHistory = [];
  let historyIdx = -1;

  const getState = () => window.__mausamState ?? {};

  /* ---------------- helpers ---------------- */

  function stickToBottom(force = false) {
    const nearBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 140;
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
    sendBtn.innerHTML = '';
    sendBtn.textContent = on ? '■' : '➤';
    sendBtn.setAttribute('aria-label', on ? 'Stop generating' : 'Send message');
    sendBtn.setAttribute('aria-busy', String(on));
  }

  function setConnection(online) {
    statusDot.classList.toggle('off', !online);
    statusText.textContent = online ? 'live data' : 'offline · cached data';
  }
  window.addEventListener('online', () => setConnection(true));
  window.addEventListener('offline', () => setConnection(false));

  function setProviderLabel(badge) {
    providerLabel.textContent = badge ? ` · ${badge}` : '';
  }

  /** A bot turn container: stream prose into it, cards attach after. */
  function botTurn() {
    const streamBox = el('div.chat-stream.chat-text', { 'aria-live': 'polite' });
    const cards = el('div.chat-cards');
    const meta = el('div.chat-meta');
    const wrap = el('div', null, streamBox, cards, meta);
    const b = bubble('bot', wrap);
    return {
      streamBox, cards, meta, bubble: b,
      async type(node, delay = 80) {
        cards.appendChild(node);
        await new Promise((r) => setTimeout(r, delay));
        stickToBottom();
      },
      setMeta(text) {
        if (text) meta.textContent = text;
      },
    };
  }

  /* ---------------- the turn ---------------- */

  async function send(raw, { isRetry = false } = {}) {
    const text = String(raw ?? '').trim().slice(0, MAX_LEN);
    if (!text || busy) return;
    if (!isRetry && !/^use mausam core$/i.test(text)) {
      prevQuestion = lastQuestion;
      lastQuestion = text;
    }
    inputHistory.push(text);
    if (inputHistory.length > 20) inputHistory.shift();
    historyIdx = -1;

    bubble('user', el('div.chat-user-text', null, text));
    input.value = '';
    setBusy(true);
    controller = new AbortController();
    const turn = botTurn();
    setProviderLabel('');

    // streaming prose buffer
    let streamed = '';
    let rafPending = false;
    const flushStream = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        clear(turn.streamBox).appendChild(proseNode(streamed));
        stickToBottom();
      });
    };

    const events = {
      userText: text,
      history: llmHistory,
      getState,
      signal: controller.signal,
      onOpen: (info) => {
        setProviderLabel(info.note ? `${info.badge} · ${info.note}` : info.badge);
      },
      onText: (delta) => { streamed += delta; flushStream(); },
      onComponent: async (payload) => {
        const node = renderPayload(payload, { onSend: (m) => send(m) });
        if (node) await turn.type(node);
      },
      onFallback: async (rawJson, reason) => {
        await turn.type(renderFallback(rawJson, reason));
      },
      onDone: (info) => {
        // final re-render of prose (catches tail chunks past rAF)
        clear(turn.streamBox).appendChild(proseNode(streamed));
        if (!streamed.trim() && !turn.cards.childElementCount) {
          clear(turn.streamBox).appendChild(el('span', null, '(no content — try again)'));
        }
        turn.setMeta(info?.aborted ? `${info.badge ?? ''} · stopped` : info?.badge ?? '');
        llmHistory.push({ role: 'user', text });
        llmHistory.push({ role: 'model', text: streamed || '(card-only answer)' });
        if (llmHistory.length > MAX_HISTORY * 2) llmHistory.splice(0, llmHistory.length - MAX_HISTORY * 2);
        setBusy(false);
        controller = null;
        input.focus({ preventScroll: true });
      },
      onError: async (err) => {
        clear(turn.streamBox);
        if (!streamed.trim()) turn.streamBox.remove();
        const card = el('div.chat-error',
          el('div.chat-error-title', null, `⚠️ ${err.title}`),
          el('div.chat-error-text', null, err.text),
          err.raw && err.raw !== err.text ? el('div.chat-error-raw', null, String(err.raw).slice(0, 160)) : null,
          el('div.chat-error-actions',
            el('button.chip', {
              type: 'button',
              onclick: () => send(lastQuestion, { isRetry: true }),
            }, '↻ Retry'),
            (err.provider === 'gemini' && (err.kind === 'badkey' || err.kind === 'nokey' || err.kind === 'model'))
              ? el('button.chip', { type: 'button', onclick: () => handlers.onOpenSettings?.('ai') }, '⚙️ AI settings')
              : null,
            err.provider !== 'offline'
              ? el('button.chip', { type: 'button', onclick: () => send('Use Mausam Core', { isRetry: false }) }, '🧠 Use Mausam Core')
              : null
          )
        );
        await turn.type(card, 0);
        llmHistory.push({ role: 'user', text });
        setBusy(false);
        controller = null;
        input.focus({ preventScroll: true });
      },
    };

    // "Use Mausam Core" is a meta-command, not a real question
    if (/^use mausam core$/i.test(text)) {
      events.userText = (prevQuestion && !/^use mausam core$/i.test(prevQuestion))
        ? prevQuestion
        : 'What is the weather right now?';
      events.forceOffline = true;
    }

    runChatTurnWithFallback(events);
  }

  async function runChatTurnWithFallback(events) {
    if (events.forceOffline) {
      // one-shot override: force the offline engine
      const { PROVIDERS } = await import('../ai/client.js');
      void PROVIDERS;
      const state = events.getState?.() ?? {};
      const { offlineChat } = await import('../ai/offline.js');
      const { createStreamParser } = await import('../ai/render.js');
      const parser = createStreamParser();
      events.onOpen?.({ provider: 'offline', badge: 'Mausam Core · on-device' });
      try {
        await offlineChat({
          userText: events.userText, onText: (d) => events.onText?.(d),
          signal: events.signal, getState: events.getState,
        });
        for (const e of parser.end()) {
          if (e.type === 'component') events.onComponent?.(e.payload);
          else if (e.type === 'fallback') events.onFallback?.(e.raw, e.reason);
        }
        events.onDone?.({ provider: 'offline', badge: 'Mausam Core · on-device' });
      } catch (err) {
        if (err?.name !== 'AbortError') events.onError?.({ kind: 'unknown', provider: 'offline', title: 'Mausam Core failed', text: err?.message ?? 'Unexpected error.' });
        else events.onDone?.({ provider: 'offline', badge: 'Mausam Core · on-device', aborted: true });
      }
      return;
    }
    await runChatTurn(events);
  }

  function submit() { send(input.value); }

  /* ---------------- welcome + suggestions ---------------- */

  function welcome() {
    const turn = botTurn();
    const s = getState();
    const n = s?.snapshot?.now;
    const name = s?.you?.name;
    turn.streamBox.remove();
    turn.setMeta('Mausam Core · on-device');
    turn.cards.appendChild(el('div.chat-welcome',
      el('div.chat-welcome-title', null, name ? `Hi ${name}! 👋` : 'Hi! 👋'),
      el('div.chat-welcome-text', null, n
        ? `I answer from live weather data for ${s?.location?.name ?? 'your city'} — with real charts and cards, not just text. In the Z.ai preview I run on the built-in model; anywhere else, paste your own Gemini key in Settings, or just chat — Mausam Core works with zero setup.`
        : 'I answer from live weather data with real charts and cards. Still loading the sky — fire away anyway.')
    ));
    turn.cards.appendChild(el('div.chat-chips.chat-suggestions',
      SUGGESTIONS.map((s2) => el('button.chip', { type: 'button', onclick: () => send(s2) }, s2))
    ));
  }

  /* ---------------- open/close ---------------- */

  function openPanel() {
    open = true;
    panel.classList.add('active');
    fab.classList.add('hidden');
    fab.setAttribute('aria-expanded', 'true');
    setConnection(navigator.onLine);
    if (!welcomed) { welcomed = true; welcome(); }
    setTimeout(() => input.focus({ preventScroll: true }), 60);
  }

  function closePanel() {
    open = false;
    panel.classList.remove('active');
    fab.classList.remove('hidden');
    fab.setAttribute('aria-expanded', 'false');
    fab.focus({ preventScroll: true });
  }

  async function toggle() { open ? closePanel() : openPanel(); }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) closePanel();
  });

  // Stop button behaviour: send becomes ■ while busy
  sendBtn.addEventListener('click', (e) => {
    if (busy && controller) {
      e.preventDefault();
      controller.abort(new DOMException('User stopped', 'AbortError'));
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && inputHistory.length && !input.value) {
      historyIdx = historyIdx < 0 ? inputHistory.length - 1 : Math.max(0, historyIdx - 1);
      input.value = inputHistory[historyIdx] ?? '';
      e.preventDefault();
    } else if (e.key === 'ArrowDown' && historyIdx >= 0) {
      historyIdx += 1;
      if (historyIdx >= inputHistory.length) { historyIdx = -1; input.value = ''; }
      else input.value = inputHistory[historyIdx];
      e.preventDefault();
    }
  });

  function reset() {
    if (controller) controller.abort(new DOMException('Reset', 'AbortError'));
    clear(msgs);
    llmHistory.length = 0;
    lastQuestion = '';
    welcomed = false;
    welcome();
  }

  return {
    open: openPanel, close: closePanel, toggle, reset,
    setHidden(on) {
      fab.classList.toggle('hidden', Boolean(on));
      if (on && open) closePanel();
    },
  };
}
