/**
 * header.js — slim app header (v0.5): brand, location switcher
 * (search + GPS), offline pill, data-source pill, refresh.
 * You / Mitra / Settings live in the bottom navigation now.
 */

import { el, clear, trapFocus } from '../utils/dom.js';
import { geocodeSearch } from '../api/open-meteo.js';
import { store } from '../core/storage.js';
import { t } from '../core/i18n.js';

const GEO_TIMEOUT_MS = 10000;

/**
 * @param {Object} refs DOM refs from index.html
 * @param {Object} handlers { onLocationPick, onRefresh }
 */
export function wireHeader(refs, handlers) {
  const {
    brandEl, cityBtn, cityLabel, refreshBtn, refreshIcon,
    offlinePill, searchOverlay, searchInput, searchResults, searchCloseBtn, useLocBtn,
  } = refs;

  /* ---------- brand ---------- */
  brandEl.appendChild(el('img', { src: 'icons/favicon.svg', alt: '' }));
  brandEl.appendChild(el('span', null, 'Mausam'));

  /* ---------- location label ---------- */
  function setLocation(loc) {
    cityLabel.textContent = loc?.name ?? t('set_location');
    cityBtn.title = loc ? [loc.admin1, loc.country].filter(Boolean).join(', ') : '';
  }

  /* ---------- refresh ---------- */
  refreshBtn.addEventListener('click', () => handlers.onRefresh?.());
  function setRefreshing(on) {
    refreshIcon?.classList.toggle('spin', on);
    refreshBtn.disabled = on;
    refreshBtn.setAttribute('aria-busy', String(on));
  }

  /* ---------- offline pill ---------- */
  function setOffline(on) {
    offlinePill.classList.toggle('show', on);
  }

  /* ---------- data-source pill ---------- */
  function setSource(imd) {
    refs.srcPill.classList.add('show');
    if (imd?.ok) {
      refs.srcPill.classList.add('imd');
      refs.srcLabel.textContent = 'IMD + Open-Meteo';
      refs.srcPill.title = `Official IMD forecast via ${imd.station?.name ?? 'IMD station'}, merged with Open-Meteo`;
    } else {
      refs.srcPill.classList.remove('imd');
      refs.srcLabel.textContent = 'Open-Meteo';
      refs.srcPill.title = 'Live data from Open-Meteo (add a free IMD key in Settings for official data)';
    }
  }

  /* ---------- location search modal ---------- */
  let searchFocus = null;
  const openSearch = () => {
    searchOverlay.classList.add('active');
    clear(searchResults);
    searchInput.value = '';
    searchInput.placeholder = t('search_ph');
    searchFocus = trapFocus(searchOverlay);
    searchInput.focus();
  };
  /** Share-target path: open the modal with a query already filled in. */
  const openSearchWithQuery = (q) => {
    openSearch();
    if (!q) return;
    searchInput.value = q;
    runSearchDebounced(q);
  };
  const closeSearch = () => {
    if (!searchOverlay.classList.contains('active')) return;
    searchOverlay.classList.remove('active');
    searchFocus?.closeFocus();
    searchFocus = null;
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

  /* use-my-location: GPS → reverse geocode (BigDataCloud → Nominatim) */
  useLocBtn.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      clear(searchResults).appendChild(el('div.search-empty', null, t('geo_na')));
      return;
    }
    clear(searchResults).appendChild(el('div.search-empty', null, t('geo_req')));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let name = 'My location';
        let admin1 = '';
        try {
          // BigDataCloud client endpoint: keyless, CORS-open, village-level detail
          const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`, {
            signal: AbortSignal.timeout(8000),
          });
          const j = await res.json();
          name = j.city || j.locality || j.principalSubdivision || name;
          admin1 = j.principalSubdivision || '';
        } catch {
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=10`, {
              headers: { Accept: 'application/json' },
              signal: AbortSignal.timeout(8000),
            });
            const j = await res.json();
            const addr = j?.address ?? {};
            name = addr.city || addr.town || addr.village || addr.county || addr.state_district || j?.name || name;
            admin1 = addr.state || '';
          } catch { /* keep default name */ }
        }
        closeSearch();
        handlers.onLocationPick?.({ name, admin1, country: '', lat: latitude, lon: longitude, isGeo: true });
      },
      (err) => {
        clear(searchResults).appendChild(el('div.search-empty', null,
          err.code === 1 ? t('loc_denied') : t('loc_fail')));
      },
      { timeout: GEO_TIMEOUT_MS, maximumAge: 300000 }
    );
  });

  /* live city search */
  let abortSearch = null;
  let searchSeq = 0;

  async function runSearch(q) {
    abortSearch?.();
    const seq = ++searchSeq;
    const controller = new AbortController();
    abortSearch = () => controller.abort();

    if (q.trim().length < 2) { clear(searchResults); return; }
    clear(searchResults).appendChild(el('div.search-empty', null, t('searching')));
    try {
      const results = await geocodeSearch(q, controller.signal);
      if (seq !== searchSeq) return; // stale
      clear(searchResults);
      if (!results.length) {
        searchResults.appendChild(el('div.search-empty', null, t('no_results')));
        return;
      }
      for (const r of results) {
        searchResults.appendChild(
          el('button.search-result', {
            type: 'button',
            onclick: () => {
              closeSearch();
              handlers.onLocationPick?.({
                name: r.name, admin1: r.admin1, country: r.country,
                lat: r.latitude, lon: r.longitude, isGeo: false,
              });
            },
          },
            el('span.result-name', null, r.name),
            el('span.result-sub', null, [r.admin1, r.country].filter(Boolean).join(', ')),
          ),
        );
      }
    } catch (err) {
      if (err.name !== 'AbortError' && seq === searchSeq) {
        clear(searchResults).appendChild(el('div.search-empty', null, t('search_fail')));
      }
    }
  }

  let debounceTimer = null;
  function runSearchDebounced(q) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runSearch(q), 300);
  }
  searchInput.addEventListener('input', () => runSearchDebounced(searchInput.value));

  return { setLocation, setRefreshing, setOffline, setSource, openSearch, openSearchWithQuery };
}
