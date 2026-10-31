#!/usr/bin/env node
/**
 * refresh-snapshot.mjs — the ground-truth courier (v0.8.44).
 *
 * WHY THIS EXISTS: the app is a static PWA on GitHub Pages. Browser calls
 * to OpenAQ die at the CORS preflight (their gateway answers OPTIONS with
 * 401), FIRMS sends no CORS headers at all, and every public CORS relay
 * is key-walled or rate-limited. So the baked keys could never reach the
 * page from a static host — Settings showed honest grey dots while the
 * data sat one unreachable hop away. The fix is a courier: a scheduled
 * GitHub Action runs THIS script server-to-server (no CORS, no browser)
 * and commits a small snapshot the app then fetches SAME-ORIGIN —
 * /data/openaq-ncr.json and /data/firms-ncr.json. No relay, no key in
 * any browser request, works identically in dev (server.mjs serves the
 * repo root statically).
 *
 * SNAPSHOT SHAPE mirrors the v3 API responses on purpose: locations carry
 * their sensors array, each location carries its /latest results rows —
 * so src/api/openaq.js and src/api/firms.js reuse their existing parsing
 * and freshness gates unchanged (pickFreshSensors / parseFirmsCsv).
 *
 * SCHEDULE: hourly via .github/workflows/snapshot.yml (also
 * workflow_dispatch for manual runs). Locally: node scripts/refresh-snapshot.mjs
 *
 * NEVER FAILS THE WORKFLOW: a source that errors keeps its previous
 * snapshot file on disk and logs; the client's own freshness gates
 * (≤3 h monitor, ≤4 h sensor) keep stale snapshots honest.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BUNDLED_KEYS } from '../src/api/keys.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'data');

const OQ_BASE = 'https://api.openaq.org/v3';
const FIRMS_BASE = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';

/* NCR box: Delhi + Gurugram + Noida + Ghaziabad + Faridabad + Hapur +
 * Meerut — the region the demo serves. Kept tight so the VIIRS CSV stays
 * small even in peak stubble season. */
const BOX = { w: 76.8, s: 27.6, e: 78.6, n: 29.3 };
const MONITOR_CAP = 60;       // freshest N monitors (paced fetch stays < free tier)
const PACE_MS = 1100;         // OpenAQ free tier: 60 req/min
const HOTSPOT_CAP = 20000;    // sanity ceiling on CSV rows packed

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ---------------- pure packers (exported for tests) ---------------- */

/**
 * Rank monitors freshest-first (dead/2018 payloads sink) and keep the
 * newest `cap`. Locations without coordinates or isMonitor=false drop.
 */
export function pickMonitors(results, now = Date.now(), cap = MONITOR_CAP) {
  const rows = (Array.isArray(results) ? results : []).filter(
    (r) => r?.isMonitor
      && r?.coordinates
      && Number.isFinite(r.coordinates?.latitude)
      && Number.isFinite(r.coordinates?.longitude),
  );
  const age = (r) => {
    const t = Date.parse(r?.datetimeLast?.utc ?? '');
    return Number.isFinite(t) ? now - t : Number.POSITIVE_INFINITY;
  };
  return rows.sort((a, b) => age(a) - age(b)).slice(0, cap);
}

/** Locations + their /latest rows → the snapshot the client unpacks. */
export function packOpenaqSnapshot(monitors, latestById, now = new Date(), bbox = BOX) {
  return {
    generatedAt: now.toISOString(),
    source: 'openaq-snapshot',
    bbox,
    locations: (Array.isArray(monitors) ? monitors : []).map((loc) => ({
      id: loc.id,
      name: loc.name,
      isMonitor: true,
      coordinates: loc.coordinates,
      provider: loc.provider ? { name: loc.provider.name } : undefined,
      owner: loc.owner ? { name: loc.owner.name } : undefined,
      datetimeLast: loc.datetimeLast,
      sensors: (loc.sensors ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        parameter: s.parameter ? { name: s.parameter.name, units: s.parameter.units } : undefined,
      })),
      latest: latestById?.get?.(loc.id) ?? [],
    })),
  };
}

/** FIRMS area/csv text → the snapshot the client parses. */
export function packFirmsSnapshot(csvText, now = new Date(), bbox = BOX) {
  const lines = String(csvText ?? '').trim().split('\n');
  const rows = Math.max(0, lines.length - 1);
  return {
    generatedAt: now.toISOString(),
    source: 'firms-snapshot',
    bbox,
    csv: rows > HOTSPOT_CAP ? [lines[0], ...lines.slice(1, HOTSPOT_CAP + 1)].join('\n') : String(csvText ?? ''),
  };
}

/* ---------------- courier ---------------- */

async function courierOpenAQ(now) {
  const auth = { 'X-API-Key': BUNDLED_KEYS.openaq };
  const q = `bbox=${BOX.w},${BOX.s},${BOX.e},${BOX.n}&limit=1000`;
  const locs = await getJSON(`${OQ_BASE}/locations?${q}`, auth);
  const monitors = pickMonitors(locs?.results, now.getTime());
  const latestById = new Map();
  for (const m of monitors) {
    try {
      const latest = await getJSON(`${OQ_BASE}/locations/${m.id}/latest`, auth);
      latestById.set(m.id, latest?.results ?? []);
    } catch { /* one dead monitor never kills the courier */ }
    await sleep(PACE_MS);
  }
  const snap = packOpenaqSnapshot(monitors, latestById, now);
  const file = path.join(OUT_DIR, 'openaq-ncr.json');
  await writeFile(file, JSON.stringify(snap));
  const kb = (JSON.stringify(snap).length / 1024).toFixed(0);
  console.log(`openaq: ${monitors.length} monitors packed → data/openaq-ncr.json (${kb} KB)`);
}

async function courierFIRMS(now) {
  const bbox = `${BOX.w},${BOX.s},${BOX.e},${BOX.n}`;
  const url = `${FIRMS_BASE}/${BUNDLED_KEYS.firms}/VIIRS_SNPP_NRT/${bbox}/2`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const csv = await res.text();
  if (/^Invalid/i.test(csv.trim())) throw new Error('FIRMS rejected the MAP_KEY');
  const snap = packFirmsSnapshot(csv, now);
  const file = path.join(OUT_DIR, 'firms-ncr.json');
  await writeFile(file, JSON.stringify(snap));
  const kb = (JSON.stringify(snap).length / 1024).toFixed(0);
  const n = Math.max(0, csv.trim().split('\n').length - 1);
  console.log(`firms: ${n} hotspots packed → data/firms-ncr.json (${kb} KB)`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const now = new Date();
  let ok = 0;
  try { await courierOpenAQ(now); ok++; }
  catch (err) { console.error('openaq snapshot failed (previous file kept):', String(err?.message ?? err)); }
  try { await courierFIRMS(now); ok++; }
  catch (err) { console.error('firms snapshot failed (previous file kept):', String(err?.message ?? err)); }
  console.log(`courier done (${ok}/2 sources)`);
  process.exitCode = 0; // a failed source must not fail the workflow
}

/* Run only when executed directly — tests import the pure packers. */
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
