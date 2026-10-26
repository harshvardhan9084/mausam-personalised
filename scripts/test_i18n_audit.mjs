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
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.js')) yield p;
  }
}
const used = new Map();
for (const file of walk('src')) {
  const txt = readFileSync(file, 'utf8');
  for (const m of txt.matchAll(/\bt\(\s*'([a-z0-9_]+)'/g)) {
    used.set(m[1], file);
  }
}
const undefinedKeys = [...used.keys()].filter((k) => !dict.has(k));
console.log(`t() keys used: ${used.size}`);
console.log(`used but NOT in dict: ${undefinedKeys.length}${undefinedKeys.length ? '\n  ' + undefinedKeys.map((k) => `${k} (${used.get(k)})`).join('\n  ') : ''}`);
const unused = [...dict.keys()].filter((k) => !used.has(k));
console.log(`in dict but never used via t(): ${unused.length}`);
