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

## What v0.6 adds

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
  whenever you're not at the bottom, `/` jumps to the chat box from any
  tab and `Esc` releases it, and voice input (Web Speech API, hi-IN /
  en-IN) with a graceful no-mic fallback.
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
sw.js                 precache shell v0.6.0 + network-first API cache
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
