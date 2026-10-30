/**
 * server.mjs — Mausam preview/dev server.
 *
 * Serves the static app (same as GitHub Pages would) AND exposes
 * /api/chat + /api/health, which proxy to the z-ai-web-dev-sdk
 * (backend-only SDK). This is how the app uses "our own AI SDK" inside
 * the Z.ai web-dev preview. On GitHub Pages these endpoints simply do
 * not exist and the client falls back to Gemini-with-user-key or the
 * on-device Mausam Core engine.
 *
 *   node server.mjs            → http://localhost:3000
 *   PORT=8080 node server.mjs
 *
 * z-ai-web-dev-sdk is optional: install it in the workspace root
 * (npm i z-ai-web-dev-sdk) to enable the AI endpoint; without it the
 * static site still serves fine and /api/health reports sdk:false.
 */

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoResponse } from './scripts/geo_fixture.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = Number(process.env.PORT ?? 3000);
const FX = process.env.FX === '1'; // dev-only: mock Open-Meteo with local fixtures
const FX_DIR = process.env.FX_DIR ?? '/home/z/my-project/scripts/fixtures_v3';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

/* ---------------- optional Z.ai SDK ---------------- */

let zaiInstance = null;
let sdkState = 'unknown'; // 'ok' | 'missing' | 'error' | 'unknown'

async function getZai() {
  if (zaiInstance) return zaiInstance;
  const mod = await import('z-ai-web-dev-sdk');
  const ZAI = mod.default ?? mod;
  zaiInstance = await ZAI.create();
  sdkState = 'ok';
  return zaiInstance;
}

try {
  await import('z-ai-web-dev-sdk');
  sdkState = 'ok';
} catch (err) {
  sdkState = err?.code === 'MODULE_NOT_FOUND' ? 'missing' : 'error';
}

/* ---------------- helpers ---------------- */

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function readBody(req, limit = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const rel = decoded.replace(/^\/+/, '');
  const full = path.resolve(root, rel || 'index.html');
  if (!full.startsWith(path.resolve(root))) return null;
  return full;
}

/* ---------------- /api/chat ---------------- */

async function handleChat(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    return sendJSON(res, 400, { error: 'Invalid JSON body.' });
  }

  const { system, messages } = payload ?? {};
  if (!Array.isArray(messages) || !messages.length) {
    return sendJSON(res, 400, { error: 'messages[] required.' });
  }

  let zai;
  try {
    zai = await getZai();
  } catch (err) {
    sdkState = 'missing';
    return sendJSON(res, 503, {
      error: 'z-ai-web-dev-sdk is not available on this server. Run: npm install z-ai-web-dev-sdk',
      detail: String(err?.message ?? err).slice(0, 200),
    });
  }

  const zaiMessages = [];
  if (system) zaiMessages.push({ role: 'assistant', content: system });
  for (const m of messages) {
    if (m && typeof m.content === 'string' && m.content.trim()) {
      zaiMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content.slice(0, 24000) });
    }
  }

  try {
    const completion = await zai.chat.completions.create({
      messages: zaiMessages,
      thinking: { type: 'disabled' },
    });
    const text = completion?.choices?.[0]?.message?.content ?? '';
    sendJSON(res, 200, { text, provider: 'zai' });
  } catch (err) {
    console.error('[api/chat] SDK error:', err?.message ?? err);
    sendJSON(res, 502, { error: 'The Z.ai model could not answer right now.', detail: String(err?.message ?? err).slice(0, 200) });
  }
}

/* ---------------- server ---------------- */

const FX_PATCH = `/* dev-only fetch patch: redirect Open-Meteo hosts to local fixtures */
(function () {
  const map = [
    [/api\\.open-meteo\\.com\\/v1\\/forecast/, '/fx/forecast.json'],
    [/air-quality-api\\.open-meteo\\.com/, '/fx/air.json'],
    [/geocoding-api\\.open-meteo\\.com/, '/fx/geo.json'],
  ];
  const of = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : input?.url ?? '';
      for (const [rx, to] of map) {
        if (!rx.test(url)) continue;
        // v0.8.28: forward the query string so the query-aware geo fixture
        // can shape its response (name/language) like the real geocoder.
        const qs = url.includes('?') ? url.slice(url.indexOf('?')) : '';
        return of(to + qs, init);
      }
    } catch { /* fall through */ }
    return of(input, init);
  };
})();
`;

const server = http.createServer(async (req, res) => {
  // v0.8.28: split off the query string — the /fx/geo.json fixture is
  // query-aware now, and path matching/routing must never see the params.
  const urlPath = (req.url ?? '/').split('?')[0];

  // ---- dev fixtures ----
  if (FX && urlPath.startsWith('/fx/')) {
    if (urlPath === '/fx/patch.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(FX_PATCH);
    }
    const name = urlPath.replace('/fx/', '').replace(/[^a-z._-]/g, '');
    try {
      // v0.8.28: the geo fixture is query-aware — shaped by geoResponse()
      // from the request's name/language params (Devanagari queries match,
      // hi returns Hindi names, unknown queries return the empty shape).
      if (name === 'geo.json') {
        const q = new URL(req.url ?? '/', 'http://x').searchParams;
        if (q.has('name')) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          return res.end(JSON.stringify(geoResponse(q)));
        }
      }
      const data = await fs.readFile(path.join(FX_DIR, name));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(data);
    } catch {
      return sendJSON(res, 404, { error: `fixture ${name} not found (FX_DIR=${FX_DIR})` });
    }
  }

  // CORS preflight (harmless, dev-friendly)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // ---- AI endpoints ----
  if (urlPath === '/api/health') {
    return sendJSON(res, 200, { ok: true, provider: 'zai', sdk: sdkState, name: 'mausam-preview' });
  }
  if (urlPath === '/api/chat' && req.method === 'POST') {
    return handleChat(req, res);
  }

  // ---- static files ----
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end('Method Not Allowed');
    return;
  }

  let file = safeJoin(ROOT, urlPath);
  if (!file) { res.writeHead(403).end('Forbidden'); return; }

  try {
    let stat = await fs.stat(file);
    if (stat.isDirectory()) {
      file = path.join(file, 'index.html');
      stat = await fs.stat(file);
    }
    const ext = path.extname(file).toLowerCase();
    let data = await fs.readFile(file);
    // Dev fixture mode: inject the fetch patcher before any module script.
    if (FX && ext === '.html') {
      let html = data.toString('utf8');
      html = html.replace('<script>', '<script src="/fx/patch.js"></script>\n  <script>');
      data = Buffer.from(html);
    }
    const mime = MIME[ext] ?? 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': data.length,
      // In dev/preview, no-store keeps the preview fresh after each push.
      'Cache-Control': process.env.NODE_ENV === 'production' ? 'public, max-age=300' : 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    // SPA-ish fallback → index.html
    try {
      const data = await fs.readFile(path.join(ROOT, 'index.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
      res.end(data);
    } catch {
      res.writeHead(404).end('Not found');
    }
  }
});

server.listen(PORT, () => {
  console.log(`☁️  Mausam preview server → http://localhost:${PORT}${FX ? '  [FX fixture mode]' : ''}`);
  console.log(`   /api/health → sdk: ${sdkState} ${sdkState === 'ok' ? '(Z.ai chat enabled)' : '(run: npm i z-ai-web-dev-sdk)'}`);
});
