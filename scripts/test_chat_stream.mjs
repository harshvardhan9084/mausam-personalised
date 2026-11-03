/**
 * test_chat_stream.mjs — the 11th suite: /api/chat/stream SSE contract.
 *
 * Spawns its own `node server.mjs` on a scratch port (real SDK, real
 * model), pins the v0.8.51 wire protocol, then tears everything down.
 * Honest-skip when the sandbox has no z-ai-web-dev-sdk (CI parity with
 * test_api_v4's live checks).
 *
 *   node scripts/test_chat_stream.mjs
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3113;
const BASE = `http://localhost:${PORT}`;

let passed = 0;
let failed = 0;
const ok = (cond, name) => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}`); }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHealth(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return await res.json();
    } catch { /* not up yet */ }
    await sleep(250);
  }
  return null;
}

/** Collect the whole SSE body, frame by frame. */
async function collectSSE(body) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const frames = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line.startsWith('data:')) frames.push(line.slice(5).trim());
    }
  }
  return frames;
}

const srv = spawn('node', [path.join(ROOT, 'server.mjs')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let srvLog = '';
srv.stdout.on('data', (d) => { srvLog += d; });
srv.stderr.on('data', (d) => { srvLog += d; });
srv.unref();

try {
  const health = await waitHealth();
  ok(Boolean(health?.ok), 'health: server up');

  if (!health || health.sdk !== 'ok') {
    console.log('-- z-ai-web-dev-sdk not available on this server: streaming suite honestly skipped --');
    console.log(`stream suite: ${passed} passed, ${failed} failed, SKIPPED (no sdk)`);
    process.exit(0);
  }

  /* ---- 1. the happy stream ---- */
  const res = await fetch(`${BASE}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Reply with exactly: mausam stream' }] }),
    signal: AbortSignal.timeout(45_000),
  });
  ok(res.ok, 'stream: 200 OK');
  ok((res.headers.get('content-type') ?? '').includes('text/event-stream'), 'stream: text/event-stream content type');

  const frames = await collectSSE(res.body);
  ok(frames.length >= 2, `stream: ${frames.length} data frames (>=2)`);
  const dones = frames.filter((f) => f === '[DONE]');
  ok(dones.length === 1, `stream: exactly one [DONE] (got ${dones.length})`);
  ok(frames[frames.length - 1] === '[DONE]', 'stream: [DONE] is the last frame');

  let text = '';
  let sawError = false;
  for (const f of frames) {
    if (f === '[DONE]') continue;
    try {
      const j = JSON.parse(f);
      if (j?.error) sawError = true;
      const d = j?.choices?.[0]?.delta?.content;
      if (typeof d === 'string') text += d;
    } catch { /* noise */ }
  }
  ok(!sawError, 'stream: no error frames');
  ok(text.trim().length > 0, `stream: deltas concatenate to "${text.trim().slice(0, 40)}"`);

  /* ---- 2. UTF-8 (Hinglish/Devanagari) survives byte passthrough ---- */
  const resHi = await fetch(`${BASE}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'मुझे बस इतना लिखो: नमस्ते मौसम' }] }),
    signal: AbortSignal.timeout(45_000),
  });
  const framesHi = await collectSSE(resHi.body);
  let textHi = '';
  for (const f of framesHi) {
    if (f === '[DONE]') continue;
    try {
      const d = JSON.parse(f)?.choices?.[0]?.delta?.content;
      if (typeof d === 'string') textHi += d;
    } catch { /* noise */ }
  }
  ok(/[\u0900-\u097F]/.test(textHi), `stream: Devanagari round-trips intact (${textHi.trim().slice(0, 24)})`);

  /* ---- 3. legacy one-shot endpoint still answers (back-compat) ---- */
  const legacy = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Reply with exactly: legacy ok' }] }),
    signal: AbortSignal.timeout(45_000),
  });
  const legacyBody = await legacy.json();
  ok(legacy.ok && typeof legacyBody?.text === 'string' && legacyBody.text.trim().length > 0, 'legacy /api/chat: still answers with text');

  /* ---- 4. validation contract shared with /api/chat ---- */
  const bad1 = await fetch(`${BASE}/api/chat/stream`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: 'not json',
  });
  ok(bad1.status === 400, 'stream: invalid JSON body → 400');
  const bad2 = await fetch(`${BASE}/api/chat/stream`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [] }),
  });
  ok(bad2.status === 400, 'stream: empty messages[] → 400');

  /* ---- 5. abort mid-stream: server survives cleanly ---- */
  const aborter = new AbortController();
  const resAbort = await fetch(`${BASE}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Count slowly from one to twenty.' }] }),
    signal: aborter.signal,
  });
  ok(resAbort.ok, 'abort: stream opened');
  const readerAbort = resAbort.body.getReader();
  await readerAbort.read().catch(() => {}); // first chunk
  aborter.abort(new DOMException('client hung up', 'AbortError'));
  await readerAbort.cancel().catch(() => {});
  await sleep(600);
  const after = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(4000) });
  ok(after.ok, 'abort: server healthy after client hangup');

  /* ---- 6. the legacy noendpoint fallback shape (client contract) ----
     The client (src/ai/zai.js) falls back to /api/chat on 404/405; a GET
     to the stream endpoint must be rejected by the static layer (405),
     never a silent HTML answer. */
  const wrongMethod = await fetch(`${BASE}/api/chat/stream`);
  ok(wrongMethod.status === 405, 'stream: GET rejected (405) → client fallback path is real');
} catch (err) {
  failed++;
  console.log('  ✗ suite error:', err?.message ?? err);
} finally {
  try { srv.kill('SIGKILL'); } catch { /* gone */ }
  await sleep(200);
}

console.log(`stream suite: ${passed} passed, ${failed} failed`);
if (srvLog.includes('SDK error')) console.log('  (server logged an SDK error — inspect if failures above)');
process.exit(failed ? 1 : 0);
