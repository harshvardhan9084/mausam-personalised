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
import { offlineChat, offlineErrorCopy, isVerifyQuestion, verifyCardFence } from './offline.js';
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

  /* v0.8.43 "every provider draws the ledger" — remember what the stream
     drew and whether the witnesses were asked for, so the auto-ledger can
     fill a missing verification card without ever doubling one. */
  let sawVerifyCard = false;
  let verifyToolCalled = false;
  const handleEvents = (events) => {
    for (const e of events) {
      if (e.type === 'text') ev.onText?.(e.text);
      else if (e.type === 'component') {
        if (e.payload?.c === 'verify-card') sawVerifyCard = true;
        ev.onComponent?.(e.payload);
      }
      else if (e.type === 'fallback') ev.onFallback?.(e.raw, e.reason);
      else if (e.type === 'code') ev.onCode?.(e.text);
    }
  };
  const onText = (delta) => { if (delta) handleEvents(parser.push(delta)); };

  /* The auto-ledger: when the turn was ABOUT verification — the model
     called verify_numbers, or on the tool-less Z.ai preview path the
     question itself is verify-intent — and the stream drew no
     verify-card of its own, push the SAME ledger the offline engine and
     the board show, through the SAME parser path (validated, askable,
     board grammar). Prose stays the model's own; the evidence is the
     app's. No witness spoke → no card, never an empty ledger. Runs only
     on the success path — an aborted turn stays cut. */
  const autoVerifyLedger = () => {
    if (sawVerifyCard) return;
    const asked = verifyToolCalled || (res.id === 'zai' && isVerifyQuestion(ev.userText));
    if (!asked) return;
    const fence = verifyCardFence(state);
    if (!fence) return;
    onText(fence);
    handleEvents(parser.end());
  };

  try {
    if (res.id === 'gemini') {
      await geminiChat({
        system, history, userText: ev.userText,
        apiKey: res.key, model: res.model,
        toolDecls: TOOL_DECLARATIONS,
        runTool: async (name, args) => {
          const r = await runTool(name, args, state);
          /* v0.8.43 — a verify_numbers call means the turn is about
             evidence; if the model forgets to draw the fence, the
             auto-ledger below still shows the witnesses. */
          if (name === 'verify_numbers' && r && !r.error) verifyToolCalled = true;
          return r;
        },
        onText, signal: ev.signal,
      });
    } else if (res.id === 'zai') {
      await zaiChat({ system, history, userText: ev.userText, onText, signal: ev.signal });
    } else {
      await offlineChat({ userText: ev.userText, onText, signal: ev.signal, getState: ev.getState });
    }
    handleEvents(parser.end());
    autoVerifyLedger();
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
