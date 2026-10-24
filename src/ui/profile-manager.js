/**
 * profile-manager.js — profile selection grid + switch modal.
 * Replaces the old hardcoded persona picker: cards are USER profiles,
 * with edit + new actions. Built with utils/dom.el (no innerHTML).
 */

import { el, clear } from '../utils/dom.js';
import { listProfiles, profileTagline } from '../core/profiles.js';

/**
 * Build profile cards into a container.
 * @param {HTMLElement} container
 * @param {{onSelect:(id:string)=>void, onNew?:()=>void, onEdit?:(id:string)=>void}} handlers
 */
export function renderProfilesGrid(container, { onSelect, onNew, onEdit }) {
  clear(container);
  const profiles = listProfiles();

  for (const p of profiles) {
    const card = el('button.persona-card',
      {
        type: 'button',
        'aria-label': `${p.name} — ${profileTagline(p)}`,
        onclick: () => onSelect(p.id),
      },
      el('div.p-icon', null, p.emoji),
      el('div.p-name', null, p.name),
      el('div.p-desc', null, profileTagline(p))
    );
    card.style.setProperty('--pc', `var(--accent-${p.color ?? 'blue'}, var(--blue))`);
    container.appendChild(card);

    if (onEdit) {
      const edit = el('button.profile-edit', {
        type: 'button',
        title: `Edit ${p.name}`,
        'aria-label': `Edit profile ${p.name}`,
        onclick: (e) => {
          e.stopPropagation();
          onEdit(p.id);
        },
      }, '✏️');
      card.appendChild(edit);
    }
  }

  if (onNew) {
    container.appendChild(el('button.persona-card.persona-new', {
      type: 'button',
      'aria-label': 'Create a new profile',
      onclick: () => onNew(),
    },
      el('div.p-icon.p-icon-new', { 'aria-hidden': 'true' }, '＋'),
      el('div.p-name', null, 'New profile'),
      el('div.p-desc', null, 'Another member of the family? Build their view.')
    ));
  }
}

/**
 * Wire the switch-profile modal.
 * @param {{overlay:HTMLElement, grid:HTMLElement, closeBtn:HTMLElement}} refs
 * @param {{onSelect:(id:string)=>void, onNew?:()=>void, onEdit?:(id:string)=>void}} handlers
 */
export function wireProfileModal(refs, handlers) {
  const { overlay, grid, closeBtn } = refs;
  let lastFocus = null;

  const open = () => {
    lastFocus = document.activeElement;
    renderProfilesGrid(grid, handlers);
    overlay.classList.add('active');
    grid.querySelector('button')?.focus();
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

  return { open, close, refresh: () => renderProfilesGrid(grid, handlers) };
}
