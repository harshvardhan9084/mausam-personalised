/**
 * crops.js — the Crop Calendar Engine (replaces the old rain-radar tab).
 *
 * A keyless, on-device guide for India's major crops: sowing windows,
 * growth stages, harvest timing, and a live weather-fit check built from
 * the SAME Open-Meteo snapshot the dashboard already has (soil moisture,
 * 7-day rain, day temps, wind). No new API calls, works offline, and
 * respects data-saver mode by construction.
 *
 * Baselines are pan-India averages (state agri universities vary by
 * variety and district) — the UI says so plainly. Bilingual strings live
 * here as [en, hi] pairs, resolved with getLang().
 */

import { getLang } from './i18n.js';

/* ---------------- crop database (pan-India baselines) ---------------- */

const S = (en, hi) => [en, hi];

export const CROPS = [
  {
    id: 'rice', emoji: '🌾', name: S('Rice (dhan)', 'धान'),
    sow: [[6, 15, 7, 31]], days: 130, water: 'high',
    stages: [
      { n: S('Germination', 'अंकुरण'), f: 0.08 },
      { n: S('Tillering', 'पहली बालियाँ'), f: 0.30 },
      { n: S('Stem elongation', 'तना बढ़ना'), f: 0.22 },
      { n: S('Flowering', 'फूल आना'), f: 0.12 },
      { n: S('Grain filling', 'दाना भरना'), f: 0.18 },
      { n: S('Maturity', 'पकना'), f: 0.10 },
    ],
    sowT: [20, 35], hotT: 36, coldT: 15, rainWant: 45,
  },
  {
    id: 'wheat', emoji: '🌾', name: S('Wheat (gehu)', 'गेहूँ'),
    sow: [[11, 1, 12, 15]], days: 125, water: 'med',
    stages: [
      { n: S('Germination & tillering', 'अंकुरण व बालियाँ'), f: 0.30 },
      { n: S('Jointing', 'गाँठें बनना'), f: 0.22 },
      { n: S('Boot & flowering', 'बाली व फूल'), f: 0.18 },
      { n: S('Grain filling', 'दाना भरना'), f: 0.20 },
      { n: S('Maturity', 'पकना'), f: 0.10 },
    ],
    sowT: [10, 25], hotT: 32, coldT: 4, rainWant: 20,
  },
  {
    id: 'maize', emoji: '🌽', name: S('Maize (makka)', 'मक्का'),
    sow: [[6, 15, 7, 15]], days: 100, water: 'med',
    stages: [
      { n: S('Germination', 'अंकुरण'), f: 0.08 },
      { n: S('Vegetative', 'पत्तियाँ बढ़ना'), f: 0.42 },
      { n: S('Tasseling & silk', 'गुटका व रेशम'), f: 0.15 },
      { n: S('Grain filling', 'दाना भरना'), f: 0.25 },
      { n: S('Maturity', 'पकना'), f: 0.10 },
    ],
    sowT: [18, 32], hotT: 35, coldT: 12, rainWant: 35,
  },
  {
    id: 'cotton', emoji: '🧵', name: S('Cotton (kapas)', 'कपास'),
    sow: [[5, 15, 6, 30]], days: 165, water: 'med',
    stages: [
      { n: S('Emergence', 'उगाव'), f: 0.10 },
      { n: S('Squaring', 'कलियाँ'), f: 0.25 },
      { n: S('Flowering', 'फूल आना'), f: 0.25 },
      { n: S('Boll development', 'डोडे बनना'), f: 0.25 },
      { n: S('Boll opening', 'डोडे खुलना'), f: 0.15 },
    ],
    sowT: [20, 35], hotT: 40, coldT: 14, rainWant: 30,
  },
  {
    id: 'soybean', emoji: '🫘', name: S('Soybean', 'सोयाबीन'),
    sow: [[6, 20, 7, 10]], days: 95, water: 'med',
    stages: [
      { n: S('Emergence', 'उगाव'), f: 0.10 },
      { n: S('Vegetative', 'पत्तियाँ बढ़ना'), f: 0.35 },
      { n: S('Flowering', 'फूल आना'), f: 0.20 },
      { n: S('Pod filling', 'फलियाँ भरना'), f: 0.25 },
      { n: S('Maturity', 'पकना'), f: 0.10 },
    ],
    sowT: [18, 32], hotT: 35, coldT: 14, rainWant: 35,
  },
  {
    id: 'groundnut', emoji: '🥜', name: S('Groundnut (moongphali)', 'मूंगफली'),
    sow: [[6, 20, 7, 20]], days: 110, water: 'med',
    stages: [
      { n: S('Emergence', 'उगाव'), f: 0.10 },
      { n: S('Vegetative', 'पत्तियाँ बढ़ना'), f: 0.25 },
      { n: S('Flowering & pegging', 'फूल व घुँडी'), f: 0.30 },
      { n: S('Pod development', 'फली बनना'), f: 0.25 },
      { n: S('Maturity', 'पकना'), f: 0.10 },
    ],
    sowT: [20, 33], hotT: 36, coldT: 15, rainWant: 30,
  },
  {
    id: 'bajra', emoji: '🌾', name: S('Pearl millet (bajra)', 'बाजरा'),
    sow: [[7, 1, 7, 31]], days: 80, water: 'low',
    stages: [
      { n: S('Germination', 'अंकुरण'), f: 0.08 },
      { n: S('Vegetative', 'पत्तियाँ बढ़ना'), f: 0.42 },
      { n: S('Flowering', 'फूल आना'), f: 0.15 },
      { n: S('Grain filling', 'दाना भरना'), f: 0.25 },
      { n: S('Maturity', 'पकना'), f: 0.10 },
    ],
    sowT: [20, 35], hotT: 38, coldT: 14, rainWant: 18,
  },
  {
    id: 'mung', emoji: '🫘', name: S('Green gram (mung)', 'मूंग'),
    sow: [[6, 25, 7, 15], [3, 1, 4, 10]], days: 65, water: 'low',
    stages: [
      { n: S('Emergence', 'उगाव'), f: 0.10 },
      { n: S('Vegetative', 'पत्तियाँ बढ़ना'), f: 0.30 },
      { n: S('Flowering', 'फूल आना'), f: 0.22 },
      { n: S('Pod filling', 'फलियाँ भरना'), f: 0.26 },
      { n: S('Maturity', 'पकना'), f: 0.12 },
    ],
    sowT: [20, 35], hotT: 38, coldT: 16, rainWant: 20,
  },
  {
    id: 'mustard', emoji: '🌼', name: S('Mustard (sarson)', 'सरसों'),
    sow: [[10, 10, 11, 15]], days: 110, water: 'low',
    stages: [
      { n: S('Emergence', 'उगाव'), f: 0.08 },
      { n: S('Rosette', 'गुल्म बनना'), f: 0.30 },
      { n: S('Flowering', 'फूल आना'), f: 0.25 },
      { n: S('Pod development', 'फली बनना'), f: 0.24 },
      { n: S('Maturity', 'पकना'), f: 0.13 },
    ],
    sowT: [12, 26], hotT: 30, coldT: 6, rainWant: 12,
  },
  {
    id: 'chickpea', emoji: '🫛', name: S('Chickpea (chana)', 'चना'),
    sow: [[10, 15, 11, 20]], days: 105, water: 'low',
    stages: [
      { n: S('Emergence', 'उगाव'), f: 0.10 },
      { n: S('Vegetative', 'पत्तियाँ बढ़ना'), f: 0.30 },
      { n: S('Flowering', 'फूल आना'), f: 0.25 },
      { n: S('Pod filling', 'फलियाँ भरना'), f: 0.25 },
      { n: S('Maturity', 'पकना'), f: 0.10 },
    ],
    sowT: [12, 27], hotT: 32, coldT: 5, rainWant: 10,
  },
  {
    id: 'sugarcane', emoji: '🎍', name: S('Sugarcane (ganna)', 'गन्ना'),
    sow: [[10, 15, 3, 15]], days: 300, water: 'high',
    stages: [
      { n: S('Germination', 'अंकुरण'), f: 0.10 },
      { n: S('Tillering', 'बालियाँ'), f: 0.22 },
      { n: S('Grand growth', 'तेज़ वृद्धि'), f: 0.45 },
      { n: S('Maturity', 'पकना'), f: 0.23 },
    ],
    sowT: [15, 32], hotT: 40, coldT: 10, rainWant: 45,
  },
  {
    id: 'potato', emoji: '🥔', name: S('Potato (aloo)', 'आलू'),
    sow: [[10, 10, 11, 30]], days: 90, water: 'med',
    stages: [
      { n: S('Sprouting', 'अंकुरण'), f: 0.12 },
      { n: S('Vegetative', 'पत्तियाँ बढ़ना'), f: 0.30 },
      { n: S('Tuber initiation', 'गांठें बनना'), f: 0.18 },
      { n: S('Tuber bulking', 'आलू बड़े होना'), f: 0.30 },
      { n: S('Maturity', 'पकना'), f: 0.10 },
    ],
    sowT: [12, 25], hotT: 28, coldT: 5, rainWant: 20,
  },
  {
    id: 'onion', emoji: '🧅', name: S('Onion (pyaz)', 'प्याज़'),
    sow: [[11, 1, 12, 15]], days: 150, water: 'med',
    stages: [
      { n: S('Nursery / sprouting', 'नर्सरी / अंकुरण'), f: 0.15 },
      { n: S('Vegetative', 'पत्तियाँ बढ़ना'), f: 0.35 },
      { n: S('Bulb initiation', 'गोला बनना'), f: 0.15 },
      { n: S('Bulb development', 'गोला बड़ा होना'), f: 0.25 },
      { n: S('Maturity', 'पकना'), f: 0.10 },
    ],
    sowT: [12, 26], hotT: 32, coldT: 8, rainWant: 15,
  },
  {
    id: 'tomato', emoji: '🍅', name: S('Tomato (tamatar)', 'टमाटर'),
    sow: [[6, 15, 7, 15], [10, 1, 11, 10]], days: 90, water: 'med',
    stages: [
      { n: S('Nursery / transplant', 'नर्सरी / रोपण'), f: 0.15 },
      { n: S('Vegetative', 'पत्तियाँ बढ़ना'), f: 0.30 },
      { n: S('Flowering', 'फूल आना'), f: 0.20 },
      { n: S('Fruit development', 'फल बनना'), f: 0.25 },
      { n: S('Harvest picking', 'तुड़ाई'), f: 0.10 },
    ],
    sowT: [15, 30], hotT: 33, coldT: 8, rainWant: 20,
  },
];

