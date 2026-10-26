# ☁️ Mausam — weather that works like it's yours

**Live: https://harshvardhan9084.github.io/mausam-personalised**

Mausam is a zero-build, zero-account, **mobile-first** weather product for
India — built for tier-2 users of every age, gender and occupation. Five
pages, one bottom nav, English **and हिंदी**, and an AI assistant that
answers with real charts and cards. No sign-up, no tracking, everything
personal stays on the device.

```
Home      the generous feed: hero, rain nowcast, your-day timeline,
          For-You rail, 48 h, curve, 10-day, farm weather, AQI,
          sun & moon, sea & coast, river watch, compare & journey tools
Crops     the crop calendar engine: sowing windows, growth stages,
          harvest timing + live weather-fit for 14 major Indian crops
Mitra     the AI: streamed prose + rich UI cards, Hinglish welcome,
          persistent chat history, voice input, / to focus · Esc to leave
You       the volatile profile: packs, 20+ interest chips, custom
          tags, day shape, sensitivities, tone — editable any time
Settings  language, units, clock, theme, 9 accent colours, AI
          provider, IMD key, alerts, data saver, install, export / import
```

## What v0.8 adds — measured polish

A live audit (phone-size viewports, screen readers, real chat turns) drove
this round: fix what phones actually feel.

- **Chrome heights are measured, not guessed** — the header (two rows on
  old two-row layouts, one row now) and bottom nav are observed with a
  `ResizeObserver` and published as `--header-h` / `--nav-h`, so the Mitra
  composer, page bottom padding, FABs and pull-to-refresh offsets are
  pixel-exact on every device — including font-scaling and safe areas.
  (Before: the composer could hide behind the nav bar.)
- **One-row phone header** — brand goes icon-only and the city, source
  pill and refresh share a single row, reclaiming ~36 px of content on
  every screen.
- **The hero never squeezes** — the place name owns its full row on
  phones; delta/updated pills flow below it and wrap cleanly.
- **10-day rows open a day detail** — tap any day (keyboard works too,
  `aria-expanded`) for feels-like, rain mm + chance, wind + gusts, UV and
  sunrise/sunset. Zero extra API calls.
- **Dry charts read as dry** — a 0 % rain chart in Mitra renders a visible
  flat baseline in accent tones (was: near-invisible slivers that looked
  broken); the dashboard nowcast shows an intentional "dry line · 0 mm".
- **🔊 Listen on every Mitra reply** — on-device Web Speech Synthesis
  (hi-IN / en-IN), one tap to hear, tap again to stop; silent when you
  send, switch or clear chats. Restored history replies get copy +
  listen too.
- **Share to Mausam** — PWA share target: "Share → Mausam" from any app
  pre-fills location search (maps-style URLs are parsed for the place).
- **Alerts stay dismissed** — closing an alert keeps it closed across
  re-renders and reloads for the session; genuinely new conditions
  (different title) always surface.
- **Faster first byte** — `preconnect`/`dns-prefetch` to the Open-Meteo
  origins; skip-link target is focusable; reduced-motion also disables
  smooth scrolling.

## What v0.7 added — the production pass

Every flow was rebuilt to a release standard: same features, sharper
product.

- **Chrome is real SVG now** — bottom-nav, header and action icons are
  stroke SVGs that theme with the accent (emoji stay in content cards,
  where warmth belongs). Nav taps pop; pages fade-rise; the document
  title follows the tab.
- **`/` is now a standard shortcut** — it focuses the main text field of
  whatever is on screen (the Mitra composer on Mitra, the new crop
  filter on Crops, the field of an open dialog) and never navigates
  across tabs. `Esc` releases. It was never meant to be an AI hotkey.
- **Mitra composer, properly** — auto-growing textarea (Enter sends,
  Shift+Enter adds a line), typing indicator until the first token,
  copy button on every finished reply, character counter near the cap,
  and an SVG send/stop morph.
- **10-day outlook rebuilt** — a clean range-bar list (day · icon ·
  rain % · min–max bar over the period span · values) instead of a
  cramped grid; today and the best day are highlighted.
- **Home refinements** — hero shows H/L, alerts are dismissible, the
  48 h strip scroll-snaps, pull-to-refresh on touch (with an armed
  indicator), and an "app updated → Refresh" snackbar when a new
  service worker takes over.
- **Dialogs behave** — focus is trapped and restored, `Esc` closes
  everywhere, and on phones every dialog (location search, compare,
  journey, history) presents as a bottom sheet.
- **Crops tab got a filter** (also its `/` target) — chips and cards
  narrow live without losing focus.
- **You page** — sticky save bar that follows the scroll.
- **Settings** — version badge, cleaner about.
- Accessibility: focus rings, restore-focus modals, ≥44 px touch
  targets on primary controls, `prefers-reduced-motion` honoured.

## What v0.6 added (still here)

- **Crop calendar engine** (Crops tab) — replaces the radar: pan-India
  sowing → stage → harvest calendars for 14 major crops (rice, wheat,
  maize, cotton, soybean, groundnut, bajra, mung, mustard, chickpea,
  sugarcane, potato, onion, tomato), crossed with the LIVE snapshot the
  app already holds: soil moisture bands, 7-day rain vs crop need,
  flowering heat stress, frost risk, spray windows (wind < 15 km/h),
  harvest rain risk, sowing-prep countdown. Pin your own crops; "this
  week on the farm" turns it all into 3–4 plain-language actions.
  Zero extra API calls — it reasons over data Mausam already fetched.
