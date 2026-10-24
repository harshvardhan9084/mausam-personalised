/**
 * client.js — AI orchestration for Mausam Mitra.
 *
 * Provider resolution (settings → 'auto'):
 *   1. Z.ai preview  — same-origin /api/chat exists (web-dev preview only)
 *   2. Gemini        — user pasted their own API key (default model
 *                      gemini-3.5-flash-lite)
 *   3. Mausam Core   — offline engine, always available, zero config
 *
 * All providers emit the same event stream; text deltas are parsed by the
 * MausamUI stream parser so prose renders live and cards pop in as their
 * fences complete. Malformed cards degrade to readable fallbacks — never
 * an exception into the chat.
 */

import { store } from '../core/storage.js';
import { buildSystemPrompt, trimHistory } from './prompt.js';
import { TOOL_DECLARATIONS, runTool } from './tools.js';
import { geminiChat, geminiErrorCopy } from './gemini.js';
import { probeZai, zaiChat, zaiErrorCopy } from './zai.js';
import { offlineChat, offlineErrorCopy } from './offline.js';
import { createStreamParser } from './render.js';

export const PROVIDERS = {
  zai: { label: 'Z.ai (preview)' },
  gemini: { label: 'Gemini' },
  offline: { label: 'Mausam Core' },
};

let zaiAvailable = null; // memoised probe

export function aiSettings() {
  return store.ai.get() ?? { provider: 'auto', geminiKey: '', model: 'gemini-3.5-flash-lite' };
}

/** Resolve which provider to use right now (may probe the network once). */
export async function resolveProvider(state) {
  const cfg = aiSettings();
  const explicit = cfg.provider;

  if (explicit === 'offline') return { id: 'offline', model: null, key: null };
  if (explicit === 'gemini') {
    if (!cfg.geminiKey) return { id: 'offline', model: null, key: null, note: 'No Gemini key yet — answered with Mausam Core.' };
    return { id: 'gemini', model: cfg.model || 'gemini-3.5-flash-lite', key: cfg.geminiKey };
  }
  if (explicit === 'zai') return { id: 'zai', model: null, key: null };

  // auto
  if (zaiAvailable === null) zaiAvailable = await probeZai();
  if (zaiAvailable) return { id: 'zai', model: null, key: null };
  if (cfg.geminiKey) return { id: 'gemini', model: cfg.model || 'gemini-3.5-flash-lite', key: cfg.geminiKey };
  return { id: 'offline', model: null, key: null };
}

export function providerBadge(res) {
  if (res.id === 'gemini') return `Gemini · ${res.model}`;
  if (res.id === 'zai') return 'Z.ai · preview';
  return 'Mausam Core · on-device';
}

/**
 * Run one chat turn.
 * @param {Object} ev {userText, history, getState, signal,
 *                     onText, onComponent, onFallback, onOpen, onDone, onError}
 */
export async function runChatTurn(ev) {
  const state = ev.getState?.() ?? {};
  let res;
  try {
    res = await resolveProvider(state);
  } catch {
    res = { id: 'offline', model: null, key: null };
  }

  const system = buildSystemPrompt(state);
  const parser = createStreamParser();
  const history = trimHistory(ev.history ?? []);

  ev.onOpen?.({ provider: res.id, badge: providerBadge(res), note: res.note });

  const handleEvents = (events) => {
    for (const e of events) {
      if (e.type === 'text') ev.onText?.(e.text);
      else if (e.type === 'component') ev.onComponent?.(e.payload);
      else if (e.type === 'fallback') ev.onFallback?.(e.raw, e.reason);
      else if (e.type === 'code') ev.onCode?.(e.text);
    }
  };
  const onText = (delta) => { if (delta) handleEvents(parser.push(delta)); };

  try {
    if (res.id === 'gemini') {
      await geminiChat({
        system, history, userText: ev.userText,
        apiKey: res.key, model: res.model,
        toolDecls: TOOL_DECLARATIONS,
        runTool: (name, args) => runTool(name, args, state),
        onText, signal: ev.signal,
      });
    } else if (res.id === 'zai') {
      await zaiChat({ system, history, userText: ev.userText, onText, signal: ev.signal });
    } else {
      await offlineChat({ userText: ev.userText, onText, signal: ev.signal, getState: ev.getState });
    }
    handleEvents(parser.end());
    ev.onDone?.({ provider: res.id, badge: providerBadge(res) });
  } catch (err) {
    if (err?.name === 'AbortError') {
      handleEvents(parser.end());
      ev.onDone?.({ provider: res.id, badge: providerBadge(res), aborted: true });
      return;
    }
    handleEvents(parser.end());
    const kind = err?.aiKind ?? 'unknown';
    let copy;
    if (res.id === 'gemini') copy = geminiErrorCopy(kind, res.model);
    else if (res.id === 'zai') copy = zaiErrorCopy(kind);
    else copy = offlineErrorCopy();
    ev.onError?.({
      kind,
      provider: res.id,
      title: copy.title,
      text: copy.text,
      raw: err?.message,
    });
  }
}

export { runTool };
