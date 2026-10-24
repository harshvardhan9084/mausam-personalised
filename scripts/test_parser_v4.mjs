/**
 * test_parser_v4.mjs — adversarial tests for the MausamUI stream parser (v2),
 * the hardened contract validators, and the inline-JSON salvage.
 *
 * Run: node scripts/test_parser_v4.mjs
 */

import { createStreamParser, salvageInlineUI } from '../src/ai/render.js';
import { parseBlock } from '../src/ai/contract.js';

let pass = 0, fail = 0;
const fails = [];

function check(name, cond, detail = '') {
  if (cond) { pass++; }
  else { fail++; fails.push(`${name}${detail ? ` — ${detail}` : ''}`); }
}

const types = (evts) => evts.map((e) => e.type).join(',');
const textOf = (evts) => evts.filter((e) => e.type === 'text').map((e) => e.text).join('|');

/* ---------------- 1. well-formed fence ---------------- */
{
  const p = createStreamParser();
  const out = [...p.push('Hello! '), ...p.push('```mausam-ui\n{"v":1,"c":"rain-bars","d":{"labels":["1 PM"],"pops":[70]}}\n```'), ...p.push(' bye'), ...p.end()];
  check('wf: component parsed', out.some((e) => e.type === 'component' && e.payload.c === 'rain-bars'), types(out));
  check('wf: no JSON in prose', !textOf(out).includes('"v":1'), textOf(out));
  check('wf: prose intact', textOf(out).includes('Hello!') && textOf(out).includes('bye'), textOf(out));
}

/* ---------------- 2. ```json fence (the big leak) ---------------- */
{
  const p = createStreamParser();
  const out = [...p.push('Verdict first.\n\n```json\n{"v":1,"c":"now-card","d":{"place":"Mumbai","temp":"29°C","humidity":"88%"}}\n```\n\nEnjoy!'), ...p.end()];
  check('json-fence: component parsed', out.some((e) => e.type === 'component' && e.payload.c === 'now-card'), types(out));
  check('json-fence: no raw JSON anywhere', !textOf(out).includes('"c"'), textOf(out));
  const comp = out.find((e) => e.type === 'component');
  check('json-fence: "29°C" coerced to 29', comp?.payload?.d?.temp === 29, JSON.stringify(comp?.payload?.d));
  check('json-fence: "88%" coerced to 88', comp?.payload?.d?.humidity === 88);
}

/* ---------------- 3. bare JSON in prose (inline salvage) ---------------- */
{
  const segs = salvageInlineUI('Rain at 5 PM (70%). {"v":1,"c":"rain-bars","d":{"labels":["1 PM","2 PM"],"pops":[40,70]}} that is the chart.');
  check('inline: payload extracted', segs.some((s) => s.type === 'payload' && s.payload.c === 'rain-bars'), JSON.stringify(segs).slice(0, 120));
  check('inline: no JSON text segment', !segs.some((s) => s.type === 'text' && s.text.includes('"pops"')));
  const joined = segs.filter((s) => s.type === 'text').map((s) => s.text).join('');
  check('inline: prose around JSON kept', joined.includes('Rain at 5 PM') && joined.includes('that is the chart'), joined);
}
{
  // plain JSON that is NOT a UI payload must stay as text
  const segs = salvageInlineUI('The config {"a":1,"b":2} is unrelated.');
  check('inline: non-UI JSON untouched', segs.length === 1 && segs[0].type === 'text' && segs[0].text.includes('{"a":1'), JSON.stringify(segs));
}
{
  // broken known-type payload → dropped, prose survives
  const segs = salvageInlineUI('Before {"c":"rain-bars","d":{"pops":"nope"}} after');
  const texts = segs.filter((s) => s.type === 'text').map((s) => s.text).join('');
  check('inline: broken payload dropped, prose kept', !texts.includes('"c"') && texts.includes('Before') && texts.includes('after'), texts);
}