/** Suggested starter selection per season (fallback when the user hasn't chosen). */
export function seasonStarterIds(month0) {
  const m = month0 + 1;
  if (m >= 6 && m <= 8) return ['rice', 'maize', 'cotton', 'mung'];
  if (m >= 10 && m <= 12) return ['wheat', 'mustard', 'chickpea', 'potato'];
  if (m >= 1 && m <= 2) return ['wheat', 'mustard', 'chickpea', 'onion'];
  return ['mung', 'sugarcane', 'tomato', 'bajra'];
}

/* ---------------- helpers ---------------- */

const L = () => (getLang() === 'hi' ? 1 : 0);
const pick = (pair) => (pair ? pair[L()] ?? pair[0] : '');
const dayOfYear = (d) => Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const fmtDate = (d) => {
  try {
    return d.toLocaleDateString(getLang() === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' });
  } catch {
    return d.toISOString().slice(0, 10);
  }
};

/** Window for a crop occurrence starting in year `yr`: {sowStart, sowEnd}. */
function resolveWindow(w, yr) {
  const [sm, sd, em, ed] = w;
  const crosses = em < sm || (em === sm && ed < sd);
  const sowStart = new Date(yr, sm - 1, sd);
  const sowEnd = new Date(yr + (crosses ? 1 : 0), em - 1, ed);
  return sowEnd > sowStart ? { sowStart, sowEnd } : null;
}

const round1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);

