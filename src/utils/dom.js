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
