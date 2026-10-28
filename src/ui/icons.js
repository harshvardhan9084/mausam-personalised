/**
 * icons.js — crisp inline SVG chrome icons (v0.7).
 *
 * Production rule: chrome (nav, buttons, actions) uses stroke SVG icons
 * that inherit currentColor, so they theme, scale and align consistently.
 * Content weather glyphs stay emoji on purpose — warmth where it helps.
 * All strings below are static constants (never user input).
 */

const S = (body, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

const PATHS = {
  home: S('<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  crops: S('<path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>'),
  chat: S('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>'),
  you: S('<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>'),
  settings: S('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
  refresh: S('<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>'),
  pin: S('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'),
  chevron: S('<path d="m6 9 6 6 6-6"/>'),
  search: S('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
  share: S('<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>'),
  send: S('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>'),
  stop: S('<rect width="12" height="12" x="6" y="6" rx="2" fill="currentColor" stroke="none"/>'),
  copy: S('<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
  close: S('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  mic: S('<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>'),
  arrowDown: S('<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>'),
  history: S('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>'),
  broom: S('<path d="m19 36 3.5-7.5"/><path d="M13 21h9"/>'),
  scale: S('<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>'),
  route: S('<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>'),
  listen: S('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>'),
  clock: S('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
  thermo: S('<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>'),
  /* sun/moon calendar glyphs (v0.8.9) — static, for kv rows (sun & moon card,
     10-day detail grid). Same stroke language as the SKY set. */
  sunrise: S('<path d="M12 11V6"/><path d="M9.5 8.5 12 6l2.5 2.5"/><path d="M7 20a5 5 0 0 1 10 0"/><path d="M3 20h18"/>'),
  sunset: S('<path d="M12 6v5"/><path d="M9.5 8.5 12 11l2.5-2.5"/><path d="M7 20a5 5 0 0 1 10 0"/><path d="M3 20h18"/>'),
  moon: S('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
  hourglass: S('<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 1 17 6.172V2"/>'),
  droplet: S('<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>'),
  wind: S('<path d="M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>'),
  /* v0.8.10 — advice/tip glyphs: every insight, alert, For-You and farm card
     icon comes from this language (see tipIcon below) so the advice surfaces
     match the hero's stroke-SVG system instead of raw Android emoji. */
  trend: S('<path d="M3 20h18"/><path d="M7 16v-4"/><path d="M12 16V8"/><path d="M17 16V5"/>'),
  calendar: S('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M3 10h18"/>'),
  calcheck: S('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="m9 15 2 2 4-4"/>'),
  umbrella: S('<path d="M22 12a10 10 0 0 0-20 0Z"/><path d="M12 12v7a2 2 0 0 0 4 0"/><path d="M12 2v1"/>'),
  scooter: S('<circle cx="5.5" cy="17.5" r="2.5"/><circle cx="18.5" cy="17.5" r="2.5"/><path d="M8 17.5h8"/><path d="M5.5 17.5 8.5 9H12"/><path d="m13 5 3.5 10"/><path d="M13 5h2"/>'),
  run: S('<circle cx="15.5" cy="4.5" r="1.8"/><path d="m12.5 9.5 2-2.5 2.5 2 2.5.5"/><path d="m12.5 9.5-2 3.5 3 2.5-1.5 5.5"/><path d="m10.5 13-3.5-1-2.5 3"/><path d="m13.5 15.5 2 2.5.5 2.5"/>'),
  walk: S('<circle cx="13" cy="4.5" r="1.8"/><path d="m12 8-1.5 4L13 15l-1 6"/><path d="m10.5 12-3 1.5L6 17"/><path d="m13 15 2.5 1 1 3.5"/><path d="M12 8 9.5 9.5"/>'),
  bike: S('<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>'),
  basket: S('<path d="M5 11h14l-1.4 7.5a2 2 0 0 1-2 1.5H8.4a2 2 0 0 1-2-1.5Z"/><path d="M8 11l2-6"/><path d="m16 11-2-6"/><path d="M3.5 11h17"/><path d="M9.5 15v2"/><path d="M14.5 15v2"/>'),
  cricket: S('<path d="m5 19-1-1L14.5 7.5l3 3L7 21l-2-2Z"/><circle cx="19.5" cy="4.5" r="2"/>'),
  camera: S('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/>'),
  diya: S('<path d="M12 3c2.3 2.8 3.5 4.7 3.5 6.8a3.5 3.5 0 0 1-7 0C8.5 7.7 9.7 5.8 12 3Z"/><path d="M5 17.5c2.2 1.4 4.7 2 7 2s4.8-.6 7-2"/><path d="M5 17.5 6.5 21h11l1.5-3.5"/>'),
  bricks: S('<rect x="3" y="5" width="18" height="6" rx="1"/><rect x="3" y="13" width="18" height="6" rx="1"/><path d="M12 5v6"/><path d="M7.5 13v6"/><path d="M16.5 13v6"/>'),
  ring: S('<circle cx="12" cy="14.5" r="6"/><path d="m9 8.5 3-4.5 3 4.5"/><path d="M9 8.5h6"/>'),
  shirt: S('<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23Z"/>'),
  fish: S('<path d="m3 3 11 12.5"/><circle cx="15.5" cy="17" r="2"/><path d="M14.2 15.6C12 17.8 8.6 18.4 5.5 17c1.6-2.8 4.4-4.4 7.4-4.2"/><path d="M15 5.5c2.5.5 4.5 2.5 5 5"/>'),
  pan: S('<circle cx="10" cy="13" r="7"/><path d="m15.3 8.7 5.2-4.2"/><circle cx="10" cy="13" r="2.2"/>'),
  scissors: S('<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>'),
  backpack: S('<path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M9 6V4a3 3 0 0 1 6 0v2"/><path d="M8 21v-5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v5"/><path d="M8 10h8"/>'),
  heart: S('<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>'),
  paw: S('<circle cx="6.5" cy="10" r="1.6"/><circle cx="10.5" cy="6.8" r="1.7"/><circle cx="15.5" cy="6.8" r="1.7"/><circle cx="19.5" cy="10" r="1.6"/><path d="M12 11.5c2.8 0 5.5 1.8 5.5 4.3 0 1.9-1.4 3.2-3.2 3.2-1 0-1.6-.4-2.3-.4s-1.3.4-2.3.4c-1.8 0-3.2-1.3-3.2-3.2 0-2.5 2.7-4.3 5.5-4.3Z"/>'),
};

/**
 * Build a chrome icon node.
 * @param {keyof PATHS} name
 * @param {string} [cls] extra class(es) on the svg
 */
export function icon(name, cls = '') {
  const tpl = document.createElement('template');
  tpl.innerHTML = (PATHS[name] ?? PATHS.home).trim();
  const svg = tpl.content.firstElementChild;
  if (cls) svg.setAttribute('class', cls);
  return svg;
}

/** Replace a node's contents with an icon (keeps the node identity). */
export function setIcon(node, name, cls = '') {
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
  node.appendChild(icon(name, cls));
}

/* ================================================================
   SKY — hero weather glyphs (v0.8.8 "Living Sky" hero).
   The dashboard hero is the product's face: emoji render wildly
   differently across Android skins, so the hero uses the same
   stroke-SVG language as chrome — crisp at any size, themeable
   via currentColor, and animatable part-by-part (rays spin, drops
   fall, bolts flicker — all in sky.css, off under reduced motion).
   Small inline glyphs elsewhere (hour rows, week cells) stay emoji
   by design — warmth where it helps, polish where it shows.
   All strings below are static constants (never user input).
================================================================ */

const SKY = {
  'clear-day':
    S('<circle cx="12" cy="12" r="4"/><g class="sky-rays"><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></g>'),
  'clear-night':
    S('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
  'cloudy':
    S('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>'),
  'partly-day':
    S('<g class="sky-mini-rays"><path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/></g><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>'),
  'partly-night':
    S('<g transform="translate(9.2 -1.6) scale(0.5)" class="sky-moon-sm"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></g><path d="M12.4 22H7a5 5 0 1 1 4.9-6H12.4a3 3 0 0 1 0 6Z" transform="translate(-0.4 -0.2)"/>'),
  fog:
    S('<path d="M17.5 15H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="M16 18H7"/><path d="M17 22H9"/>'),
  drizzle:
    S('<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><g class="sky-drops"><path d="M8 18v1"/><path d="M12 18v1"/><path d="M16 18v1"/><path d="M8 21v1"/><path d="M12 21v1"/><path d="M16 21v1"/></g>'),
  rain:
    S('<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><g class="sky-drops"><path d="M16 14v5"/><path d="M8 14v5"/><path d="M12 16v5"/></g>'),
  snow:
    S('<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><g class="sky-flakes"><path d="M8 15h.01"/><path d="M8 19h.01"/><path d="M12 17h.01"/><path d="M12 21h.01"/><path d="M16 15h.01"/><path d="M16 19h.01"/></g>'),
  storm:
    S('<path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973"/><path class="sky-bolt" d="m13 12-3 5h4l-3 5"/>'),
};

/**
 * Hero weather glyph node (decorative; condition text carries meaning).
 * Also used at small sizes (hour strip, 10-day rows, week cells) since
 * v0.8.9 "one visual language" — the svg carries data-wx={bucket} so CSS
 * can tint per sky; part animations stay scoped to .sky-glyph (hero), so
 * small glyphs are static (no 48× infinite animations on a phone).
 */
export function skyIcon(bucket, cls = '') {
  const tpl = document.createElement('template');
  tpl.innerHTML = (SKY[bucket] ?? SKY.cloudy).trim();
  const svg = tpl.content.firstElementChild;
  svg.setAttribute('data-wx', SKY[bucket] ? bucket : 'cloudy');
  if (cls) svg.setAttribute('class', cls);
  return svg;
}

/**
 * Small weather glyph for data rows — folds code + day/night via skyBucket
 * (imported lazily by callers, who pass the bucket). Falls back to the
 * neutral cloud; a missing code still renders the glyph, never '·'.
 */
export function wxGlyph(bucket, cls = 'wx-ico') {
  return skyIcon(bucket, cls);
}

/* ================================================================
   TIP — advice glyph resolver (v0.8.10).
   Insight / alert / For-You / farm cards used to carry raw emoji, which
   every Android skin draws differently — the last big "generated vs
   designed" tell. tipIcon(key) resolves an advice key to the SAME
   stroke-SVG language as the hero: weather keys reuse the SKY set,
   everything else lives in PATHS. Returns null for unknown keys so
   callers fall back to the emoji (never a broken empty chip).
================================================================ */

/* weather-ish advice keys → SKY buckets (static small glyphs) */
const TIP_WX = {
  rain: 'rain', storm: 'storm', drizzle: 'drizzle', fog: 'fog',
  snow: 'snow', sun: 'clear-day', moon: 'clear-night',
  cloud: 'cloudy', partly: 'partly-day',
};

export function tipIcon(key, cls = 'tip-svg') {
  if (typeof key !== 'string' || !key) return null;
  const bucket = TIP_WX[key];
  if (bucket) return skyIcon(bucket, cls);
  if (PATHS[key]) return icon(key, cls);
  return null; // caller falls back to the legacy emoji
}