/* ---------------- the engine ---------------- */

/**
 * @param {Object|null} snapshot  buildSnapshot() result (may be null → calendar only)
 * @param {string[]} selectedIds  crop ids the user pinned
 * @returns {{season: Object, rows: Array}}
 */
export function cropCalendar(snapshot, selectedIds, today = new Date()) {
  const rows = [];
  for (const crop of CROPS) {
    if (!selectedIds.includes(crop.id)) continue;

    // evaluate every window × nearby year, keep the most relevant occurrence
    let best = null;
    const rank = { sowing: 0, growing: 1, harvest: 2, off: 3 };
    for (const w of crop.sow) {
      for (const yr of [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1]) {
        const win = resolveWindow(w, yr);
        if (!win) continue;
        const { sowStart, sowEnd } = win;
        const mid = new Date((sowStart.getTime() + sowEnd.getTime()) / 2);
        const harvestAt = addDays(mid, crop.days);
        const harvestOpen = addDays(mid, Math.round(crop.days * 0.86));

        let status, progress = 0, stageIdx = 0, stageFrac = 0;
        if (today >= sowStart && today <= mid) {
          status = 'sowing';
        } else if (today > mid && today < harvestAt) {
          status = today >= harvestOpen ? 'harvest' : 'growing';
          progress = Math.min(0.99, (today - mid) / (harvestAt - mid));
          let acc = 0;
          for (let i = 0; i < crop.stages.length; i++) {
            acc += crop.stages[i].f;
            if (progress <= acc) { stageIdx = i; stageFrac = (progress - (acc - crop.stages[i].f)) / crop.stages[i].f; break; }
          }
        } else {
          status = 'off';
        }

        const cand = {
          sowStart, sowEnd, mid, harvestAt, harvestOpen,
          status, progress, stageIdx, stageFrac,
          nextSowDays: Math.ceil((sowStart - today) / 86400000),
        };

        if (!best) { best = cand; continue; }
        if (rank[status] < rank[best.status]) best = cand;
        else if (status === 'off' && best.status === 'off') {
          // prefer the soonest future sowing
          if (cand.nextSowDays >= 0 && (best.nextSowDays < 0 || cand.nextSowDays < best.nextSowDays)) best = cand;
        } else if (status === best.status && status !== 'off') {
          if (progress > best.progress) best = cand;
        }
      }
    }
    if (!best) continue;

    const row = {
      crop,
      status: best.status,
      progress: best.progress,
      stageIdx: best.stageIdx,
      stageFrac: best.stageFrac,
      sowStart: best.sowStart,
      sowEnd: best.sowEnd,
      harvestAt: best.harvestAt,
      nextSowDays: best.status === 'off' ? Math.max(1, best.nextSowDays) : 0,
      fit: [],
    };

    if (snapshot) row.fit = weatherFit(crop, row, snapshot, today);
    rows.push(row);
  }

  rows.sort((a, b) => {
    const rank = { sowing: 0, harvest: 1, growing: 2, off: 3 };
    return rank[a.status] - rank[b.status] || a.crop.sow[0][0] - b.crop.sow[0][0];
  });

  return { season: seasonInfo(today), rows };
}

