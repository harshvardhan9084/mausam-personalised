/**
 * mitra.js — Mausam Mitra as a full tab page (v0.6).
 *
 * Streaming pipeline unchanged (runChatTurn → stream parser → prose +
 * MausamUI cards). v0.6 adds:
 *  • persistent chat history (localStorage, restored with cards re-rendered)
 *  • a history sheet (🕘): reopen, delete one, clear all
 *  • "scroll to latest" floating button whenever you're not at the bottom
 *  • keyboard: `/` jumps to the chat box from anywhere, Esc releases it
 *  • voice input (Web Speech API, hi-IN / en-IN) with graceful fallback
 */

import { el, clear } from '../utils/dom.js';
import { runChatTurn } from '../ai/client.js';
import { renderPayload, renderFallback, proseNode, createStreamParser } from '../ai/render.js';
import { t, getLang } from '../core/i18n.js';
import { getProfile } from '../core/profile.js';
import { store } from '../core/storage.js';

const MAX_LEN = 500;
const MAX_HISTORY = 16;      // messages kept in the LLM context
const MAX_CHATS = 30;        // conversations kept on device
const MAX_MSGS = 60;         // messages kept per conversation

let mount = null;
let hooks = null;
let inited = false;

/* ---------------- page state ---------------- */
let busy = false;
let controller = null;
let lastQuestion = '';
let prevQuestion = '';
let chatId = null;           // current conversation id (persisted)
let chatTitle = '';
const msgsTurn = [];         // messages of the CURRENT conversation [{role, text}]
const llmHistory = [];       // trimmed LLM context
const inputHistory = [];
let historyIdx = -1;
let listening = false;
let recog = null;
let recogBase = '';

/* ---------------- dom ---------------- */
let msgs, input, sendBtn, statusText, providerLabel, statusDot, micBtn, scrollBtn;

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
        el('button.chat-new', { type: 'button', 'aria-label': t('mitra_history'), title: t('mitra_history'), onclick: () => openHistorySheet() }, '🕘'),
        el('button.chat-new', { type: 'button', 'aria-label': t('mitra_new'), title: t('mitra_new'), onclick: () => newChat() }, '🧹'),
      ),
    ),
    el('div.chat-body',
      el('div.chat-msgs.chat-msgs-page', { id: 'chat-msgs', role: 'log', 'aria-live': 'polite' }),
      el('button.chat-scroll-down', {
        id: 'chat-scroll-down', type: 'button', 'aria-label': t('mitra_scroll_down'), title: t('mitra_scroll_down'),
        onclick: () => stickToBottom(true),
      }, '↓'),
    ),
    el('form.chat-inputbar.chat-inputbar-page', {
      onsubmit: (e) => { e.preventDefault(); submit(); },
    },
      el('input.chat-input', {
        id: 'chat-input', type: 'text', placeholder: t('mitra_ph'),
        maxlength: String(MAX_LEN), autocomplete: 'off', spellcheck: 'false',
        'aria-label': t('mitra_ph'),
      }),
      micBtn || buildMic(),
      el('button.chat-send', { id: 'chat-send', type: 'submit', 'aria-label': t('mitra_send') }, '➤'),
    ),
  );

  msgs = mount.querySelector('#chat-msgs');
  input = mount.querySelector('#chat-input');
  sendBtn = mount.querySelector('#chat-send');
  scrollBtn = mount.querySelector('#chat-scroll-down');

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
    } else if (e.key === 'Escape') {
      input.blur(); // release the text box
      e.preventDefault();
    }
  });

  /* scroll-to-latest visibility */
  msgs.addEventListener('scroll', updateScrollBtn, { passive: true });
  window.addEventListener('resize', updateScrollBtn);
  new ResizeObserver(updateScrollBtn).observe(msgs);

  /* global shortcuts: "/" focuses the box from anywhere, Esc releases */
  document.addEventListener('keydown', globalKeys);

  welcomeOrRestore();
}

/* ---------------- global keyboard shortcuts ---------------- */

function globalKeys(e) {
  const tag = e.target?.tagName;
  const editable = e.target?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  if (e.key === '/' && !editable && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    if (hooks?.go && hooks.currentPage?.() !== 'mitra') hooks.go('mitra');
    if (!inited) { init(); inited = true; }
    input?.focus();
  } else if (e.key === 'Escape' && document.activeElement === input) {
    input.blur();
    e.preventDefault();
  }
}

/* ---------------- voice input (Web Speech API) ---------------- */

function buildMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null; // graceful: no mic button where unsupported
  micBtn = el('button.chat-mic', {
    type: 'button', 'aria-label': t('mitra_voice'), title: t('mitra_voice'),
    onclick: toggleVoice,
  }, '🎤');
  return micBtn;
}

