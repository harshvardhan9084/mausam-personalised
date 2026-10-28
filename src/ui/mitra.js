/**
 * mitra.js — Mausam Mitra as a full tab page (v0.7).
 *
 * Streaming pipeline unchanged (runChatTurn → stream parser → prose +
 * MausamUI cards). Production pass:
 *  • persistent chat history (localStorage, restored with cards re-rendered)
 *  • a history sheet (🕘): reopen, delete one, clear all
 *  • "scroll to latest" floating button whenever you're not at the bottom
 *  • keyboard: `/` focuses this tab's composer (main.js dispatches it —
 *    there is no cross-tab AI shortcut), Esc releases it
 *  • auto-growing composer: Enter sends, Shift+Enter adds a line
 *  • typing indicator until the first token arrives
 *  • copy button on every finished reply
 *  • voice input (Web Speech API, hi-IN / en-IN) with graceful fallback
 */

import { el, clear, trapFocus } from '../utils/dom.js';
import { runChatTurn } from '../ai/client.js';
import { renderPayload, renderFallback, proseNode, createStreamParser } from '../ai/render.js';
import { t, getLang } from '../core/i18n.js';
import { getProfile } from '../core/profile.js';
import { store } from '../core/storage.js';
import { icon, setIcon, skyIcon } from './icons.js';

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
let msgs, input, sendBtn, statusText, providerLabel, statusDot, micBtn, scrollBtn, countEl;

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
  // size the composer to its (possibly multi-line, possibly Hindi) placeholder —
  // at phone widths a 1-row textarea clips the wrapped placeholder mid-glyph
  autogrow();
}

function init() {
  clear(mount);
  statusDot = el('span.chat-status-dot', { title: 'Connection status' });
  providerLabel = el('span.chat-provider-label', null, '');
  statusText = el('span', { id: 'chat-status-text' }, t('mitra_sub_live'));

  mount.append(
    el('div.chat-head.chat-head-page',
      el('div.chat-head-id',
        el('div.chat-avatar', { 'aria-hidden': 'true' }, skyIcon('partly-day')),
        el('div',
          el('div.chat-title', null, t('mitra_title')),
          el('div.chat-status', null, statusDot, statusText, el('span', { class: 'chat-status-sep' }, '·'), providerLabel),
        ),
      ),
      el('div.chat-head-actions',
        el('button.chat-new', { type: 'button', 'aria-label': t('mitra_history'), title: t('mitra_history'), onclick: () => openHistorySheet() }, icon('history')),
        el('button.chat-new', { type: 'button', 'aria-label': t('mitra_new'), title: t('mitra_new'), onclick: () => newChat() }, icon('broom')),
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
      el('textarea.chat-input', {
        id: 'chat-input', rows: '1', placeholder: t('mitra_ph'),
        maxlength: String(MAX_LEN), autocomplete: 'off', spellcheck: 'false',
        'aria-label': t('mitra_ph'),
      }),
      el('span.chat-count', { id: 'chat-count', 'aria-hidden': 'true' }),
      micBtn || buildMic(),
      el('button.chat-send', { id: 'chat-send', type: 'submit', 'aria-label': t('mitra_send') },
        el('span.chat-send-ico', null, icon('send')),
      ),
    ),
  );

  msgs = mount.querySelector('#chat-msgs');
  input = mount.querySelector('#chat-input');
  sendBtn = mount.querySelector('#chat-send');
  scrollBtn = mount.querySelector('#chat-scroll-down');
  countEl = mount.querySelector('#chat-count');

  sendBtn.addEventListener('click', (e) => {
    if (busy && controller) {
      e.preventDefault();
      controller.abort(new DOMException('User stopped', 'AbortError'));
    }
  });

  input.addEventListener('input', () => {
    autogrow();
    if (countEl) countEl.textContent = input.value.length > MAX_LEN - 60 ? String(MAX_LEN - input.value.length) : '';
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === 'ArrowUp' && inputHistory.length && !input.value) {
      historyIdx = historyIdx < 0 ? inputHistory.length - 1 : Math.max(0, historyIdx - 1);
      input.value = inputHistory[historyIdx] ?? '';
      autogrow();
      e.preventDefault();
    } else if (e.key === 'ArrowDown' && historyIdx >= 0) {
      historyIdx += 1;
      if (historyIdx >= inputHistory.length) { historyIdx = -1; input.value = ''; }
      else input.value = inputHistory[historyIdx];
      autogrow();
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

  welcomeOrRestore();
}

/** Composer focus — used by main.js's per-screen "/" dispatcher. */
export function focusMitraInput() {
  if (!input) return;
  input.focus();
  try { input.setSelectionRange(input.value.length, input.value.length); } catch { /* textarea ok */ }
}

function autogrow() {
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
}

/* ---------------- voice input (Web Speech API) ---------------- */

function buildMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null; // graceful: no mic button where unsupported
  micBtn = el('button.chat-mic', {
    type: 'button', 'aria-label': t('mitra_voice'), title: t('mitra_voice'),
    onclick: toggleVoice,
  }, icon('mic'));
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
  if (micBtn) setIcon(micBtn, on ? 'stop' : 'mic');
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

/** Append a message to the current conversation and persist.
 *  `cards` carries MausamUI payloads that came from tool calls — they are
 *  not part of the streamed text, so without them restored chats would
 *  silently lose every tool-driven chart. */
function persistMsg(role, text, cards = null) {
  if (!text || !String(text).trim()) return;
  ensureChat();
  const entry = { role, text: String(text).slice(0, 8000) };
  if (role === 'model' && Array.isArray(cards) && cards.length) {
    entry.cards = cards.slice(0, 6);
  }
  msgsTurn.push(entry);
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
      else renderBotText(m.text, m.cards);
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
  stopSpeaking();
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
  const { closeFocus } = trapFocus(overlay);
  const close = () => {
    document.removeEventListener('keydown', onEsc);
    closeFocus();
    overlay.remove();
  };
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onEsc);
  const box = el('div.modal-box.chat-hist-box',
    el('div.modal-header',
      el('span.modal-title', null, t('mitra_history')),
      el('button.modal-close', { type: 'button', 'aria-label': 'Close', onclick: close }, '✕'),
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
          onclick: () => { close(); openChat(c.id); },
        },
          el('span.chat-hist-title', null, c.title || t('mitra_title')),
          el('span.chat-hist-meta', null, `${when} · ${c.msgs?.length ?? 0}`),
        ),
        el('button.chat-hist-del', {
          type: 'button', 'aria-label': t('mitra_hist_del'), title: t('mitra_hist_del'),
          onclick: (e) => { e.stopPropagation(); deleteChat(c.id); close(); openHistorySheet(); },
        }, icon('trash')),
      ));
    }
    box.appendChild(list);
    box.appendChild(el('div.chat-hist-clear',
      el('button.btn.btn-sm', { type: 'button', onclick: () => { clearAllChats(); close(); } }, t('mitra_hist_clear')),
    ));
  }

  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

