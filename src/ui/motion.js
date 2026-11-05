/**
 * motion.js — the living surface: Mausam's choreography layer.
 *
 * Built on the vendored Motion mini engine (src/vendor/motion.js, MIT):
 * one library voice for every entrance, reveal and pop in the app.
 *
 * The grammar:
 *   pageEnter(page)  — staged rise for a tab's sections (above-fold stagger,
 *                      below-fold IntersectionObserver reveals).
 *   popIn(node)      — one-card entrance (chat component cards landing
 *                      mid-stream and on settle).
 *   countUp(el, fmt) — hero temperature settles into place (rAF tween;
 *                      the mini engine has no single-value mode).
 *   settle()         — finish every running animation instantly (used by
 *                      tests/screenshots to capture resting state).
 *
 * Rules this layer obeys:
 *   - prefers-reduced-motion: every function is a no-op.
 *   - Resting state is untouched: WAAPI animations use fill 'none', so
 *     computed styles after settle are byte-identical to a no-JS load.
 *   - No FOUC risk: initial hidden states live inside the animation
 *     keyframes only; without JS (or with the library missing) the page
 *     renders exactly as before.
 */

import { animate } from '../vendor/motion.js';

let reducedQuery = null;
function reduced() {
  if (typeof matchMedia !== 'function') return true;
  reducedQuery ??= matchMedia('(prefers-reduced-motion: reduce)');
  return reducedQuery.matches;
}

/* One entrance voice: rise 10px + fade, --t-slow pace, gentle stagger. */
const ENTER = { opacity: [0, 1], y: [10, 0] };
const ENTER_OPTS = { duration: 0.26, ease: 'easeOut' };
const REVEAL = { opacity: [0, 1], y: [12, 0] };

let io = null;
function revealObserver() {
  io ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      animate(e.target, REVEAL, { duration: 0.3, ease: 'easeOut' });
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  return io;
}

/** Staged entrance for a page's direct children. Above-fold sections rise
 *  in a tight stagger; below-fold sections reveal on first scroll into
 *  view. Safe to call again for the same mount — it animates only what it
 *  is given, and settled elements return to their natural styles. */
export function pageEnter(page) {
  if (reduced()) return;
  const root = typeof page === 'string' ? document.getElementById(`page-${page}`) : page;
  if (!root) return;
  // Pages wrap their sections in a .page-scroll scroller; animate the
  // scroller's children (the real sections), falling back to root children.
  const scroller = root.querySelector(':scope > .page-scroll');
  const level = scroller ?? root;
  const kids = [...level.children].filter((k) => !k.hasAttribute('hidden') && k.offsetParent !== null);
  if (!kids.length) return;
  const vh = window.innerHeight || 800;
  const above = [];
  const below = [];
  for (const k of kids) {
    const top = k.getBoundingClientRect().top;
    (top < vh * 0.92 ? above : below).push(k);
  }
  if (above.length) {
    animate(above, ENTER, { ...ENTER_OPTS, delay: (i) => Math.min(i * 0.04, 0.24) });
  }
  if (below.length) {
    const obs = revealObserver();
    below.forEach((k) => obs.observe(k));
  }
}

/** One-card entrance: scale 0.97 + rise 8px. Used for chat component cards
 *  so a card landing mid-stream reads as arriving, not teleporting. */
export function popIn(node) {
  if (reduced() || !(node instanceof Element)) return;
  animate(node, { opacity: [0, 1], y: [8, 0], scale: [0.97, 1] }, { duration: 0.22, ease: 'easeOut' });
}

/** Tween an element's text from ~72% of its final number to the final
 *  value. `fmt(currentNumber)` must return the full display string; the
 *  element's existing text supplies the final number. rAF-based because
 *  Motion mini has no single-value mode; tabular-nums keeps it steady. */
export function countUp(el, fmt) {
  if (reduced() || !el || el.dataset.counted === '1') return;
  const finalText = el.textContent ?? '';
  const m = finalText.match(/-?\d+(?:\.\d+)?/);
  if (!m) return;
  const to = Number(m[0]);
  if (!Number.isFinite(to)) return;
  const from = Math.round(to * 0.72);
  if (from === to) return;
  el.dataset.counted = '1';
  const dur = 480;
  const t0 = performance.now();
  const tick = (now) => {
    const p = Math.min((now - t0) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const cur = Math.round(from + (to - from) * eased);
    el.textContent = fmt ? fmt(cur) : finalText.replace(m[0], String(cur));
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = finalText; // exact resting text, byte-for-byte
  };
  requestAnimationFrame(tick);
}

/** Finish every running animation (WAAPI + CSS) and jump to end state.
 *  Exposed for visual-regression sweeps that must capture resting state. */
export function settle() {
  if (typeof document === 'undefined' || !document.getAnimations) return;
  for (const a of document.getAnimations()) {
    try { a.finish(); } catch { /* already finished / not finishable */ }
  }
}
