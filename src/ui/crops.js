/**
 * crops.js — the Crops tab: a rich crop-calendar engine (v0.7).
 *
 * Replaces the old rain-radar tab. Pan-India crop calendar (sowing →
 * stages → harvest) crossed with the LIVE weather snapshot the app
 * already holds: soil moisture, 7-day rain, day/night temps, wind.
 * Zero extra API calls, works offline, bilingual, and every user can
 * pin the crops they actually grow (volatile selection, saved locally).
 *
 * v0.7: a filter field (also the tab's "/" target) narrows chips and
 * cards live; chips and cards re-render without stealing the field's
 * focus.
 */

import { el, clear } from '../utils/dom.js';
import { sectionTitle } from './shared.js';
import { icon, tipIcon } from './icons.js';
import { store } from '../core/storage.js';
import { t, getLang } from '../core/i18n.js';
import { CROPS, cropCalendar, farmAdvisories, seasonStarterIds } from '../core/crops.js';

let mount = null;
let filterQ = '';
let chipsGrid = null;
let cardsZone = null;

const getState = () => window.__mausamState ?? {};

export function wireCropsPage(mountEl) {
  mount = mountEl;
}

/** Router hook: tab became active. */
export function showCrops() {
  if (!mount) return;
  render();
}

function selectedIds() {
  let ids = store.flags.get('cropsSel', null);
  if (!Array.isArray(ids) || !ids.length) {
    ids = seasonStarterIds(new Date().getMonth());
    // if the profile says farming, show a wider starter set
    if (getState().profile?.interests?.includes('farming')) ids = [...new Set([...ids, 'soybean', 'sugarcane'])];
  }
  return ids.filter((id) => CROPS.some((c) => c.id === id));
}

function toggleCrop(id) {
  let ids = selectedIds();
  if (ids.includes(id)) {
    ids = ids.filter((x) => x !== id);
    if (!ids.length) ids = seasonStarterIds(new Date().getMonth()); // never empty
  } else {
    ids = [...ids, id];
  }
  store.flags.set('cropsSel', ids);
  renderDynamic();
}

const langIdx = () => (getLang() === 'hi' ? 1 : 0);

function matchesFilter(crop) {
  if (!filterQ) return true;
  const q = filterQ.toLowerCase();
  return crop.name.some((n) => String(n).toLowerCase().includes(q)) || crop.id.includes(q);
}

function render() {
  clear(mount);
  mount.appendChild(el('div.page-h', null, icon('crops', 'page-ico'), ' ', t('crop_title')));

  const snapshot = getState().snapshot ?? null;
  const { season } = cropCalendar(snapshot, selectedIds());

  /* season banner */
  mount.appendChild(el('div.crop-season',
    el('span.crop-season-ico', { 'aria-hidden': 'true' }, tipIcon(season.icon, 'season-svg') ?? document.createTextNode(String(season.icon ?? ''))),
    el('span', null, season.label),
  ));

  if (!snapshot) {
    mount.appendChild(el('div.card.pad-sm.crop-note', null, t('crop_wait_data')));
  }

  /* crop filter — the tab's main text field ("/" reaches it) */
  mount.appendChild(sectionTitle(t('crop_pick')));
  const filterWrap = el('div.search-wrap.crop-filter-wrap',
    el('span.search-icon', { 'aria-hidden': 'true' },
      el('span', { class: 'crop-filter-glyph' }, '⌕')),
    el('input.crop-filter', {
      id: 'crop-filter',
      type: 'search',
      placeholder: t('crop_filter'),
      autocomplete: 'off', spellcheck: 'false',
      'aria-label': t('crop_filter'),
      value: filterQ,
      oninput: (e) => {
        filterQ = e.target.value.trim();
        renderDynamic();
      },
    }),
  );
  mount.appendChild(filterWrap);

  chipsGrid = el('div.chip-grid.crop-chips');
  mount.appendChild(chipsGrid);
  mount.appendChild(el('div.crop-tiny', null, t('crop_pick_hint')));

  cardsZone = el('div.crop-cards-zone');
  mount.appendChild(cardsZone);

  mount.appendChild(el('div.crop-tiny.crop-disclaimer', null, t('crop_disclaimer')));

  renderDynamic();
}