function openChat(id) {
  const state = loadChats();
  const chat = state.list.find((c) => c.id === id);
  if (!chat) return;
  if (controller) controller.abort(new DOMException('Switched chat', 'AbortError'));
  stopSpeaking();
  chatId = chat.id;
  chatTitle = chat.title;
  msgsTurn.length = 0;
  llmHistory.length = 0;
  clear(msgs);
  for (const m of chat.msgs) {
    if (m.role === 'user') renderUserText(m.text);
    else renderBotText(m.text, m.cards);
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

/** Re-render stored bot text (prose + MausamUI fences + tool cards →
 *  real components). Restored replies get the same copy + listen actions. */
function renderBotText(text, cards = []) {
  const streamBox = el('div.chat-stream.chat-text', { 'aria-live': 'off' });
  const cardsBox = el('div.chat-cards');
  const metaActions = el('span.chat-meta-actions');
  const meta = el('div.chat-meta', null, el('span'), metaActions);
  const wrap = el('div', null, streamBox, cardsBox, meta);
  bubble('bot', wrap);
  const parser = createStreamParser();
  let acc = '';
  const pump = (delta) => {
    for (const e of parser.push(delta)) {
      if (e.type === 'text') { acc += e.text; }
      else if (e.type === 'component') cardsBox.appendChild(renderPayload(e.payload, { onSend: (m) => send(m) }) ?? document.createComment(''));
      else if (e.type === 'fallback') cardsBox.appendChild(renderFallback(e.raw, e.reason));
      else if (e.type === 'code') cardsBox.appendChild(el('pre.chat-code', null, String(e.text).replace(/\s+$/, '')));
    }
  };
  pump(String(text ?? ''));
  for (const e of parser.end()) {
    if (e.type === 'component') cardsBox.appendChild(renderPayload(e.payload, { onSend: (m) => send(m) }) ?? document.createComment(''));
    else if (e.type === 'fallback') cardsBox.appendChild(renderFallback(e.raw, e.reason));
    else if (e.type === 'code') cardsBox.appendChild(el('pre.chat-code', null, String(e.text).replace(/\s+$/, '')));
  }
  /* tool-call payloads that rode along with this reply */
  if (Array.isArray(cards)) {
    for (const p of cards) {
      try {
        const node = renderPayload(p, { onSend: (m) => send(m) });
        if (node) cardsBox.appendChild(node);
      } catch { /* skip a broken stored payload */ }
    }
  }
  if (acc.trim() || cardsBox.childElementCount) {
    if (acc.trim()) streamBox.appendChild(proseNode(acc));
    addCopyAction({ metaActions }, () => acc.trim());
    addListenAction({ metaActions }, () => acc.trim());
  }
}

function setBusy(on) {
  busy = on;
  const ico = sendBtn?.querySelector('.chat-send-ico');
  if (ico) setIcon(ico, on ? 'stop' : 'send');
  sendBtn.setAttribute('aria-label', on ? t('mitra_stop') : t('mitra_send'));
  sendBtn.setAttribute('aria-busy', String(on));
}

function setProviderLabel(badge) {
  providerLabel.textContent = badge ? ` · ${badge}` : '';
}

function botTurn({ withTyping = false } = {}) {
  const streamBox = el('div.chat-stream.chat-text', { 'aria-live': 'polite' });
  const cards = el('div.chat-cards');
  const metaBadge = el('span');
  const metaActions = el('span.chat-meta-actions');
  const meta = el('div.chat-meta', null, metaBadge, metaActions);
  const wrap = el('div', null, streamBox, cards, meta);
  const b = bubble('bot', wrap);
  let typing = null;
  if (withTyping) {
    typing = el('div.typing', null, el('span'), el('span'), el('span'));
    streamBox.appendChild(typing);
  }
  const dropTyping = () => {
    typing?.remove();
    typing = null;
  };
  return {
    streamBox, cards, meta, metaActions, bubble: b, dropTyping,
    async type(node, delay = 80) {
      dropTyping();
      cards.appendChild(node);
      await new Promise((r) => setTimeout(r, delay));
      stickToBottom();
    },
    setMeta(text) { if (text) metaBadge.textContent = text; },
  };
}

/** Copy-to-clipboard chip appended to a finished reply. */
function addCopyAction(turn, getText) {
  if (!turn || !getText) return;
  const btn = el('button.chat-copy', {
    type: 'button', title: t('copy_answer'), 'aria-label': t('copy_answer'),
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(getText());
        btn.classList.add('done');
        btn.textContent = '✓';
        setTimeout(() => { btn.classList.remove('done'); setIcon(btn, 'copy'); }, 1400);
      } catch { /* clipboard unavailable */ }
    },
  });
  setIcon(btn, 'copy');
  turn.metaActions.appendChild(btn);
}

