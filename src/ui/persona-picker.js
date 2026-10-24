/**
 * persona-picker.js — persona selection screen + switch modal.
 */

import { el, clear } from '../utils/dom.js';
import { PERSONAS } from '../core/personas.js';

/**
 * Build the persona cards grid.
 * @param {HTMLElement} container
 * @param {(id: string) => void} onSelect
 */
export function renderPersonaGrid(container, onSelect) {
  clear(container);
  for (const p of Object.values(PERSONAS)) {
    container.appendChild(
      el(
        'button.persona-card',
        { type: 'button', onclick: () => onSelect(p.id), 'aria-label': `${p.name} — ${p.desc}` },
        el('div.p-icon', null, p.icon),
        el('div.p-name', null, p.name),
        el('div.p-desc', null, p.desc)
      )
    );
  }
}

/**
 * Wire the switch-persona modal: open/close, focus restore, Esc, backdrop click.
 * @param {{overlay: HTMLElement, grid: HTMLElement, closeBtn: HTMLElement}} refs
 * @param {(id: string) => void} onPick
 */
export function wireSwitchModal(refs, onPick) {
  const { overlay, grid, closeBtn } = refs;
  let lastFocus = null;

  const open = () => {
    lastFocus = document.activeElement;
    overlay.classList.add('active');
    renderPersonaGrid(grid, onPick);
    const first = grid.querySelector('button');
    first?.focus();
  };

  const close = () => {
    overlay.classList.remove('active');
    lastFocus?.focus?.();
  };

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) close();
  });

  return { open, close };
}