function toggleVoice() {
  if (listening) { recog?.stop(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  try {
    recog = new SR();
    const aiLang = store.aiLang.get() ?? 'auto';
    recog.lang = aiLang === 'hi' || getLang() === 'hi' ? 'hi-IN' : 'en-IN';
    recog.interimResults = true;
    recog.continuous = false;
    recogBase = input.value ? input.value.trim() + ' ' : '';

    recog.onresult = (ev) => {
      let interim = '';
      let finalTxt = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalTxt += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (finalTxt) input.value = (recogBase + finalTxt).slice(0, MAX_LEN);
      else if (interim) input.value = (recogBase + interim).slice(0, MAX_LEN);
    };
    recog.onend = () => setListening(false);
    recog.onerror = () => setListening(false);

    recog.start();
    setListening(true);
  } catch {
    setListening(false);
    if (statusText) statusText.textContent = t('mitra_voice_no');
  }
}

function setListening(on) {
  listening = on;
  micBtn?.classList.toggle('listening', on);
  if (micBtn) micBtn.textContent = on ? '⏺' : '🎤';
  if (micBtn) micBtn.setAttribute('aria-label', on ? t('mitra_voice_listening') : t('mitra_voice'));
  input?.setAttribute('placeholder', on ? t('mitra_voice_listening') : t('mitra_ph'));
}

/* ---------------- chat history (persisted) ---------------- */

function loadChats() {
  const c = store.chats.get();
  return (c && Array.isArray(c.list)) ? c : { list: [], currentId: null };
}

function saveChats(state) {
  try { store.chats.set(state); } catch { /* quota — ignore */ }
}

/** Ensure a conversation shell exists for the turn in flight. */
function ensureChat() {
  if (chatId) return;
  chatId = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  chatTitle = '';
  msgsTurn.length = 0;
}

/** Append a message to the current conversation and persist. */
function persistMsg(role, text) {
  if (!text || !String(text).trim()) return;
  ensureChat();
  msgsTurn.push({ role, text: String(text).slice(0, 8000) });
  if (role === 'user' && !chatTitle) chatTitle = String(text).slice(0, 64);

  const state = loadChats();
  let chat = state.list.find((c) => c.id === chatId);
  if (!chat) {
    chat = { id: chatId, at: Date.now(), title: chatTitle, msgs: [] };
    state.list.unshift(chat);
  }
  chat.at = Date.now();
  chat.title = chatTitle || chat.title;
  chat.msgs = msgsTurn.slice(-MAX_MSGS).map((m) => ({ ...m }));
  state.currentId = chatId;
  if (state.list.length > MAX_CHATS) state.list.length = MAX_CHATS;
  saveChats(state);
}

/** Restore the last conversation (with cards) or show the welcome card. */
function welcomeOrRestore() {
  const state = loadChats();
  const chat = state.list.find((c) => c.id === state.currentId);
  if (chat && chat.msgs?.length) {
    chatId = chat.id;
    chatTitle = chat.title;
    msgsTurn.length = 0;
    llmHistory.length = 0;
    for (const m of chat.msgs) {
      if (m.role === 'user') renderUserText(m.text);
      else renderBotText(m.text);
      msgsTurn.push({ role: m.role, text: m.text });
      llmHistory.push({ role: m.role === 'user' ? 'user' : 'model', text: m.text });
    }
    if (llmHistory.length > MAX_HISTORY * 2) llmHistory.splice(0, llmHistory.length - MAX_HISTORY * 2);
    requestAnimationFrame(() => stickToBottom(true));
  } else {
    welcome();
  }
}

/** 🧹 — archive what's on screen and start fresh. */
function newChat() {
  if (controller) controller.abort(new DOMException('Reset', 'AbortError'));
  if (listening) recog?.stop();
  chatId = null;
  chatTitle = '';
  msgsTurn.length = 0;
  llmHistory.length = 0;
  lastQuestion = '';
  prevQuestion = '';
  clear(msgs);
  const state = loadChats();
  state.currentId = null;
  saveChats(state);
  welcome();
}

/** 🕘 — the history sheet. */
function openHistorySheet() {
  const state = loadChats();
  const overlay = el('div.modal-overlay.active', { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('mitra_history') });
  const box = el('div.modal-box.chat-hist-box',
    el('div.modal-header',
      el('span.modal-title', null, t('mitra_history')),
      el('button.modal-close', { type: 'button', 'aria-label': 'Close', onclick: () => overlay.remove() }, '✕'),
    ),
  );

  if (!state.list.length) {
    box.appendChild(el('div.chat-hist-empty', null, t('mitra_hist_empty')));
  } else {
    const list = el('div.chat-hist-list');
    for (const c of state.list) {
      const when = new Date(c.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      list.appendChild(el('div.chat-hist-item',
        el('button.chat-hist-open', {
          type: 'button',
          onclick: () => { overlay.remove(); openChat(c.id); },
        },
          el('span.chat-hist-title', null, c.title || t('mitra_title')),
          el('span.chat-hist-meta', null, `${when} · ${c.msgs?.length ?? 0}`),
        ),
        el('button.chat-hist-del', {
          type: 'button', 'aria-label': t('mitra_hist_del'), title: t('mitra_hist_del'),
          onclick: (e) => { e.stopPropagation(); deleteChat(c.id); overlay.remove(); openHistorySheet(); },
        }, '🗑'),
      ));
    }
    box.appendChild(list);
    box.appendChild(el('div.chat-hist-clear',
      el('button.btn.btn-sm', { type: 'button', onclick: () => { clearAllChats(); overlay.remove(); } }, t('mitra_hist_clear')),
    ));
  }

  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function openChat(id) {
  const state = loadChats();
  const chat = state.list.find((c) => c.id === id);
  if (!chat) return;
  if (controller) controller.abort(new DOMException('Switched chat', 'AbortError'));
  chatId = chat.id;
  chatTitle = chat.title;
  msgsTurn.length = 0;
  llmHistory.length = 0;
  clear(msgs);
  for (const m of chat.msgs) {
    if (m.role === 'user') renderUserText(m.text);
    else renderBotText(m.text);
    msgsTurn.push({ role: m.role, text: m.text });
    llmHistory.push({ role: m.role === 'user' ? 'user' : 'model', text: m.text });
  }
  if (llmHistory.length > MAX_HISTORY * 2) llmHistory.splice(0, llmHistory.length - MAX_HISTORY * 2);
  state.currentId = id;
  saveChats(state);
  requestAnimationFrame(() => stickToBottom(true));
}

function deleteChat(id) {
  const state = loadChats();
  state.list = state.list.filter((c) => c.id !== id);
  if (state.currentId === id) { state.currentId = null; if (chatId === id) { chatId = null; chatTitle = ''; } }
  saveChats(state);
  if (chatId === id && msgsTurn.length) { newChat(); }
}

function clearAllChats() {
  saveChats({ list: [], currentId: null });
  newChat();
}

/* ---------------- helpers ---------------- */

function nearBottom() {
  return msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 140;
}

function updateScrollBtn() {
  if (!scrollBtn) return;
  const away = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight > 260;
  scrollBtn.classList.toggle('show', away);
}

function stickToBottom(force = false) {
  if (force || nearBottom()) msgs.scrollTop = msgs.scrollHeight;
  updateScrollBtn();
}

function bubble(role, node) {
  const b = el(`div.chat-msg.${role}`, null, node);
  msgs.appendChild(b);
  requestAnimationFrame(() => stickToBottom());
  return b;
}

function renderUserText(text) {
  bubble('user', el('div.chat-user-text', null, text));
}

/** Re-render stored bot text (prose + MausamUI fences → real cards). */
function renderBotText(text) {
  const streamBox = el('div.chat-stream.chat-text', { 'aria-live': 'off' });
  const cards = el('div.chat-cards');
  const wrap = el('div', null, streamBox, cards);
  bubble('bot', wrap);
  const parser = createStreamParser();
  let acc = '';
  const pump = (delta) => {
    for (const e of parser.push(delta)) {
      if (e.type === 'text') { acc += e.text; }
      else if (e.type === 'component') cards.appendChild(renderPayload(e.payload, { onSend: (m) => send(m) }) ?? document.createComment(''));
      else if (e.type === 'fallback') cards.appendChild(renderFallback(e.raw, e.reason));
      else if (e.type === 'code') cards.appendChild(el('pre.chat-code', null, String(e.text).replace(/\s+$/, '')));
    }
  };
  pump(String(text ?? ''));
  for (const e of parser.end()) {
    if (e.type === 'component') cards.appendChild(renderPayload(e.payload, { onSend: (m) => send(m) }) ?? document.createComment(''));
    else if (e.type === 'fallback') cards.appendChild(renderFallback(e.raw, e.reason));
    else if (e.type === 'code') cards.appendChild(el('pre.chat-code', null, String(e.text).replace(/\s+$/, '')));
  }
  if (acc.trim()) streamBox.appendChild(proseNode(acc));
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

  renderUserText(text);
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
      persistMsg('user', text);
      persistMsg('model', streamed);
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
      persistMsg('user', text);
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
    el('div.chat-welcome-tip', null, `⌨️ ${t('mitra_shortcut_hint')}`),
  ));
  turn.cards.appendChild(el('div.chat-chips.chat-suggestions',
    suggestions().map((s2) => el('button.chip', { type: 'button', onclick: () => send(s2) }, s2)),
  ));
}