/* ---------------- text-to-speech (on-device, free) ----------------
 * 🔊 Listen reads the reply's prose aloud — helpful for low-literacy
 * users and hands-free checks. Web Speech Synthesis, no network calls.
 */
let speakBtn = null;

function ttsText(raw) {
  return String(raw ?? '')
    .replace(/```[a-z-]*[\s\S]*?```/gi, ' ') // fences render as cards; speak prose only
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[`>#_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900);
}

function stopSpeaking() {
  try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
  if (speakBtn) {
    speakBtn.classList.remove('speaking');
    setIcon(speakBtn, 'listen');
    speakBtn.setAttribute('aria-label', t('mitra_listen'));
    speakBtn.setAttribute('title', t('mitra_listen'));
    speakBtn = null;
  }
}

/** 🔊 chip on a finished reply. */
function addListenAction(turn, getText) {
  if (!turn || !getText || !('speechSynthesis' in window)) return;
  const btn = el('button.chat-copy', {
    type: 'button', title: t('mitra_listen'), 'aria-label': t('mitra_listen'),
    onclick: () => {
      if (speakBtn === btn) { stopSpeaking(); return; }
      stopSpeaking();
      const text = ttsText(getText());
      if (!text) return;
      try {
        const u = new SpeechSynthesisUtterance(text);
        const hi = getLang() === 'hi' || (store.aiLang.get() ?? 'auto') === 'hi';
        u.lang = hi ? 'hi-IN' : 'en-IN';
        const voice = window.speechSynthesis.getVoices()?.find((v) => (v.lang ?? '').replace('_', '-').toLowerCase().startsWith(hi ? 'hi' : 'en'));
        if (voice) u.voice = voice;
        u.rate = 1;
        u.onend = () => stopSpeaking();
        u.onerror = () => stopSpeaking();
        speakBtn = btn;
        btn.classList.add('speaking');
        setIcon(btn, 'stop');
        btn.setAttribute('aria-label', t('mitra_listen_stop'));
        btn.setAttribute('title', t('mitra_listen_stop'));
        window.speechSynthesis.speak(u);
      } catch { stopSpeaking(); }
    },
  });
  setIcon(btn, 'listen');
  turn.metaActions.appendChild(btn);
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
  msgs.classList.remove('is-empty'); // first real turn ends the centered empty state
  stopSpeaking(); // a new turn silences the reader
  if (!isRetry && !/^use mausam core$/i.test(text)) {
    prevQuestion = lastQuestion;
    lastQuestion = text;
  }
  inputHistory.push(text);
  if (inputHistory.length > 20) inputHistory.shift();
  historyIdx = -1;

  renderUserText(text);
  input.value = '';
  input.style.height = '';
  if (countEl) countEl.textContent = '';
  setBusy(true);
  controller = new AbortController();
  const turn = botTurn({ withTyping: true });
  setProviderLabel('');

  let streamed = '';
  let rafPending = false;
  let firstContent = false;
  const turnCards = []; // tool-call payloads rendered this turn (persisted with the reply)
  const markContent = () => {
    if (firstContent) return;
    firstContent = true;
    turn.dropTyping();
  };
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
    onText: (delta) => { markContent(); streamed += delta; flushStream(); },
    onCode: async (codeText) => {
      const pre = el('pre.chat-code', null, String(codeText).replace(/\s+$/, ''));
      await turn.type(pre, 0);
    },
    onComponent: async (payload) => {
      turnCards.push(payload);
      const node = renderPayload(payload, { onSend: (m) => send(m) });
      if (node) await turn.type(node);
    },
    onFallback: async (rawJson, reason) => {
      await turn.type(renderFallback(rawJson, reason));
    },
    onDone: (info) => {
      turn.dropTyping();
      clear(turn.streamBox).appendChild(proseNode(streamed));
      if (!streamed.trim() && !turn.cards.childElementCount) {
        clear(turn.streamBox).appendChild(el('span', null, '(no content — try again)'));
      }
      turn.setMeta(info?.aborted ? `${info.badge ?? ''} · stopped` : info?.badge ?? '');
      if (streamed.trim() && !info?.aborted) {
        addCopyAction(turn, () => streamed.trim());
        addListenAction(turn, () => streamed.trim());
      }
      llmHistory.push({ role: 'user', text });
      llmHistory.push({ role: 'model', text: streamed || '(card-only answer)' });
      if (llmHistory.length > MAX_HISTORY * 2) llmHistory.splice(0, llmHistory.length - MAX_HISTORY * 2);
      persistMsg('user', text);
      persistMsg('model', streamed, turnCards);
      setBusy(false);
      controller = null;
    },
    onError: async (err) => {
      turn.dropTyping();
      clear(turn.streamBox);
      if (!streamed.trim()) turn.streamBox.remove();
      const card = el('div.chat-error',
        el('div.chat-error-title', null, icon('warn', 'chip-ico'), ' ', err.title),
        el('div.chat-error-text', null, err.text),
        err.raw && err.raw !== err.text ? el('div.chat-error-raw', null, String(err.raw).slice(0, 160)) : null,
        el('div.chat-error-actions',
          el('button.chip', { type: 'button', onclick: () => send(lastQuestion, { isRetry: true }) }, '↻ Retry'),
          (err.provider === 'gemini' && (err.kind === 'badkey' || err.kind === 'nokey' || err.kind === 'model'))
            ? el('button.chip', { type: 'button', onclick: () => hooks?.openSettings?.('ai') }, icon('settings', 'chip-ico'), ' ', t('nav_settings'))
            : null,
          err.provider !== 'offline'
            ? el('button.chip', { type: 'button', onclick: () => send('Use Mausam Core', { isRetry: false }) }, icon('cpu', 'chip-ico'), ' ', t('mitra_core_retry'))
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
  // v0.8.11: the empty state is a composed moment, not a top-hugging card over
  // a gray void — .is-empty centers the cluster vertically in .chat-msgs-page
  // (removed on the first real turn), and the '/' shortcut tip renders the key
  // as a real key-cap instead of a keyboard emoji.
  msgs.classList.add('is-empty');
  const hint = t('mitra_shortcut_hint');
  const slash = hint.indexOf('/');
  const tipKids = slash >= 0
    ? [hint.slice(0, slash), el('kbd.kbd', null, '/'), hint.slice(slash + 1)]
    : [hint];
  turn.cards.appendChild(el('div.chat-welcome',
    el('div.chat-welcome-title', null, `${t('mitra_welcome_hi')}${name ? ` ${name}` : ''}! 👋`),
    el('div.chat-welcome-text', null,
      t(n ? 'mitra_welcome_t' : 'mitra_welcome_t_nocity', { city: s?.location?.name ?? '' })),
    el('div.chat-welcome-tip', null, tipKids),
  ));
  turn.cards.appendChild(el('div.chat-chips.chat-suggestions',
    suggestions().map((s2) => el('button.chip', { type: 'button', onclick: () => send(s2) }, s2)),
  ));
}
