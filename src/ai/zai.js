/**
 * zai.js — Z.ai provider, used inside the Z.ai web-dev preview.
 *
 * Talks to a same-origin /api/chat endpoint (see server.mjs at the repo
 * root) which proxies to the z-ai-web-dev-sdk — server-side only, no key
 * handling in the browser. Outside the preview (e.g. GitHub Pages) the
 * endpoint does not exist and probe() reports unavailable, so the client
 * falls back to Gemini-with-user-key or Mausam Core (offline engine).
 *
 * The endpoint returns the complete text in one shot; we simulate
 * streaming on the client so the renderer contract stays identical.
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
  const { system, history = [], userText, onText, signal } = opts;
  const controller = new AbortController();
  const onOuter = () => controller.abort(new DOMException('Aborted', 'AbortError'));
  opts.signal?.addEventListener('abort', onOuter, { once: true });
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
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      onText(tokens.slice(i, i + CHUNK).join(''));
      await new Promise((r) => setTimeout(r, 22));
    }
    return { usedTools: [] };
  } catch (err) {
    if (err?.name === 'AbortError' && opts.signal?.aborted) throw err;
    if (err instanceof TypeError) {
      const e = new Error('Could not reach the preview AI endpoint.');
      e.aiKind = 'network';
      throw e;
    }
    err.aiKind = err.aiKind ?? 'unknown';
    throw err;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onOuter);
  }
}

export function zaiErrorCopy(kind) {
  switch (kind) {
    case 'noserver': return { title: 'Preview AI not running', text: 'This server has no /api/chat. Start `node server.mjs` in the repo root to enable the Z.ai provider.' };
    case 'network': return { title: 'Preview AI unreachable', text: 'The /api/chat endpoint did not respond.' };
    default: return { title: 'Z.ai request failed', text: 'The preview model could not answer right now.' };
  }
}
