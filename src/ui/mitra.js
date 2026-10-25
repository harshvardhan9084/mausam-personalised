/**
 * mitra.js — Mausam Mitra as a full tab page (v0.5).
 *
 * Same streaming pipeline as v4 (runChatTurn → stream parser → prose +
 * MausamUI cards), now rendered in the page instead of a floating panel.
 * Suggestions personalise from the user's profile; input history, stop,
 * retry and provider-aware error chips all carry over.
 */

import { el, clear } from '../utils/dom.js';
import { runChatTurn } from '../ai/client.js';
import { renderPayload, renderFallback, proseNode } from '../ai/render.js';
import { t } from '../core/i18n.js';
import { getProfile } from '../core/profile.js';

const MAX_LEN = 500;
const MAX_HISTORY = 16;

let mount = null;
let hooks = null;
let inited = false;

/* ---------------- page state ---------------- */
let busy = false;
let welcomed = false;
let controller = null;
let lastQuestion = '';
let prevQuestion = '';
const llmHistory = [];
const inputHistory = [];
let historyIdx = -1;

/* ---------------- dom ---------------- */
let msgs, input, sendBtn, statusText, providerLabel, statusDot;

const getState = () => window.__mausamState ?? {};

export function wireMitraPage(mountEl, hooksIn) {
  mount = mountEl;
  hooks = hooksIn;
}

/** Router hook: tab became active. */
export function showMitra() {
  if (!mount) return;
  if (!inited) { init(); inited = true; }
  statusDot?.classList.toggle('off', !navigator.onLine);
  if (statusText) statusText.textContent = navigator.onLine ? t('mitra_sub_live') : t('mitra_sub_off');
}

function init() {
  clear(mount);
  statusDot = el('span.chat-status-dot', { title: 'Connection status' });
  providerLabel = el('span.chat-provider-label', null, '');
  statusText = el('span', { id: 'chat-status-text' }, t('mitra_sub_live'));

  mount.append(
    el('div.chat-head.chat-head-page',
      el('div.chat-head-id',
        el('div.chat-avatar', { 'aria-hidden': 'true' }, '🌦️'),
        el('div',
          el('div.chat-title', null, t('mitra_title')),
          el('div.chat-status', null, statusDot, statusText, el('span', { class: 'chat-status-sep' }, '·'), providerLabel),
        ),
      ),
      el('div.chat-head-actions',
        el('button.chat-new', { type: 'button', 'aria-label': t('mitra_new'), title: t('mitra_new'), onclick: () => reset() }, '🧹'),
      ),
    ),
    el('div.chat-msgs.chat-msgs-page', { id: 'chat-msgs', role: 'log', 'aria-live': 'polite' }),
    el('form.chat-inputbar.chat-inputbar-page', {
      onsubmit: (e) => { e.preventDefault(); submit(); },
    },
      el('input.chat-input', {
        id: 'chat-input', type: 'text', placeholder: t('mitra_ph'),
        maxlength: String(MAX_LEN), autocomplete: 'off', spellcheck: 'false',
        'aria-label': t('mitra_ph'),
      }),
      el('button.chat-send', { id: 'chat-send', type: 'submit', 'aria-label': t('mitra_send') }, '➤'),
    ),
  );

  msgs = mount.querySelector('#chat-msgs');
  input = mount.querySelector('#chat-input');
  sendBtn = mount.querySelector('#chat-send');

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

  welcome();
}

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
  sendBtn.textContent = on ? '■' : '➤';
  sendBtn.setAttribute('aria-label', on ? t('mitra_stop') : t('mitra_send'));
  sendBtn.setAttribute('aria-busy', String(on));
}

function setProviderLabel(badge) {
  providerLabel.textContent = badge ? ` · ${badge}` : '';
}

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
    setMeta(text) { if (text) meta.textContent = text; },
  };
}

