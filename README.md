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
          sun & moon, sea & coast, river watch, Mausam Says
Radar     live rain radar — animated RainViewer frames over Leaflet
Mitra     the AI: streamed prose + rich UI cards, Hinglish welcome
You       the volatile profile: packs, 20+ interest chips, custom
          tags, day shape, sensitivities, tone — editable any time
Settings  language, units, clock, theme, 9 accent colours, AI
          provider, IMD key, alerts, data saver, export / import
```

## What v0.5 adds

- **Live rain radar** (Radar tab): RainViewer's public frames animated over a
  Leaflet map — dark/light basemaps, one-tap locate, lazy-loaded, data-saver aware.
- **A profile that is custom and volatile**: one-tap starter packs (Farmer,
  Student, Home & family, Wedding season, Fitness, Traveller, Street business,
  Elder care), 20+ interest chips, **your own free-text tags**, a daily schedule
  (wake / step out / return / bed) that drives personal verdicts, sensitivities,
  and Mitra's tone (Simple / Detailed / Fun & filmy). Change anything, any time —
  the app reshapes instantly.
- **New data, all keyless**: river discharge (flood-api), sea waves (marine-api),
  "this week last year" (archive-api), soil moisture & temperature + ET₀,
  dust and aerosols in the air block.
- **New feed modules**: *Your day, hour by hour* timeline, farm weather
  (spray windows, soil, 7-day rain), sea & coast, river watch (only when
  abnormal), AQI card with pollutant chips + 24 h trend, ⭐ best-day marker.
- **Hindi UI**: the whole chrome switches English ↔ हिंदी instantly; dates and
  days follow the locale. Mitra replies in English / हिंदी / Hinglish (auto or forced).
- **Smarter Mitra**: time-and-date aware, full profile context, soil + dust +
  extras in the data block, two new tools (`get_city_air`, `find_best_days`),
  longer structured answers, and the leak-proof MausamUI stream parser (fuzz-tested).
- **Tier-2 considerations**: Data saver mode (fewer background calls, radar on
  demand), notifications for heavy rain / dangerous heat / severe air while the
  app is open, data export & import for moving phones, 9 accent colours.

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
  (546-check fuzz suite: `scripts/test_parser_v4.mjs`)

## AI providers

| Provider | When | Notes |
|---|---|---|
| Z.ai preview | inside the web-dev preview (`/api/chat`) | zero config |
| Gemini | user pastes their own key (Settings) | default model `gemini-3.5-flash-lite`; key stays in the browser |
| Mausam Core | always available fallback | on-device intent engine, needs nothing |

## Data sources (all keyless unless noted)

- [Open-Meteo](https://open-meteo.com) forecast / air quality / geocoding / flood / marine / archive (CC-BY 4.0)
- [RainViewer](https://www.rainviewer.com) public radar frames
- [OpenStreetMap](https://www.openstreetmap.org/copyright) + CARTO basemaps via [Leaflet](https://leafletjs.com)
- [BigDataCloud](https://www.bigdatacloud.net) / Nominatim reverse geocoding for GPS naming
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
src/main.js           router, boot, load pipeline, notifications
src/core/             storage (localStorage) · i18n (en/hi) · profile
                      engine (snapshot) · insights (alerts/For-You/farm)
                      scoring (run/event/drive/field/day) · aqi-cpcb
src/api/              open-meteo (forecast+air+geocode) · extras
                      (flood/marine/archive) · imd (optional) · wmo codes
src/ui/               dash · radar (Leaflet) · mitra (chat page)
                      you (profile) · settings · header · places · shared
src/ai/               prompt · contract · render (stream parser)
                      tools · gemini · zai · offline (Mausam Core) · client
src/styles/           tokens · base · layout · components · app (nav/pages)
sw.js                 precache shell v0.5.0 + network-first API cache
```

## Privacy

No accounts, no analytics, no tracking. Your profile, places and API keys
live in `localStorage` on your device. The Gemini key you paste is sent only
to Google's API. Export/import your data as a JSON file any time.

## Credits & disclaimer

Built as an independent open-source project (MIT). Not affiliated with IMD,
CPCB, Open-Meteo, RainViewer or Google. Weather is probabilistic — for
life-critical decisions always follow official IMD warnings.
