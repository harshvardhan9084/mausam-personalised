/**
 * crops.js — the Crops tab: a rich crop-calendar engine (v0.6).
 *
 * Replaces the old rain-radar tab. Pan-India crop calendar (sowing →
 * stages → harvest) crossed with the LIVE weather snapshot the app
 * already holds: soil moisture, 7-day rain, day/night temps, wind.
 * Zero extra API calls, works offline, bilingual, and every user can
 * pin the crops they actually grow (volatile selection, saved locally).
 */

import { el, clear } from '../utils/dom.js';
import { sectionTitle } from './shared.js';
import { store } from '../core/storage.js';
import { t, getLang } from '../core/i18n.js';
import { CROPS, cropCalendar, farmAdvisories, seasonStarterIds } from '../core/crops.js';

let mount = null;

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
  render();
}

function render() {
  const snapshot = getState().snapshot ?? null;
  const { season, rows } = cropCalendar(snapshot, selectedIds());
  const advisories = farmAdvisories(rows, 4);

  clear(mount);
  mount.appendChild(el('div.page-h', null, `🌾 ${t('crop_title')}`));

  /* season banner */
  mount.appendChild(el('div.crop-season',
    el('span.crop-season-ico', { 'aria-hidden': 'true' }, season.icon),
    el('span', null, season.label),
  ));

  if (!snapshot) {
    mount.appendChild(el('div.card.pad-sm.crop-note', null, t('crop_wait_data')));
  }

  /* crop selector */
  mount.appendChild(sectionTitle(t('crop_pick')));
  const chips = el('div.chip-grid.crop-chips');
  for (const c of CROPS) {
    chips.appendChild(el(`button.chip.you-chip${selectedIds().includes(c.id) ? '.on' : ''}`, {
      type: 'button',
      'aria-pressed': String(selectedIds().includes(c.id)),
      onclick: () => toggleCrop(c.id),
    }, `${c.emoji} ${c.name[langIdx()]}`));
  }
  mount.appendChild(chips);
  mount.appendChild(el('div.crop-tiny', null, t('crop_pick_hint')));

  /* this week on the farm */
  if (advisories.length) {
    mount.appendChild(sectionTitle(t('crop_week')));
    const wrap = el('div.crop-advisories');
    for (const a of advisories) {
      wrap.appendChild(el(`div.crop-advice.insight-${a.tone === 'bad' ? 'danger' : a.tone}`,
        el('span.crop-advice-ico', { 'aria-hidden': 'true' }, a.icon),
        el('div.crop-advice-body',
          el('div.crop-advice-crop', null, `${a.crop.emoji} ${a.crop.name[langIdx()]}${statusChipText(a.status) ? ` · ${statusChipText(a.status)}` : ''}`),
          el('div.crop-advice-text', null, a.text),
        ),
      ));
    }
    mount.appendChild(wrap);
  }

  /* per-crop cards */
  mount.appendChild(sectionTitle(t('crop_calendar')));
  for (const row of rows) mount.appendChild(cropCard(row, Boolean(snapshot)));

  mount.appendChild(el('div.crop-tiny.crop-disclaimer', null, t('crop_disclaimer')));
}

const langIdx = () => (getLang() === 'hi' ? 1 : 0);

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
        el('span', { 'aria-hidden': 'true' }, f.icon),
        el('span', null, f.text),
      ));
    }
    card.appendChild(fit);
  }

  return card;
}
