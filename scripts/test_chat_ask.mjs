/**
 * chat ask table — v0.8.39 "the conversation answers back".
 * The question is born with the card: verdict cards derive a follow-up
 * from their own validated data; facts/charts stay plain (no fake
 * affordances). Deterministic — runs in node, no DOM.
 */
import { chatAsk } from '../src/ai/chatAsk.js';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + name); } };

/* window-card: the top window's slot rides in the question */
const win = chatAsk('window-card', { verdict: 'Good news', windows: [{ slot: 'Today 2–4 PM', rating: 'Good', color: 'var(--green)' }, { slot: 'Tonight', rating: 'Poor' }] });
ok(typeof win === 'string' && win.includes('Today 2–4 PM'), 'window-card embeds its own top slot');
ok(!win.includes('Tonight'), 'window-card question uses the TOP window, not every window');

/* window-card without slots → no fake affordance */
ok(chatAsk('window-card', { windows: [] }) === null, 'window-card with no windows → null');
ok(chatAsk('window-card', { windows: [{ rating: 'Good' }] }) === null, 'window-card with slotless windows → null');

/* aqi-card: the number itself */
const aqi = chatAsk('aqi-card', { aqi: 156.4, category: 'Poor' });
ok(typeof aqi === 'string' && aqi.includes('156'), 'aqi-card embeds the rounded AQI number');
ok(chatAsk('aqi-card', { category: 'Poor' }) === null, 'aqi-card without a number → null');

/* alert: the title rides in; text-only alerts stay plain */
const al = chatAsk('alert', { severity: 'warn', title: 'Heavy rain likely', text: 'Carry an umbrella.' });
ok(typeof al === 'string' && al.includes('Heavy rain likely'), 'alert embeds its own title');
ok(chatAsk('alert', { severity: 'info', text: 'No title here' }) === null, 'alert without title → null');

/* wear-list: the card as a whole is the verdict */
ok(typeof chatAsk('wear-list', { items: [{ name: 'Cotton shirt' }] }) === 'string', 'wear-list with items → question');
ok(chatAsk('wear-list', { items: [] }) === null, 'wear-list empty → null');

/* v0.8.42 verify-card: the ledger's follow-up is who wins a split */
ok(typeof chatAsk('verify-card', { rows: [{ label: 'Temperature · settled day Oct 28', detail: 'NASA satellite 24.2° · ERA5 24.0° — agree within 0.2°', verdict: 'ok' }] }) === 'string', 'verify-card with rows → question');
ok(chatAsk('verify-card', { rows: [] }) === null, 'verify-card with no rows → null');

/* facts and charts NEVER ask — no fake affordances */
for (const c of ['now-card', 'hourly-timeline', 'temp-chart', 'rain-bars', 'sun-card', 'note', 'chips']) {
  ok(chatAsk(c, { anything: 1 }) === null, `${c} (fact/chart/action) → null`);
}

/* garbage in → null out, never throw */
ok(chatAsk('aqi-card', null) === null, 'null data → null');
ok(chatAsk('aqi-card', 'strings are not verdicts') === null, 'string data → null');

console.log(`=== chat ask: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
