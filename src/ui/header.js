/**
 * header.js — slim app header (v0.5): brand, location switcher
 * (search + GPS), offline pill, data-source pill, refresh.
 * You / Mitra / Settings live in the bottom navigation now.
 */

import { el, clear, trapFocus } from '../utils/dom.js';
import { geocodeSearch } from '../api/open-meteo.js';
import { store } from '../core/storage.js';
import { pickName, pickAdmin1, pickCountry } from '../core/placename.js';
import { t, getLang } from '../core/i18n.js';
import { icon, wxGlyph } from './icons.js';
import { skyBucket } from './shared.js';
import { probePlace } from './places.js';

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

  /* ---------- location label ----------
     v0.8.32: the label reads through the placename layer, so a place
     saved in one script re-renders in the reader's script after a
     language switch (the lazy resolver patches the store and fires
     'mausam:placename' → main.js re-renders). */
  function setLocation(loc) {
    cityLabel.textContent = loc?.name ? pickName(loc) : t('set_location');
    cityBtn.title = loc ? [pickAdmin1(loc), pickCountry(loc)].filter(Boolean).join(', ') : '';
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

  /* ---------- location search modal ----------
     v0.8.18 "the search moment deserves design": opening the modal used to
     show a dead empty area under the input. Now the idle state works — your
     saved places (current one tagged) and one-tap popular-city chips — and
     every state after it (searching / results / none) speaks the same
     designed row language: glyph disc + stacked name/sub (+ Current tag). */
  /* v0.8.32: popular cities are {en, hi} pairs — the chip labels AND the
     query follow the UI language (a hi user taps 'मुंबई', the script-aware
     geocoder answers in Hindi; an EN user taps 'Mumbai'). */
  const POPULAR_CITIES = [
    { en: 'Delhi', hi: 'दिल्ली' },
    { en: 'Mumbai', hi: 'मुंबई' },
    { en: 'Patna', hi: 'पटना' },
    { en: 'Lucknow', hi: 'लखनऊ' },
    { en: 'Jaipur', hi: 'जयपुर' },
    { en: 'Kolkata', hi: 'कोलकाता' },
    { en: 'Hyderabad', hi: 'हैदराबाद' },
    { en: 'Chennai', hi: 'चेन्नई' },
  ];
  let searchFocus = null;

  const pickPlace = (loc) => {
    closeSearch();
    handlers.onLocationPick?.({
      name: loc.name, admin1: loc.admin1 ?? '', country: loc.country ?? '',
      lat: loc.lat, lon: loc.lon, isGeo: false,
    });
  };

  /** Glyph-disc + stacked texts row — shared by saved places and results. */
  const placeRow = (loc, opts = {}) =>
    el('button.search-result', {
      type: 'button',
      ...(opts.tag ? { 'data-current': '1' } : {}),
      onclick: opts.onTap ?? (() => pickPlace(loc)),
    },
      el('span.result-disc', { 'aria-hidden': 'true' }, icon(opts.glyph ?? 'pin', 'result-ico')),
      el('span.result-texts', null,
        el('span.result-name', null, pickName(loc)),
        el('span.result-sub', null, [pickAdmin1(loc), pickCountry(loc)].filter(Boolean).join(', '))),
      opts.tag ? el('span.result-tag', null, opts.tag) : null,
    );

  /** Idle content: saved places (current first, tagged) + popular chips.
   *  Current location comes from the live handler (main.js module state —
   *  the store only persists after a user pick); destinations from the store.
   *  v0.8.23: saved rows swap their pin disc for the place's LIVE sky glyph
   *  once the shared probe resolves (same cache as the home rail) — the
   *  switcher reads the sky before you commit the tap. The current row keeps
   *  its check disc: there the meaning is "you are here", not the weather. */
  const renderSearchIdle = () => {
    clear(searchResults);
    const cur = handlers.getLocation?.() ?? store.location.get();
    const dests = (store.destinations.get() ?? []).filter((d) =>
      !(cur && d.lat === cur.lat && d.lon === cur.lon));
    if (cur || dests.length) {
      searchResults.appendChild(el('div.search-sec-label', null, t('search_yours')));
      if (cur) searchResults.appendChild(placeRow(cur, { glyph: 'check', tag: t('search_current') }));
      for (const d of dests) {
        const row = placeRow(d);
        searchResults.appendChild(row);
        probePlace(d).then((r) => {
          if (r == null || r.code == null) return; // probe failed → pin stays
          const disc = row.querySelector('.result-disc');
          if (!disc) return;
          disc.textContent = '';
          disc.appendChild(wxGlyph(skyBucket(r.code, r.isDay), 'wx-ico result-wx'));
        });
      }
    }
    searchResults.appendChild(el('div.search-sec-label', null, t('search_popular')));
    searchResults.appendChild(el('div.search-quick', null,
      POPULAR_CITIES.map((c) => {
        const name = getLang() === 'hi' ? c.hi : c.en;
        return el('button.search-quick-chip', {
          type: 'button',
          onclick: () => { searchInput.value = name; runSearch(name); },
        }, name);
      })));
  };

  /** Three shimmer rows in the skeleton language (aria-labelled). */
  const searchShimmer = () =>
    el('div.search-sk', { role: 'status', 'aria-label': t('searching') },
      Array.from({ length: 3 }, () => el('div.sk.search-sk-row')));

  const openSearch = () => {
    searchOverlay.classList.add('active');
    searchInput.value = '';
    searchInput.placeholder = t('search_ph');
    renderSearchIdle();
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
          // v0.8.28: localityLanguage follows the UI language — a Hindi user's
          // GPS place is named in Hindi, not hardcoded English.
          const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=${getLang()}`, {
            signal: AbortSignal.timeout(8000),
          });
          const j = await res.json();
          name = j.city || j.locality || j.principalSubdivision || name;
          admin1 = j.principalSubdivision || '';
        } catch {
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=10`, {
              headers: { Accept: 'application/json', 'Accept-Language': `${getLang()}, en` },
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

    if (q.trim().length < 2) { renderSearchIdle(); return; }
    clear(searchResults).appendChild(searchShimmer());
    try {
      const results = await geocodeSearch(q, controller.signal);
      if (seq !== searchSeq) return; // stale
      clear(searchResults);
      if (!results.length) {
        searchResults.appendChild(el('div.search-none', null,
          el('span.result-disc.result-disc-warn', { 'aria-hidden': 'true' }, icon('warn', 'result-ico')),
          el('span.result-texts', null,
            el('span.result-name', null, t('no_results')),
            el('span.result-sub', null, t('no_results_hint')))));
        return;
      }
      for (const r of results) {
        searchResults.appendChild(
          placeRow({
            name: r.name, admin1: r.admin1, country: r.country,
            lat: r.latitude, lon: r.longitude,
          }),
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
