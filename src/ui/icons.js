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
  thermo: S('<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>'),
  droplet: S('<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>'),
  wind: S('<path d="M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>'),
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

/** Hero weather glyph node (decorative; condition text carries meaning). */
export function skyIcon(bucket, cls = '') {
  const tpl = document.createElement('template');
  tpl.innerHTML = (SKY[bucket] ?? SKY.cloudy).trim();
  const svg = tpl.content.firstElementChild;
  if (cls) svg.setAttribute('class', cls);
  return svg;
}
