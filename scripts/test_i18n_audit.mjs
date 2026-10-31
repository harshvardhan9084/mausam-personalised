/**
 * i18n audit — finds keys whose Hindi translation is missing, and keys
 * referenced in code but absent from the dictionary (broken t() calls).
 * Dev tool: not part of the app shell.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync('src/core/i18n.js', 'utf8');
// extract dict block
const start = src.indexOf('const dict = {');
const end = src.indexOf('\n};', start);
const dictSrc = src.slice(start, end);

// parse entries:  key: ['English', 'हिंदी'],
const entries = [...dictSrc.matchAll(/^\s{2}([a-z0-9_]+):\s*\[((?:[^\][]|\\.)*)\]/gm)];
const dict = new Map();
for (const [, key, arr] of entries) {
  // extract quoted strings in order — single OR double quoted, backslash
  // escapes respected. v0.8.39 fix: the old matcher only knew '…', so any
  // EN text containing an apostrophe (double-quoted in the source: "What's
  // …") hid its hi pair from the audit and was falsely reported missing —
  // the audit itself lied about 5 perfectly translated keys (ask_rain7,
  // ask_commute, ask_tile_sm39, ask_tile_et0, ask_rain_plan).
  const parts = [...arr.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1] ?? m[2]);
  const en = parts[0] ?? null;
  const hi = parts[1] ?? null;
  dict.set(key, { en, hi });
}

const missingHi = [...dict.entries()].filter(([, v]) => v.en && !v.hi).map(([k]) => k);
console.log(`dict keys parsed: ${dict.size}`);
console.log(`missing hi: ${missingHi.length}${missingHi.length ? '\n  ' + missingHi.join('\n  ') : ''}`);

// find t('key') usages across src and compare with dict
// Comments are stripped first so doc-comment examples like
// `* Usage: t('foryou_commute', ...)` don't register as real usages.
function stripComments(src) {
  // block comments → same-length whitespace (line numbers preserved)
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  // line comments → truncate at the first // that sits outside a '...' string
  out = out.split('\n').map((line) => {
    let inStr = false, esc = false;
    for (let i = 0; i < line.length - 1; i++) {
      const c = line[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === "'") inStr = !inStr;
      if (!inStr && c === '/' && line[i + 1] === '/') return line.slice(0, i);
    }
    return line;
  }).join('\n');
  return out;
}
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.js')) yield p;
  }
}
const used = new Map();
for (const file of walk('src')) {
  const txt = stripComments(readFileSync(file, 'utf8'));
  // v0.8.27 — offline.js imports the dictionary as `tr` (its local `t` is the
  // temperature formatter), so both aliases count as dictionary usage.
  for (const m of txt.matchAll(/\btr?\(\s*'([a-z0-9_]+)'/g)) {
    used.set(m[1], file);
  }
}
const undefinedKeys = [...used.keys()].filter((k) => !dict.has(k));
console.log(`t() keys used: ${used.size}`);
console.log(`used but NOT in dict: ${undefinedKeys.length}${undefinedKeys.length ? '\n  ' + undefinedKeys.map((k) => `${k} (${used.get(k)})`).join('\n  ') : ''}`);
const unused = [...dict.keys()].filter((k) => !used.has(k));
console.log(`in dict but never used via t(): ${unused.length}`);
