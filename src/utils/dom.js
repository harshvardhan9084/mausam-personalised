/**
 * dom.js — minimal hyperscript-style DOM helper + fragment utilities.
 * Replaces the MVP's innerHTML-string approach with safe element building.
 */

/**
 * Create an element.
 *   el('div.card', { onclick: fn, 'aria-live': 'polite' }, child1, child2, 'text')
 * Class shorthand: 'div.a.b' → div with classes a and b.
 * @param {string} selector 'tag.class1.class2'
 * @param {Object} [attrs] attributes, event handlers (on*), dataset (data*)
 * @param {...(Node|string|null|undefined|false|Array)} children
 */
export function el(selector, attrs = {}, ...children) {
  // Tolerance: if `attrs` is actually a child (Node / array / string / number),
  // shift it into the children list. This makes el('div', el('span'), …) and
  // el('div', items.map(…)) behave like el('div', null, …) instead of silently
  // stringifying children into attributes.
  if (attrs != null && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children = [attrs, ...children];
    attrs = {};
  }

  const [tag, ...classes] = selector.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');

  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') {
      // MERGE with selector classes instead of overwriting them.
      node.classList.add(...String(value).split(/\s+/).filter(Boolean));
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'dataset') {
      Object.assign(node.dataset, value);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }

  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) {
      append(node, child);
    } else if (child instanceof Node) {
      node.appendChild(child);
    } else {
      node.appendChild(document.createTextNode(String(child)));
    }
  }
  return node;
}

/** Remove all children. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Await-focused sleep. */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Escape a string for safe use in HTML (defence in depth). */
export function esc(str) {
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

/**
 * Production modal behaviour: trap Tab inside `overlay`, and return a
 * cleanup that restores focus to whatever had it before the overlay opened.
 * Call closeFocus() when the overlay closes.
 * @param {HTMLElement} overlay
 * @returns {{ closeFocus: () => void }}
 */
export function trapFocus(overlay) {
  const prev = document.activeElement;
  const SEL = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const onKey = (e) => {
    if (e.key !== 'Tab') return;
    const items = [...overlay.querySelectorAll(SEL)]
      .filter((n) => !n.disabled && n.getClientRects().length);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) {
      first.focus();
      e.preventDefault();
    }
  };
  overlay.addEventListener('keydown', onKey);
  return {
    closeFocus() {
      overlay.removeEventListener('keydown', onKey);
      if (prev && document.contains(prev)) prev.focus?.();
    },
  };
}

/**
 * Android back button closes modals — mobile-first papercut fix.
 *
 * While any `.modal-overlay` is open we keep ONE pushed history entry
 * (state.mausamModal); the hardware/gesture back then pops that entry and
 * closes the top modal via its own ✕ handler (so focus restore, Esc cleanup
 * etc. all run) instead of leaving the app. Every normal close path (✕, Esc,
 * backdrop tap) removes the overlay, which pops the pushed entry — history
 * stays clean. `history.state` is the single source of truth (no shadow
 * flag that can desync across reloads or popstate quirks). Self-wiring via
 * MutationObserver, so every modal following the .modal-overlay pattern —
 * current or future — gets back-button support for free.
 * Call once at boot; safe no-op where pushState is unavailable (file://).
 */
export function wireModalHistory() {
  // NOTE: .active matters — static overlays (the header search modal) sit in
  // the DOM permanently and only gain/lose .active when opened/closed.
  const SEL = '.modal-overlay.active';
  const openOverlay = () => document.querySelector(SEL);
  const armed = () => {
    try { return history.state?.mausamModal === true; } catch { return false; }
  };

  new MutationObserver(() => {
    if (openOverlay()) {
      if (!armed()) {
        try { history.pushState({ mausamModal: true }, ''); } catch { /* file:// etc. */ }
      }
    } else if (armed()) {
      try { history.back(); } catch { /* ignore */ }
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });

  window.addEventListener('popstate', () => {
    // our own disarm-back fires this too — only act when a modal is actually
    // open and the popped-to entry is NOT a modal entry (real back press)
    if (!openOverlay() || armed()) return;
    const overlay = openOverlay();
    // reuse the modal's own close path — full cleanup, no double bookkeeping
    const closeBtn = overlay.querySelector('.modal-close');
    if (closeBtn) closeBtn.click();
    else { overlay.classList.remove('active'); overlay.remove(); }
  });
}