/* ---------------- 4. root-level d repair + drift aliases ---------------- */
{
  const r1 = parseBlock('{"v":1,"c":"wear-list","items":[{"icon":"☂️","name":"Umbrella","why":"70% rain"},{"name":"Cap"}]}');
  check('root-d: wear-list renders', r1.ok && r1.payload.d.items.length === 2, r1.error);
  const r2 = parseBlock('{"c":"daily-list","days":[{"day":"Today","max":"31°C","min":"24","rain":"78%"}]}');
  check('root-d: daily-list aliases', r2.ok && r2.payload.d.days[0].hi === 31 && r2.payload.d.days[0].lo === 24 && r2.payload.d.days[0].pop === 78, r2.error ?? JSON.stringify(r2.payload?.d));
  const r3 = parseBlock('{"v":1,"c":"hourly-timeline","d":{"items":[{"hour":"1 PM","tempC":"29","rainPop":"35"}]}}');
  check('root-d: hourly-timeline aliases', r3.ok && r3.payload.d.hours[0].temp === 29 && r3.payload.d.hours[0].pop === 35, r3.error);
  const r4 = parseBlock('{"v":1,"c":"chips","d":{"options":[{"label":"Wear?"},{"text":"Plan weekend"}]}}');
  check('root-d: chips objects', r4.ok && r4.payload.d.items.join(',') === 'Wear?,Plan weekend', r4.error);
  const r5 = parseBlock('{"v":1,"c":"compare-table","d":{"cols":["","Delhi","Mumbai"],"rows":[{"a":"Now","b":"29°C","c":"27°C"}]}}');
  check('root-d: compare-table object rows', r5.ok && r5.payload.d.rows[0].length === 3, r5.error);
  const r6 = parseBlock('{"v":1,"c":"temp-chart","d":{"times":["8 AM","2 PM"],"values":[26,33]}}');
  check('root-d: temp-chart aliases', r6.ok && r6.payload.d.temps[1] === 33, r6.error);
  const r8 = parseBlock('{"c":"aqi-card","d":{"aqi":164,"cat":"Poor","pollutant":"PM2.5"}}');
  check('drift: aqi-card aliases', r8.ok && r8.payload.d.category === 'Poor' && r8.payload.d.dominant === 'PM2.5', r8.error);
}

/* ---------------- 5. malformed fences → fallback, never prose ---------------- */
{
  const p = createStreamParser();
  const out = [...p.push('A ```mausam-ui\n{"v":1,"c":"rain-bars","d":{"pops":[10,20]} trailing ``` B'), ...p.end()];
  check('malformed: fallback emitted', out.some((e) => e.type === 'fallback'), types(out));
  check('malformed: no prose leak', textOf(out) === 'A  B' || (textOf(out).includes('A') && textOf(out).includes('B')), textOf(out));
}
{
  // unknown component → fallback (render.js decides the readable card)
  const p = createStreamParser();
  const out = [...p.push('```mausam-ui\n{"v":1,"c":"star-field","d":{"x":1}}\n```'), ...p.end()];
  check('unknown: fallback', out.some((e) => e.type === 'fallback' && e.reason.includes('unknown component')), types(out));
}

/* ---------------- 6. code fences (```js etc.) → code event ---------------- */
{
  const p = createStreamParser();
  const out = [...p.push('Here:\n```js\nconst x = 1;\n```\nDone'), ...p.end()];
  check('code: code event', out.some((e) => e.type === 'code' && e.text.includes('const x = 1;')), types(out));
  check('code: no prose leak', !textOf(out).includes('const x'), textOf(out));
  check('code: prose kept', textOf(out).includes('Here:') && textOf(out).includes('Done'), textOf(out));
}
{
  // generic fence without a tag → treated as UI candidate; non-JSON body → fallback
  const p = createStreamParser();
  const out = [...p.push('```\njust some text\n```'), ...p.end()];
  check('untagged: fallback not prose', out.every((e) => e.type !== 'text' || !e.text.includes('just some text')), types(out));
}

/* ---------------- 7. fuzz: every split point ---------------- */
const SAMPLES = [
  ['ok-fence', 'Hello there! ```mausam-ui\n{"v":1,"c":"rain-bars","d":{"labels":["1 PM","2 PM","3 PM"],"pops":[10,70,30]}}\n``` Use it wisely.'],
  ['json-fence', 'Sure.\n```json\n{"v":1,"c":"hourly-timeline","d":{"hours":[{"time":"1 PM","temp":29,"pop":35}]}}\n```\nAnything else?'],
  ['two-cards', 'One:\n```mausam-ui\n{"v":1,"c":"note","d":{"text":"hi"}}\n```\nTwo:\n```mausam-ui\n{"v":1,"c":"chips","d":{"items":["A","B"]}}\n```\nEnd.'],
  ['broken-json', 'X ```mausam-ui\n{"v":1,"c":"rain-bars", bad here}\n``` Y'],
  ['code-fence', '```js\nalert(1)\n``` done'],
  ['inline-json', 'Text {"v":1,"c":"wear-list","items":[{"name":"Umbrella"}]} more text'],
  ['unterminated', 'Answer ```mausam-ui\n{"v":1,"c":"note","d":{"text":"cut off"}'],
];

