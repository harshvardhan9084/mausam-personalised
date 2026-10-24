/**
 * header.js — app header: brand, persona badge, location switcher with
 * live search, settings menu (units / theme / refresh), offline pill.
 */

import { el, clear } from '../utils/dom.js';
import { geocodeSearch } from '../api/open-meteo.js';
import { store } from '../core/storage.js';

/**
 * @param {Object} refs DOM refs from index.html
 * @param {Object} handlers { onLocationPick, onRefresh, onUnitsChange, onThemeChange, onSwitchProfile, onNewProfile }
 */
export function wireHeader(refs, handlers) {
  const {
    brandEl, personaBadgeEl, cityBtn, cityLabel, refreshBtn, refreshIcon,
    settingsBtn, settingsMenu, offlinePill,
    searchOverlay, searchInput, searchResults, searchCloseBtn,
  } = refs;

  /* ---------- brand ---------- */
  brandEl.appendChild(el('img', { src: 'icons/favicon.svg', alt: '' }));
  brandEl.appendChild(el('span', null, 'Mausam'));

  /* ---------- profile badge ---------- */
  function setProfile(profile) {
    personaBadgeEl.textContent = profile ? `${profile.emoji} ${profile.name}` : '—';
  }
  personaBadgeEl.addEventListener('click', () => handlers.onSwitchProfile?.());

  /* ---------- location label ---------- */
  function setLocation(loc) {
    cityLabel.textContent = loc?.name ?? 'Set location';
    cityBtn.title = loc ? [loc.admin1, loc.country].filter(Boolean).join(', ') : '';
  }

  /* ---------- refresh ---------- */
  refreshBtn.addEventListener('click', () => handlers.onRefresh?.());
  function setRefreshing(on) {
    refreshIcon.textContent = on ? '◌' : '⟳';
    refreshIcon.classList.toggle('spin', on);
    refreshBtn.disabled = on;
    refreshBtn.setAttribute('aria-busy', String(on));
  }

  /* ---------- offline pill ---------- */
  function setOffline(on) {
    offlinePill.classList.toggle('show', on);
  }

  /* ---------- settings menu ---------- */
  function applyUnits(units) {
    settingsMenu.querySelectorAll('[data-units]').forEach((b) =>
      b.classList.toggle('active', b.dataset.units === units)
    );
  }
  function applyTheme(theme) {
    settingsMenu.querySelectorAll('[data-theme]').forEach((b) =>
      b.classList.toggle('active', b.dataset.theme === theme)
    );
  }

  settingsMenu.addEventListener('click', (e) => {
    const unitsBtn = e.target.closest('[data-units]');
    if (unitsBtn) {
      store.units.set(unitsBtn.dataset.units);
      applyUnits(unitsBtn.dataset.units);
      handlers.onUnitsChange?.(unitsBtn.dataset.units);
      return;
    }
    const themeBtn = e.target.closest('[data-theme-btn]');
    if (themeBtn) {
      store.theme.set(themeBtn.dataset.themeBtn);
      applyTheme(themeBtn.dataset.themeBtn);
      handlers.onThemeChange?.(themeBtn.dataset.themeBtn);
      return;
    }
    if (e.target.closest('[data-action="switch-profile"]')) {
      closeSettings();
      handlers.onSwitchProfile?.();
      return;
    }
    if (e.target.closest('[data-action="new-profile"]')) {
      closeSettings();
      handlers.onNewProfile?.();
    }
  });

  const openSettings = () => {
    settingsMenu.style.display = 'block';
    settingsBtn.setAttribute('aria-expanded', 'true');
  };
  const closeSettings = () => {
    settingsMenu.style.display = 'none';
    settingsBtn.setAttribute('aria-expanded', 'false');
  };
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsMenu.style.display === 'block' ? closeSettings() : openSettings();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.settings-wrap') && !e.target.closest('#chat-panel')) closeSettings();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSettings();
  });

  /* ---------- location search modal ---------- */
  const openSearch = () => {
    searchOverlay.classList.add('active');
    clear(searchResults);
    searchInput.value = '';
    searchInput.focus();
  };
  const closeSearch = () => {
    searchOverlay.classList.remove('active');
    abortSearch?.();
  };

  cityBtn.addEventListener('click', openSearch);
  searchCloseBtn.addEventListener('click', closeSearch);
  searchOverlay.addEventListener('click', (e) => {
    if (e.target === searchOverlay) closeSearch();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && searchOverlay.classList.contains('active')) closeSearch();
  });

  let abortSearch = null;
  let searchSeq = 0;

  async function runSearch(q) {
    abortSearch?.();
    const seq = ++searchSeq;
    const controller = new AbortController();
    abortSearch = () => controller.abort();

    if (q.trim().length < 2) {
      clear(searchResults);
      return;
    }
    clear(searchResults).appendChild(el('div.search-empty', null, 'Searching…'));
    try {
      const results = await geocodeSearch(q, controller.signal);
      if (seq !== searchSeq) return; // stale
      clear(searchResults);
      if (!results.length) {
        searchResults.appendChild(el('div.search-empty', null, `No places found for “${q}”`));
        return;
      }
      for (const r of results) {
        searchResults.appendChild(
          el('button.search-result', {
            type: 'button',
            onclick: () => {
              closeSearch();
              handlers.onLocationPick?.({
                name: r.name,
                admin1: r.admin1,
                country: r.country,
                lat: r.latitude,
                lon: r.longitude,
                isGeo: false,
              });
            },
          },
          el('span.result-name', null, r.name),
          el('span.result-sub', null, [r.admin1, r.country].filter(Boolean).join(', '))
        )
      );
    }
    } catch (err) {
      if (err.name !== 'AbortError' && seq === searchSeq) {
        clear(searchResults).appendChild(el('div.search-empty', null, 'Search failed — check connection'));
      }
    }
  }

  let debounceTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runSearch(searchInput.value), 300);
  });

  return {
    setProfile,
    setLocation,
    setRefreshing,
    setOffline,
    applyUnits,
    applyTheme,
    openSearch,
    openSettings,
  };
}