- **Mitra upgrades** — persistent chat history (reopen old conversations,
  cards re-render; delete one or clear all), a "scroll to latest" button
  whenever you're not at the bottom, and voice input (Web Speech API,
  hi-IN / en-IN) with a graceful no-mic fallback.
- **Compare places** — every saved place lined up side by side: current
  temp/feels, next-24 h rain chance and CPCB AQI, with quick verdicts
  (coolest / driest / cleanest). One tap from the places rail.
- **Journey weather** — origin → destination sampled into 4–6 points;
  each probed for the hour you'll actually pass it (departure: now,
  +3 h, tomorrow morning/evening). Ends with a wettest-stretch verdict.
- **Install as an app** — proper install button (Android/desktop Chrome)
  or the iOS Add-to-Home-Screen hint, plus working deep links:
  `#crops`, `#mitra`, `#you` are now real routes (PWA shortcuts too).
- **Gemini fix** — the "Function call is missing a thought_signature"
  error is fixed (thinking-model signatures are preserved through the
  tool loop; thinking summaries no longer stream into the chat; and a
  once-only no-tools fallback keeps the answer alive if Google shifts
  the contract again).
- Footer removed; RainViewer/Leaflet dependency dropped entirely.

## What v0.5 added (still here)

- **A profile that is custom and volatile**: one-tap starter packs
  (Farmer, Student, Home & family, Wedding season, Fitness, Traveller,
  Street business, Elder care), 20+ interest chips, **your own
  free-text tags**, a daily schedule (wake / step out / return / bed)
  that drives personal verdicts, sensitivities, and Mitra's tone
  (Simple / Detailed / Fun & filmy). Change anything, any time.
- **New data, all keyless**: river discharge (flood-api), sea waves
  (marine-api), "this week last year" (archive-api), soil moisture &
  temperature + ET₀, dust and aerosols in the air block.
- **Hindi UI**: the whole chrome switches English ↔ हिंदी instantly;
  Mitra replies in English / हिंदी / Hinglish (auto or forced).
- **Tier-2 considerations**: data saver mode, notifications for heavy
  rain / dangerous heat / severe air while the app is open, data export
  & import, 9 accent colours.

## The MausamUI contract (AI ↔ frontend)

The assistant may embed UI inside its streamed reply using a fenced block:

~~~
```mausam-ui
{"v":1,"c":"temp-chart","t":"Temperature — next 24 hours",
 "d":{"labels":["12 AM","9 AM","6 PM"],"temps":[24,31,28],"feels":[23,33,29],"unit":"°C"}}
```
~~~

- **AI decides** — text-first, visuals when they communicate better (≤3 cards)
- **Tools ground it** — `get_city_weather`, `get_next_hours`, `compare_days`,
  `get_city_air`, `find_best_days`; every number must come from live data
- **Frontend validates** — a strict whitelist registry coerces field drift and
  degrades malformed payloads to readable text. Raw JSON never reaches the UI
  (fuzz-tested stream parser: `scripts/test_parser_v4.mjs`)

## AI providers

| Provider | When | Notes |
|---|---|---|
| Z.ai preview | inside the web-dev preview (`/api/chat`) | zero config |
| Gemini | user pastes their own key (Settings) | default model `gemini-3.5-flash-lite`; key stays in the browser |
| Mausam Core | always available fallback | on-device intent engine, needs nothing |

## Data sources (all keyless unless noted)

- [Open-Meteo](https://open-meteo.com) forecast / air quality / geocoding / flood / marine / archive (CC-BY 4.0)
- [OpenStreetMap](https://www.openstreetmap.org/copyright) reverse geocoding for GPS naming
- IMD official enrichment — optional, user-supplied key ([api.imd.gov.in](https://api.imd.gov.in))
- CPCB AQI breakpoints computed on-device (`src/core/aqi-cpcb.js`)

## Run it

No build step — it's plain ES modules:

```bash
npm start          # node server.mjs → http://localhost:3000
```

The server also proxies `/api/chat` to the built-in Z.ai model for the preview.
Deployed on GitHub Pages: any push to `main` goes live.

## Architecture

```
index.html            5-page shell + bottom nav + search modal
src/main.js           router (+hash deep links), boot, load pipeline,
                      notifications, install prompt
src/core/             storage (localStorage + chats) · i18n (en/hi) ·
                      profile · engine (snapshot) · insights · scoring
                      · aqi-cpcb · crops (calendar engine)
src/api/              open-meteo (forecast+air+geocode) · extras
                      (flood/marine/archive) · imd (optional) · wmo codes
src/ui/               dash · crops (calendar page) · mitra (chat page:
                      history, voice, shortcuts) · explore (compare +
                      journey) · you (profile) · settings · header ·
                      places · shared
src/ai/               prompt · contract · render (stream parser)
                      tools · gemini · zai · offline (Mausam Core) · client
src/styles/           tokens · base · layout · components · app (nav,
                      pages, crops, chat, explore)
sw.js                 precache shell v0.8.0 + network-first API cache
```

## Privacy

No accounts, no analytics, no tracking. Your profile, places, chat
history and API keys live in `localStorage` on your device. The Gemini
key you paste is sent only to Google's API. Export/import your data as
a JSON file any time.

## Credits & disclaimer

Built as an independent open-source project (MIT). Not affiliated with
IMD, CPCB, Open-Meteo or Google. Weather is probabilistic — for
life-critical decisions always follow official IMD warnings; for
crop decisions confirm with your state agricultural university or
Krishi Vigyan Kendra (the crop calendar is a guide, not gospel).