function suggestions() {
  const p = getProfile();
  const ints = p?.interests ?? [];
  const out = [t('sugg_rain'), t('sugg_wear')];
  if (ints.includes('farming')) out.unshift(t('sugg_farm'));
  if (ints.includes('wedding')) out.unshift(t('sugg_wedding'));
  if (ints.includes('laundry') || ints.includes('cooking')) out.push(t('sugg_laundry'));
  if (ints.includes('fitness') || ints.includes('cycling')) out.splice(1, 0, t('sugg_run'));
  out.push(t('sugg_air'), t('sugg_city'), t('sugg_weekend'));
  return out.slice(0, 6);
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
    onOpen: (info) => setProviderLabel(info.note ? `${info.badge} · ${info.note}` : info.badge),
    onText: (delta) => { streamed += delta; flushStream(); },
    onCode: async (codeText) => {
      const pre = el('pre.chat-code', null, String(codeText).replace(/\s+$/, ''));
      await turn.type(pre, 0);
    },
    onComponent: async (payload) => {
      const node = renderPayload(payload, { onSend: (m) => send(m) });
      if (node) await turn.type(node);
    },
    onFallback: async (rawJson, reason) => {
      await turn.type(renderFallback(rawJson, reason));
    },
    onDone: (info) => {
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
    },
    onError: async (err) => {
      clear(turn.streamBox);
      if (!streamed.trim()) turn.streamBox.remove();
      const card = el('div.chat-error',
        el('div.chat-error-title', null, `⚠️ ${err.title}`),
        el('div.chat-error-text', null, err.text),
        err.raw && err.raw !== err.text ? el('div.chat-error-raw', null, String(err.raw).slice(0, 160)) : null,
        el('div.chat-error-actions',
          el('button.chip', { type: 'button', onclick: () => send(lastQuestion, { isRetry: true }) }, '↻ Retry'),
          (err.provider === 'gemini' && (err.kind === 'badkey' || err.kind === 'nokey' || err.kind === 'model'))
            ? el('button.chip', { type: 'button', onclick: () => hooks?.openSettings?.('ai') }, '⚙️ Settings')
            : null,
          err.provider !== 'offline'
            ? el('button.chip', { type: 'button', onclick: () => send('Use Mausam Core', { isRetry: false }) }, '🧠 Use Mausam Core')
            : null,
        ),
      );
      await turn.type(card, 0);
      llmHistory.push({ role: 'user', text });
      setBusy(false);
      controller = null;
    },
  };

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
    const state = events.getState?.() ?? {};
    const { offlineChat } = await import('../ai/offline.js');
    const { createStreamParser } = await import('../ai/render.js');
    const parser = createStreamParser();
    events.onOpen?.({ provider: 'offline', badge: 'Mausam Core · on-device' });
    const pump = (delta) => {
      for (const e of parser.push(delta)) {
        if (e.type === 'text') events.onText?.(e.text);
        else if (e.type === 'component') events.onComponent?.(e.payload);
        else if (e.type === 'fallback') events.onFallback?.(e.raw, e.reason);
        else if (e.type === 'code') events.onCode?.(e.text);
      }
    };
    try {
      await offlineChat({ userText: events.userText, onText: pump, signal: events.signal, getState: events.getState });
      for (const e of parser.end()) {
        if (e.type === 'component') events.onComponent?.(e.payload);
        else if (e.type === 'fallback') events.onFallback?.(e.raw, e.reason);
        else if (e.type === 'code') events.onCode?.(e.text);
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

/* ---------------- welcome ---------------- */

function welcome() {
  const turn = botTurn();
  const s = getState();
  const n = s?.snapshot?.now;
  const name = getProfile()?.name;
  turn.streamBox.remove();
  turn.setMeta('Mausam Core · on-device');
  turn.cards.appendChild(el('div.chat-welcome',
    el('div.chat-welcome-title', null, `${t('mitra_welcome_hi')}${name ? ` ${name}` : ''}! 👋`),
    el('div.chat-welcome-text', null,
      t(n ? 'mitra_welcome_t' : 'mitra_welcome_t_nocity', { city: s?.location?.name ?? '' })),
  ));
  turn.cards.appendChild(el('div.chat-chips.chat-suggestions',
    suggestions().map((s2) => el('button.chip', { type: 'button', onclick: () => send(s2) }, s2)),
  ));
  welcomed = true;
}

function reset() {
  if (controller) controller.abort(new DOMException('Reset', 'AbortError'));
  clear(msgs);
  llmHistory.length = 0;
  lastQuestion = '';
  prevQuestion = '';
  welcome();
}