/** Rebuild only the chips + cards (keeps the filter field and its focus). */
function renderDynamic() {
  if (!chipsGrid || !cardsZone) return;
  const snapshot = getState().snapshot ?? null;
  const sel = selectedIds();
  const visible = CROPS.filter(matchesFilter);
  // when filtering, the calendar searches the WHOLE catalogue, not just pins
  const { rows } = cropCalendar(snapshot, filterQ ? visible.map((c) => c.id) : sel);
  const advisories = farmAdvisories(rows, 4);

  /* chips */
  clear(chipsGrid);
  for (const c of visible) {
    chipsGrid.appendChild(el(`button.chip.you-chip${sel.includes(c.id) ? '.on' : ''}`, {
      type: 'button',
      'aria-pressed': String(sel.includes(c.id)),
      onclick: () => toggleCrop(c.id),
    }, `${c.emoji} ${c.name[langIdx()]}`));
  }
  if (!visible.length) {
    chipsGrid.appendChild(el('span.crop-tiny', null, t('crop_none')));
  }

  /* this week on the farm (only when not filtering) */
  clear(cardsZone);
  if (advisories.length && !filterQ) {
    cardsZone.appendChild(sectionTitle(t('crop_week')));
    const wrap = el('div.crop-advisories');
    for (const a of advisories) {
      wrap.appendChild(el(`div.crop-advice.insight-${a.tone === 'bad' ? 'danger' : a.tone}`,
        el('span.crop-advice-ico', { 'aria-hidden': 'true' }, tipIcon(a.icon) ?? document.createTextNode(String(a.icon ?? ''))),
        el('div.crop-advice-body',
          el('div.crop-advice-crop', null, `${a.crop.emoji} ${a.crop.name[langIdx()]}${statusChipText(a.status) ? ` · ${statusChipText(a.status)}` : ''}`),
          el('div.crop-advice-text', null, a.text),
        ),
      ));
    }
    cardsZone.appendChild(wrap);
  }

  /* per-crop cards */
  cardsZone.appendChild(sectionTitle(t('crop_calendar')));
  const rowsShown = rows.filter((row) => matchesFilter(row.crop));
  if (!rowsShown.length && filterQ) {
    cardsZone.appendChild(el('div.card.pad-sm.crop-note', null, t('crop_none')));
  }
  for (const row of rowsShown) cardsZone.appendChild(cropCard(row, Boolean(snapshot)));
}

const STATUS = {
  sowing: { cls: 'good', en: 'SOWING NOW', hi: 'बुवाई का समय' },
  growing: { cls: 'info', en: 'GROWING', hi: 'बढ़ रही है' },
  harvest: { cls: 'warn', en: 'HARVEST TIME', hi: 'कटाई का समय' },
  off: { cls: 'muted', en: 'NOT IN FIELD', hi: 'खेत में नहीं' },
};
const statusChipText = (s) => (STATUS[s] ? STATUS[s][langIdx() ? 'hi' : 'en'] : '');

function fmtD(d) {
  try {
    return d.toLocaleDateString(langIdx() ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function cropCard(row, hasData) {
  const c = row.crop;
  const st = STATUS[row.status] ?? STATUS.off;
  const stageName = row.status === 'growing' || row.status === 'harvest'
    ? c.stages[Math.min(row.stageIdx, c.stages.length - 1)]?.n?.[langIdx()] ?? ''
    : '';

  /* stage progress bar */
  let bar = null;
  if (row.status === 'growing' || row.status === 'harvest') {
    bar = el('div.crop-bar',
      el('div.crop-bar-fill', { style: { width: `${Math.max(3, Math.round(row.progress * 100))}%` } }),
      ...c.stages.map((s, i) => el('span.crop-bar-tick', {
        style: { left: `${Math.round(c.stages.slice(0, i).reduce((a, x) => a + x.f, 0) * 100)}%` },
        title: s.n[langIdx()],
      })),
    );
  }

  const meta = [];
  if (row.status === 'sowing') {
    meta.push(`${t('crop_sow_win')}: ${fmtD(row.sowStart)} – ${fmtD(row.sowEnd)}`);
    meta.push(`${t('crop_harvest_est')}: ~${fmtD(row.harvestAt)}`);
  } else if (row.status === 'growing' || row.status === 'harvest') {
    meta.push(`${t('crop_stage')}: ${stageName}`);
    meta.push(`${t('crop_harvest_est')}: ~${fmtD(row.harvestAt)}`);
  } else {
    meta.push(`${t('crop_next_sow')}: ${fmtD(row.sowStart)} (${t('crop_in_days', { n: row.nextSowDays })})`);
  }

  const card = el('div.card.crop-card',
    el('div.crop-card-head',
      el('div.crop-card-name', null, `${c.emoji} ${c.name[langIdx()]}`),
      el(`span.crop-badge.crop-${st.cls}`, null, statusChipText(row.status)),
    ),
    bar,
    el('div.crop-meta', null, meta.map((m) => el('span.crop-meta-item', null, m))),
  );

  if (hasData && row.fit.length) {
    const fit = el('div.crop-fit');
    for (const f of row.fit) {
      fit.appendChild(el(`div.crop-fit-row.crop-tone-${f.tone}`,
        el('span.crop-fit-ico', { 'aria-hidden': 'true' }, tipIcon(f.icon) ?? document.createTextNode(String(f.icon ?? ''))),
        el('span', null, f.text),
      ));
    }
    card.appendChild(fit);
  }

  return card;
}
