/**
 * keys.js — bundled demo keys for the optional data sources.
 *
 * WHY THIS FILE EXISTS (v0.8.40): the app is a zero-config PWA — no build
 * step, no server for most users. Per-user keys (Settings) are the honest
 * long-term pattern (see IMD/Gemini), but the demo owner asked for keys
 * baked in so every device shows the full experience with zero pasting.
 *
 * REALITY: this repo is PUBLIC. Anything here is visible to everyone.
 * These keys are free-tier, zero-cost, and rotate-able in one place —
 * this file. If one starts getting abused, replace the string below and
 * redeploy; nothing else changes.
 *
 * Precedence everywhere: a per-user key from Settings (if the source
 * offers one) ALWAYS wins over the bundled demo key.
 */

export const BUNDLED_KEYS = {
  /* OpenAQ v3 — live ground-station AQI (CPCB/DPCC/UPPCB feed).
     Free key: https://openaq.org → sign up. Docs: https://docs.openaq.org */
  openaq: 'bc5b1d787c85d319a262306cf59f48189f5db8fd8679f289157cd9d6ae2965c4',

  /* NASA FIRMS — VIIRS active-fire hotspots (farm fires / stubble burning).
     Free MAP_KEY: https://firms.modaps.eosdis.nasa.gov/api/map_key/ */
  firms: '0804cba2d2c66b910d3ce4385f4e4a73',
};

/* Per-user override (Settings can always beat the demo key). */
export function openaqKey() {
  try { return String(globalThis.__mausamOpenaqKey ?? BUNDLED_KEYS.openaq); }
  catch { return BUNDLED_KEYS.openaq; }
}

export function firmsKey() {
  try { return String(globalThis.__mausamFirmsKey ?? BUNDLED_KEYS.firms); }
  catch { return BUNDLED_KEYS.firms; }
}
