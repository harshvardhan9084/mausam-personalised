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
  // split top-level comma (strings contain no commas-then-quote edge; use a light split)
  const parts = arr.match(/(?:'[^']*')/g) ?? [];
  const en = parts[0]?.slice(1, -1) ?? null;
  const hi = parts[1]?.slice(1, -1) ?? null;
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