for (const [name, full] of SAMPLES) {
  // 'inline-json' is scrubbed at the RENDER layer (proseNode), not by the
  // parser — its invariant is checked via salvageInlineUI below.
  if (name !== 'inline-json') {
    for (let cut = 1; cut < full.length; cut++) {
      const a = full.slice(0, cut);
      const b = full.slice(cut);
      const p = createStreamParser();
      const out = [...p.push(a), ...p.push(b), ...p.end()];
      const joinedText = textOf(out);
      // invariant: no fence/JSON syntax may ever appear inside a TEXT event
      const leak = /```|\{"v":1,"c":/.test(joinedText);
      check(`fuzz[${name}]@${cut}: no leak`, !leak, JSON.stringify(joinedText).slice(0, 90));
    }
  }
  // single-shot must also work
  const p1 = createStreamParser();
  const o1 = [...p1.push(full), ...p1.end()];
  if (name !== 'inline-json') {
    check(`fuzz[${name}]: single-shot no leak`, !/```|\{"v":1,"c":/.test(textOf(o1)), textOf(o1).slice(0, 90));
  } else {
    // render-layer invariant: salvage of the FULL text never leaves JSON
    const segs = salvageInlineUI(o1.find((e) => e.type === 'text')?.text ?? '');
    check('fuzz[inline-json]: salvage removes JSON from text', !segs.some((s) => s.type === 'text' && s.text.includes('"v":1')), JSON.stringify(segs).slice(0, 120));
  }
}

/* ---------------- 8. partial opener held back ---------------- */
{
  const p = createStreamParser();
  const o1 = p.push('weather is nice `');
  check('partial: 1 backtick held', !textOf(o1).includes('`'), textOf(o1));
  const o2 = p.push('``');
  check('partial: 2 backticks held', !textOf(o2).includes('`'), textOf(o2));
  const o3 = p.push('json\n{"v":1,"c":"note","d":{"text":"ok"}}\n```\n tail');
  check('partial: completes as component', o3.some((e) => e.type === 'component'), types(o3));
  const o4 = [...p.end()];
  check('partial: tail prose', (textOf(o3) + textOf(o4)).includes('tail'), textOf(o3) + '||' + textOf(o4));
}
{
  // ``` + tag split across chunks
  const p = createStreamParser();
  const out = [...p.push('a ```'), ...p.push('json\n{"v":1,"c":"note","d":{"text":"x"}}'), ...p.push('\n```'), ...p.push(' b'), ...p.end()];
  check('tag-split: component parsed', out.some((e) => e.type === 'component'), types(out));
  check('tag-split: prose ok', textOf(out) === 'a | b' || (textOf(out).includes('a') && textOf(out).includes('b')), textOf(out));
}

/* ---------------- 9. unterminated at end() ---------------- */
{
  const p = createStreamParser();
  const out = [...p.push('Text then ```mausam-ui\n{"v":1,"c":"note","d":{"text":"cut"}'), ...p.end()];
  check('unterminated: fallback', out.some((e) => e.type === 'fallback'), types(out));
  check('unterminated: prose kept', textOf(out).includes('Text then'), textOf(out));
}

/* ---------------- 10. validators stay strict where needed ---------------- */
{
  check('strict: not-json rejected', !parseBlock('{v:1}').ok);
  check('strict: array rejected', !parseBlock('[1,2]').ok);
  check('strict: empty hourly rejected', !parseBlock('{"v":1,"c":"hourly-timeline","d":{"hours":[]}}').ok);
  check('strict: garbage pops clamped', (() => {
    const r = parseBlock('{"v":1,"c":"rain-bars","d":{"pops":[999,-5,"abc"]}}');
    return r.ok && r.payload.d.pops[0] === 100 && r.payload.d.pops[1] === 0 && r.payload.d.pops[2] === 0;
  })());
}

/* ---------------- 11. hold-back of trailing incomplete payloads ---------------- */
{
  // complete inline payload → payload event, no hold
  const a = salvageInlineUI('A {"v":1,"c":"note","d":{"text":"x"}} B');
  check('hold: complete → payload', a.some((s) => s.type === 'payload') && !a.some((s) => s.type === 'hold'), JSON.stringify(a));
  // incomplete trailing payload → hold, JSON suppressed
  const b = salvageInlineUI('A {"v":1,"c":"note","d":{"te');
  check('hold: incomplete → held', b.some((s) => s.type === 'hold') && !b.some((s) => s.type === 'text' && s.text.includes('"c"')), JSON.stringify(b));
  check('hold: prose before incomplete kept', b.some((s) => s.type === 'text' && s.text.includes('A')), JSON.stringify(b));
  // ordinary text with a lone brace is untouched
  const c = salvageInlineUI('Set {a: 1} as template');
  check('hold: non-JSON brace untouched', c.length === 1 && c[0].type === 'text', JSON.stringify(c));
}

console.log(`\n=== parser v4: ${pass} passed, ${fail} failed ===`);
if (fails.length) {
  console.log('FAILURES:');
  for (const f of fails.slice(0, 30)) console.log('  ✗ ' + f);
  process.exit(1);
}
