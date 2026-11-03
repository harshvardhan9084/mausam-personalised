/**
 * zai.js — Z.ai provider, used inside the Z.ai web-dev preview.
 *
 * Talks to same-origin /api/chat endpoints (see server.mjs at the repo
 * root) which proxy to the z-ai-web-dev-sdk — server-side only, no key
 * handling in the browser. Outside the preview (e.g. GitHub Pages) the
 * endpoint does not exist and probe() reports unavailable, so the client
 * falls back to Gemini-with-user-key or Mausam Core (offline engine).
 *
 * v0.8.51 "the stream is real": the preferred endpoint is POST
 * /api/chat/stream — Server-Sent Events whose frames are the SDK's own
 * OpenAI-style deltas, forwarded as the model speaks. Tokens are paced
 * by the model, not by a client timer. Any server that predates the
 * endpoint (404/405) or answers with a non-event-stream body falls back
 * to the legacy one-shot /api/chat + client-side reveal below.
 */

const PROBE_TIMEOUT_MS = 2500;
const CHAT_TIMEOUT_MS = 45_000;

/** @returns {Promise<boolean>} whether /api/chat is available here */
export async function probeZai() {
  if (['localhost', '127.0.0.1', '0.0.0.0'].includes(location.hostname) === false &&
      !/\.space-z\.ai$/.test(location.hostname) &&
      !/preview-/.test(location.hostname)) {
    return false; // GitHub Pages & friends: never probe
  }
  if (location.protocol === 'file:') return false;
  try {
    const ctl = AbortSignal.timeout(PROBE_TIMEOUT_MS);
    const res = await fetch('api/health', { signal: ctl });
    if (!res.ok) return false;
    const j = await res.json();
    return Boolean(j?.ok);
  } catch {
    return false;
  }
}

/**
 * @param {Object} opts {system, history, userText, onText, signal}
 */
export async function zaiChat(opts) {
  try {
    return await zaiChatStream(opts);
  } catch (err) {
    /* Legacy/unknown servers answer 404/405 (their POST catch-all) — fall
       back to the one-shot path. Real failures (http/empty/timeout) must
       surface, not retry. */
    if (err?.aiKind === 'noendpoint') return zaiChatLegacy(opts);
    throw err;
  }
}

/* ---------------- real streaming (v0.8.51) ---------------- */

async function zaiChatStream({ system, history = [], userText, onText, signal }) {
  const controller = new AbortController();
  const onOuter = () => controller.abort(new DOMException('Aborted', 'AbortError'));
  signal?.addEventListener('abort', onOuter, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('AI request timed out', 'TimeoutError')), CHAT_TIMEOUT_MS);

  try {
    const res = await fetch('api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system,
        messages: [...history.map((m) => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text })), { role: 'user', content: userText }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      /* 404/405: an older preview server without the stream endpoint
         (its POST catch-all says 405). 503: SDK missing. Everything
         else is a real failure. */
      if (res.status === 404 || res.status === 405 || res.status === 501) {
        const e = new Error('no stream endpoint');
        e.aiKind = 'noendpoint';
        throw e;
      }
      let detail = '';
      try { detail = (await res.json())?.error ?? ''; } catch { /* not json */ }
      const err = new Error(detail || `Z.ai endpoint error ${res.status}`);
      err.aiKind = res.status === 503 ? 'noserver' : 'http';
      throw err;
    }
    if (!res.body || !(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
      // friendly server answered something else — use the legacy path
      const e = new Error('no stream endpoint');
      e.aiKind = 'noendpoint';
      throw e;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        if (payload === '[DONE]') {
          if (!text.trim()) {
            const err = new Error('The Z.ai model returned an empty answer.');
            err.aiKind = 'empty';
            throw err;
          }
          return { usedTools: [] };
        }
        let frame;
        try { frame = JSON.parse(payload); } catch { continue; /* keep-alive noise */ }
        if (frame?.error) {
          const err = new Error(String(frame.error).slice(0, 200));
          err.aiKind = 'http';
          throw err;
        }
        const delta = frame?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          text += delta;
          if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
          onText(delta);
        }
      }
    }

    /* Stream closed without [DONE] — accept what arrived if it speaks. */
    if (!text.trim()) {
      const err = new Error('The Z.ai model returned an empty answer.');
      err.aiKind = 'empty';
      throw err;
    }
    return { usedTools: [] };
  } catch (err) {
    if (err?.name === 'AbortError' && signal?.aborted) throw err;
    if (err instanceof TypeError) {
      const e = new Error('Could not reach the preview AI endpoint.');
      e.aiKind = 'network';
      throw e;
    }
    err.aiKind = err.aiKind ?? 'unknown';
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuter);
  }
}

/* ---------------- legacy one-shot path (pre-v0.8.51 servers) ---------------- */

async function zaiChatLegacy({ system, history = [], userText, onText, signal }) {
  const controller = new AbortController();
  const onOuter = () => controller.abort(new DOMException('Aborted', 'AbortError'));
  signal?.addEventListener('abort', onOuter, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('AI request timed out', 'TimeoutError')), CHAT_TIMEOUT_MS);

  try {
    const res = await fetch('api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system,
        messages: [...history.map((m) => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text })), { role: 'user', content: userText }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.error ?? ''; } catch { /* not json */ }
      const err = new Error(detail || `Z.ai endpoint error ${res.status}`);
      err.aiKind = res.status === 503 ? 'noserver' : 'http';
      throw err;
    }
    const data = await res.json();
    const text = String(data?.text ?? '');
    if (!text.trim()) {
      const err = new Error('The Z.ai model returned an empty answer.');
      err.aiKind = 'empty';
      throw err;
    }

    // Simulated streaming — keeps the render pipeline identical to Gemini.
    const tokens = text.match(/\S+\s*/g) ?? [text];
    const CHUNK = 3;
    for (let i = 0; i < tokens.length; i += CHUNK) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      onText(tokens.slice(i, i + CHUNK).join(''));
      await new Promise((r) => setTimeout(r, 22));
    }
    return { usedTools: [] };
  } catch (err) {
    if (err?.name === 'AbortError' && signal?.aborted) throw err;
    if (err instanceof TypeError) {
      const e = new Error('Could not reach the preview AI endpoint.');
      e.aiKind = 'network';
      throw e;
    }
    err.aiKind = err.aiKind ?? 'unknown';
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuter);
  }
}

export function zaiErrorCopy(kind) {
  switch (kind) {
    case 'noserver': return { title: 'Preview AI not running', text: 'This server has no /api/chat. Start `node server.mjs` in the repo root to enable the Z.ai provider.' };
    case 'network': return { title: 'Preview AI unreachable', text: 'The /api/chat endpoint did not respond.' };
    default: return { title: 'Z.ai request failed', text: 'The preview model could not answer right now.' };
  }
}