function seasonInfo(today) {
  const d = dayOfYear(today);
  const jun15 = dayOfYear(new Date(today.getFullYear(), 5, 15));
  const oct31 = dayOfYear(new Date(today.getFullYear(), 9, 31));
  const nov1 = dayOfYear(new Date(today.getFullYear(), 10, 1));
  const mar31 = dayOfYear(new Date(today.getFullYear(), 2, 31));
  if (d >= jun15 && d <= oct31) {
    return { id: 'kharif', label: pick(S('Kharif season — monsoon crops', 'खरीफ़ सीज़न — मानसूनी फ़सलें')), icon: 'rain' };
  }
  if (d >= nov1 || d <= mar31) {
    return { id: 'rabi', label: pick(S('Rabi season — winter crops', 'रबी सीज़न — सर्दी की फ़सलें')), icon: 'snow' };
  }
  return { id: 'zaid', label: pick(S('Zaid season — short summer crops', 'ज़ायद सीज़न — छोटी गर्मी फ़सलें')), icon: 'sun' };
}

/**
 * Live weather-fit lines for one crop row, using the dashboard snapshot.
 * Each line: {tone:'good'|'info'|'warn'|'bad', icon, text}
 */
export function weatherFit(crop, row, snapshot, today = new Date()) {
  const fit = [];
  const days = snapshot?.days ?? [];
  const hours = snapshot?.hours ?? [];
  if (!days.length && !hours.length) return fit;

  const nowHour = hours[0] ?? {};
  const soil = nowHour.soil_moisture_0_to_1cm ?? nowHour.soil_moisture_3_to_9cm ?? null;
  const soilPct = soil != null ? Math.round(soil * 100) : null;
  const rain7 = round1(days.slice(0, 7).reduce((a, d) => a + (d.precipitation_sum ?? 0), 0));
  const maxT7 = days.slice(0, 7).map((d) => d.temp_max).filter(Number.isFinite);
  const minT7 = days.slice(0, 7).map((d) => d.temp_min).filter(Number.isFinite);
  const hotMax = maxT7.length ? Math.max(...maxT7) : null;
  const coldMin = minT7.length ? Math.min(...minT7) : null;

  /* --- sowing-window temperature sanity --- */
  if (row.status === 'sowing' && hotMax != null && coldMin != null) {
    if (hotMax > crop.sowT[1] + 3) {
      fit.push({
        tone: 'warn', icon: 'thermo',
        text: pick([
          `Sowing window is open but days reach ${Math.round(hotMax)}°C — sow in the evening, water right after.`,
          `बुवाई की खिड़की खुली है पर दिन ${Math.round(hotMax)}°C तक जाएगा — शाम को बोएँ, तुरंत पानी दें।`,
        ]),
      });
    } else if (coldMin < crop.sowT[0] - 3) {
      fit.push({
        tone: 'warn', icon: 'thermo',
        text: pick([
          `Sowing window is open but nights fall to ${Math.round(coldMin)}°C — germination will be slow; wait for a warmer spell if you can.`,
          `बुवाई की खिड़की खुली है पर रात ${Math.round(coldMin)}°C तक गिरेगी — अंकुरण धीमा होगा; हो सके तो गर्म समय की राह देखें।`,
        ]),
      });
    }
  }

  /* --- soil moisture --- */
  if (soilPct != null) {
    if (soil < 0.12) {
      fit.push({
        tone: row.status === 'sowing' ? 'warn' : 'info',
        icon: 'droplet',
        text: pick([
          `Top soil is dry (${soilPct}%). ${row.status === 'sowing' ? 'Irrigate before sowing for even germination.' : 'Irrigation looks due — check moisture at root depth.'}`,
          `ऊपरी मिट्टी सूखी है (${soilPct}%)। ${row.status === 'sowing' ? 'बुवाई से पहले सिंचाई करें — अंकुरण बराबर होगा।' : 'सिंचाई का समय लग रहा है — जड़ों में नमी जाँचें।'}`,
        ]),
      });
    } else if (soil <= 0.32) {
      fit.push({
        tone: 'good', icon: 'droplet',
        text: pick([
          `Soil moisture comfortable (${soilPct}%).`,
          `मिट्टी की नमी ठीक है (${soilPct}%)।`,
        ]),
      });
    } else {
      fit.push({
        tone: 'info', icon: 'droplet',
        text: pick([
          `Soil is wet (${soilPct}%) — hold irrigation; watch for waterlogging in the field.`,
          `मिट्टी गई है (${soilPct}%) — सिंचाई टालें; खेत में जल-थहराव से बचें।`,
        ]),
      });
    }
  }

  /* --- rain vs the crop's weekly need --- */
  if (rain7 != null) {
    const need = crop.rainWant;
    if (rain7 >= need) {
      fit.push({
        tone: 'good', icon: 'rain',
        text: pick([
          `~${rain7} mm rain expected this week — covers the crop's need (~${need} mm).`,
          `इस हफ़्ते ~${rain7} mm बारिश — फ़सल की ज़रूरत (~${need} mm) पूरी।`,
        ]),
      });
    } else if (rain7 >= need * 0.5) {
      fit.push({
        tone: 'info', icon: 'partly',
        text: pick([
          `~${rain7} mm this week — partial rain; top up with one light irrigation if soil dries.`,
          `इस हफ़्ते ~${rain7} mm — आधी-अधूरी बारिश; मिट्टी सूखी हो तो एक हल्की सिंचाई करें।`,
        ]),
      });
    } else {
      fit.push({
        tone: 'warn', icon: 'sun',
        text: pick([
          `Only ~${rain7} mm rain this week — plan irrigation (crop wants ~${need} mm).`,
          `इस हफ़्ते सिर्फ़ ~${rain7} mm बारिश — सिंचाई की योजना बनाएँ (ज़रूरत ~${need} mm)।`,
        ]),
      });
    }
  }

  /* --- heat stress (worst during flowering / grain fill) --- */
  if (hotMax != null && hotMax >= crop.hotT) {
    const flowerish = row.progress >= 0.45 && row.progress <= 0.92;
    fit.push({
      tone: flowerish ? 'bad' : 'warn', icon: 'thermo',
      text: pick([
        `Day temps hit ${Math.round(hotMax)}°C this week${flowerish ? ' — flowering / grain-fill is heat-sensitive; evening irrigation cools the field' : ' — keep soil moist and mulch where possible'}.`,
        `इस हफ़्ते दिन का तापमान ${Math.round(hotMax)}°C${flowerish ? ' — फूल/दाना भरने के समय गर्मी नुक़सान करती है; शाम को सिंचाई करें' : ' — नमी बनाए रखें, मल्चिंग करें'}।`,
      ]),
    });
  }

  /* --- cold stress (rabi crops, frost risk) --- */
  if (coldMin != null && coldMin <= crop.coldT) {
    fit.push({
      tone: coldMin <= crop.coldT - 2 ? 'bad' : 'warn', icon: 'snow',
      text: pick([
        `Nights drop to ${Math.round(coldMin)}°C — light frost possible; evening irrigation or smoking protects the crop.`,
        `रात ${Math.round(coldMin)}°C तक गिरेगी — हल्की पाला संभव; शाम की हल्की सिंचाई या धुआँ बचाव में काम आता है।`,
      ]),
    });
  }

  /* --- spray window (wind + rain in next 48h) --- */
  if (row.status === 'growing' || row.status === 'sowing') {
    const calm48 = hours.slice(0, 48).filter((h) => (h.wind_speed_10m ?? 99) < 15 && (h.precipitation_probability ?? 0) < 30);
    if (calm48.length >= 4) {
      const at = new Date(calm48[0].time);
      fit.push({
        tone: 'good', icon: 'crops',
        text: pick([
          `Spray window: ${fmtDate(at)}, around ${at.getHours() % 12 || 12} ${at.getHours() < 12 ? 'AM' : 'PM'} — wind stays < 15 km/h.`,
          `छिड़काव की खिड़की: ${fmtDate(at)}, लगभग ${at.getHours() % 12 || 12} ${at.getHours() < 12 ? 'बजे दिन' : 'बजे शाम'} — हवा 15 km/h से नीचे।`,
        ]),
      });
    } else {
      fit.push({
        tone: 'info', icon: 'crops',
        text: pick([
          'No calm spray window in 48 h (wind/rain) — hold the sprayer.',
          '48 घंटे में छिड़काव की शांत खिड़की नहीं (हवा/बारिश) — स्प्रेयर रोकें।',
        ]),
      });
    }
  }

  /* --- harvest rain risk --- */
  if (row.status === 'harvest') {
    const wet = days.slice(0, 7).filter((d) => (d.precip_prob_max ?? 0) >= 50 || (d.precipitation_sum ?? 0) >= 10);
    if (wet.length) {
      fit.push({
        tone: 'warn', icon: 'storm',
        text: pick([
          `Harvest window has ${wet.length} wet day(s) ahead — cut and dry under cover; grain discolours in rain.`,
          `कटाई के दिनों में ${wet.length} गीला दिन — काटकर छाँव में सुखाएँ; बारिश में दाना रंग बदलता है।`,
        ]),
      });
    } else {
      fit.push({
        tone: 'good', icon: 'calcheck',
        text: pick([
          'Dry harvest week ahead — good time to cut, thresh and dry.',
          'कटाई के लिए सूखा हफ़्ता — काटने, गाहने और सुखाने का सही समय।',
        ]),
      });
    }
  }

  /* --- sowing prep (next sowing within 21 days) --- */
  if (row.status === 'off' && row.nextSowDays <= 21) {
    fit.push({
      tone: 'info', icon: 'crops',
      text: pick([
        `Sowing opens in ${row.nextSowDays} day(s) — book seed, basel fertiliser and get the field ready.`,
        `${row.nextSowDays} दिन में बुवाई — बीज और खाद पहले से बुक करें, खेत तैयार करें।`,
      ]),
    });
  }

  return fit;
}

/** Top advisory lines across selected crops (for "this week on the farm"). */
export function farmAdvisories(rows, limit = 4) {
  const rank = { bad: 0, warn: 1, good: 2, info: 3 };
  const all = [];
  for (const r of rows) {
    for (const f of r.fit) all.push({ ...f, crop: r.crop, status: r.status });
  }
  all.sort((a, b) => rank[a.tone] - rank[b.tone]);
  const seen = new Set();
  const out = [];
  for (const f of all) {
    const key = f.text.slice(0, 24);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
    if (out.length >= limit) break;
  }
  return out;
}
