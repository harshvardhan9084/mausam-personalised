/**
 * gemini.js — Gemini provider: streams tokens via SSE and supports the
 * function-calling loop (tools → results → continue), all client-side.
 * The API key is the USER'S OWN, pasted in Settings and stored only in
 * this browser. Errors are typed so the chat UI can explain exactly what
 * to fix (bad key, unknown model, rate limit, network).
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TOTAL_TIMEOUT_MS = 60_000;
const MAX_TOOL_ROUNDS = 3;

/**
 * @param {Object} opts
 * @param {string} opts.system     system prompt
 * @param {Array}  opts.history    [{role:'user'|'model', text}]
 * @param {string} opts.userText   the new user message
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {Array}  opts.toolDecls  Gemini function declarations
 * @param {Function} opts.runTool  (name, args) => Promise<result>
 * @param {Function} opts.onText   (delta) => void
 * @param {AbortSignal} [opts.signal]
 */
export async function geminiChat(opts) {
  const {
    system, history = [], userText, apiKey, model,
    toolDecls = [], runTool, onText, signal,
  } = opts;

  if (!apiKey) {
    const err = new Error('No Gemini API key set.');
    err.aiKind = 'nokey';
    throw err;
  }

  const controller = new AbortController();
  const onOuter = () => controller.abort(new DOMException('Aborted', 'AbortError'));
  opts.signal?.addEventListener('abort', onOuter, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('AI request timed out', 'TimeoutError')), TOTAL_TIMEOUT_MS);

  const contents = [];
  for (const m of history) contents.push({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] });
  contents.push({ role: 'user', parts: [{ text: userText }] });

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { temperature: 0.5, maxOutputTokens: 1400, topP: 0.95 },
  };
  if (toolDecls.length) body.tools = [{ functionDeclarations: toolDecls }];

  let toolRounds = 0;
  let usedTools = [];

  try {
    while (true) {
      const res = await fetch(`${BASE}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        let msg = `Gemini API error ${res.status}`;
        let detail = '';
        try {
          const j = await res.json();
          detail = j?.error?.message ?? '';
          msg = detail || msg;
        } catch { /* body not JSON */ }
        const err = new Error(msg);
        err.aiKind = classifyHttp(res.status, msg);
        throw err;
      }
      if (!res.body) {
        const err = new Error('Gemini returned an empty stream.');
        err.aiKind = 'http';
        throw err;
      }

      // ---- read the SSE stream ----
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let sseBuf = '';
      let modelParts = [];
      let sawAnything = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = sseBuf.indexOf('\n')) >= 0) {
          const line = sseBuf.slice(0, nl).trim();
          sseBuf = sseBuf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const json = line.slice(5).trim();
          if (!json || json === '[DONE]') continue;
          let chunk;
          try { chunk = JSON.parse(json); } catch { continue; }
          if (chunk?.error) {
            const err = new Error(chunk.error.message ?? 'Gemini stream error');
            err.aiKind = classifyHttp(chunk.error.code ?? 0, chunk.error.message ?? '');
            throw err;
          }
          const cand = chunk?.candidates?.[0];
          const parts = cand?.content?.parts ?? [];
          for (const part of parts) {
            sawAnything = true;
            if (typeof part.text === 'string' && part.text) {
              onText(part.text);
              // keep in transcript
              const last = modelParts[modelParts.length - 1];
              if (last && last.text != null) last.text += part.text;
              else modelParts.push({ text: part.text });
            } else if (part.functionCall) {
              modelParts.push({ functionCall: part.functionCall });
            }
          }
        }
      }

      if (!sawAnything) {
        const err = new Error('Gemini responded with nothing — the prompt may have been blocked. Try rephrasing.');
        err.aiKind = 'empty';
        throw err;
      }

      // ---- tool loop ----
      const calls = modelParts.filter((p) => p.functionCall).map((p) => p.functionCall);
      if (!calls.length || toolRounds >= MAX_TOOL_ROUNDS || !runTool) {
        return { usedTools };
      }

      toolRounds++;
      body.contents.push({ role: 'model', parts: modelParts });
      const responses = [];
      for (const call of calls) {
        usedTools.push(call.name);
        const result = await runTool(call.name, call.args ?? {});
        responses.push({ functionResponse: { name: call.name, response: { result } } });
      }
      body.contents.push({ role: 'user', parts: responses });
      modelParts = [];
      onText(''); // signal continuation point
    }
  } catch (err) {
    if (err?.name === 'AbortError' && opts.signal?.aborted) throw err;
    if (err?.aiKind) throw err;
    if (err instanceof TypeError) {
      const e = new Error('Browser could not reach the Gemini API (network or extension blocking).');
      e.aiKind = 'network';
      throw e;
    }
    if (err?.name === 'TimeoutError') {
      const e = new Error('Gemini took too long to answer. Try again.');
      e.aiKind = 'timeout';
      throw e;
    }
    err.aiKind = err.aiKind ?? 'unknown';
    throw err;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onOuter);
  }
}

function classifyHttp(status, msg = '') {
  if (status === 400 && /API key not valid|API_KEY_INVALID/i.test(msg)) return 'badkey';
  if (status === 401 || status === 403) return 'badkey';
  if (status === 404) return 'model';
  if (status === 429) return 'ratelimit';
  if (status >= 500) return 'upstream';
  return 'http';
}

/** Human-friendly copy per error kind (used by chat UI). */
export function geminiErrorCopy(kind, model) {
  switch (kind) {
    case 'nokey': return { title: 'Gemini key needed', text: 'Add your free Gemini API key in Settings to chat with the full model — or keep using Mausam Core, which runs right here in your browser.' };
    case 'badkey': return { title: 'Gemini rejected the API key', text: 'Double-check the key in Settings (aistudio.google.com → Get API key). Keys activate a minute or two after creation.' };
    case 'model': return { title: `Model “${model}” not found`, text: 'Open Settings → AI model and pick another (e.g. gemini-3.5-flash, gemini-2.5-flash-lite).' };
    case 'ratelimit': return { title: 'Gemini rate limit hit', text: 'Too many requests right now — wait a few seconds and retry.' };
    case 'network': return { title: 'Network blocked the AI call', text: 'Could not reach generativelanguage.googleapis.com. Check connection, VPN or ad-blockers.' };
    case 'timeout': return { title: 'Gemini timed out', text: 'The model took too long. A retry usually fixes it.' };
    case 'upstream': return { title: 'Gemini is having a moment', text: 'Google-side error. Retry shortly.' };
    case 'empty': return { title: 'Empty response', text: 'The model returned no content — possibly safety-filtered. Try rephrasing.' };
    default: return { title: 'AI request failed', text: 'Something went wrong talking to Gemini.' };
  }
}
