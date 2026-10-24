# ☁️ Mausam — weather that works like it's yours

**Live: https://harshvardhan9084.github.io/mausam-personalised**

Mausam is a zero-build, zero-account weather PWA for India. Open it and the full
dashboard is already there — current conditions with a **vs-yesterday** pill and
one-tap **share**, your **saved places** with live temperatures, a **15-minute
rain nowcast** for the next 2 hours, 48 hours, a temperature curve, the
**10-day outlook**, CPCB air quality, sun times and "Mausam Says" insights.
Personalisation is a 30-second, strictly **additive** layer on top — it never
hides or gates anything.

And **Mausam Mitra**, the chat assistant, answers like a modern AI chat:
streamed prose *plus* real UI — charts, timelines, cards and tables — rendered
progressively by a lightweight contract between the AI and the app.

---

## Why it feels like a product, not a prototype

| Old prototype | Mausam v4 |
|---|---|
| 5 hardcoded persona presets, dashboard locked to the chosen one | One generous dashboard for everyone; personal tips render **on top**, never instead |
| Forced multi-step onboarding before seeing anything | Data first, always. A dismissible nudge invites the optional profile |
| Rule-based "chatbot" returning canned text | Real streaming AI that **decides presentation**: text when text is enough, rich cards when they help |

## The three pillars

### 1. Generous by default
Open the app → New Delhi (or your saved city) is already fully populated:
hero (with a "2° warmer than yesterday" pill and a share button), your places
rail (auto-remembered cities with live temps, one-tap switch, one-tap forget),
a 15-minute rain nowcast for the next 2 hours ("rain likely around 6:45 PM"),
a 48-hour strip, SVG temperature curve, 10-day outlook, detailed stats
(humidity, wind/gusts, UV, visibility, pressure, dew, cloud), CPCB AQI with
dominant pollutant, sunrise/sunset/daylight, and insight cards computed from
real scoring models.

### 2. Optional, additive personalisation ("For You")
Tap **✨ For you** → name, commute times, activities, sensitivities — saved to
`localStorage`, no account. The dashboard then gains a "For you" rail:
commute verdicts, best hours for your activities, laundry advice and
sensitivity callouts. Skip it and nothing changes. Reset any time.

### 3. An AI that shows, not just tells — the MausamUI contract
The assistant may embed UI inside its streamed reply using a fenced block:

~~~
```mausam-ui
{"v":1,"c":"temp-chart","t":"Temperature — next 24 hours",
 "d":{"labels":["12 AM","9 AM","6 PM"],"temps":[24,31,28],"feels":[23,33,29],"unit":"°C"}}
```
~~~

- **AI decides** — the system prompt instructs text-first, visuals when they
  genuinely communicate better (≤3 cards per reply, numbers must come from data)
- **Tools provide data** — `get_city_weather`, `get_next_hours`, `compare_days`
  (native function-calling on Gemini); every answer is grounded in the live snapshot
- **Frontend renders** — `src/ai/render.js` maps ~15 whitelisted component types
  (`now-card`, `hourly-timeline`, `temp-chart`, `rain-bars`, `daily-list`,
  `metrics-grid`, `advice`, `alert`, `compare-table`, `window-card`, `aqi-card`,
  `sun-card`, `wear-list`, `chips`, `note`) to the app's design system. Built with
  a DOM helper, never `innerHTML` — AI strings cannot inject markup
- **Errors degrade gracefully** — malformed JSON, unknown types or bad payloads
  render as readable fallback cards; the chat itself never breaks

## AI providers (pick in ⚙️ Settings)

| Provider | Where it works | Key needed | Notes |
|---|---|---|---|
| **Z.ai (preview)** | this repo's web-dev preview (`node server.mjs`) | none | `/api/chat` proxies to the backend-only `z-ai-web-dev-sdk` |
| **Gemini** | anywhere (GitHub Pages included) | your own free key, pasted in Settings | default model **`gemini-3.5-flash-lite`**, editable; key lives in your browser only, streams via SSE with function-calling |
| **Mausam Core** | everywhere, always | none | on-device engine: intents → the same tools & the same MausamUI cards. The zero-config default and the graceful fallback |

`Auto` (default) uses Z.ai when the preview endpoint is present, then Gemini if
a key is set, then Mausam Core — with honest labels under every answer, a stop
button, retry chips and provider-aware error cards ("bad key → open settings",
"model not found → pick another", rate limits, timeouts…).

## Weather data

- **Base**: [Open-Meteo](https://open-meteo.com) (no key, CORS, CC-BY 4.0) — forecast + air quality + geocoding
- **IMD official enrichment (optional)**: paste a free [api.imd.gov.in](https://api.imd.gov.in) key in
  Settings → the app merges the India Meteorological Department's official 7-day city
  forecast, observations and moon times (nearest station via their catalogue), clearly
  labelled in the header pill and an "IMD official forecast" card. IMD failures never
  block the app; the source pill always tells the truth.
- **AQI**: CPCB (India) breakpoints computed on-device from Open-Meteo pollutant data

## Run it

```bash
# static (what GitHub Pages serves)
npx serve .            # or any static file server

# dev / preview with the built-in Z.ai assistant
npm i z-ai-web-dev-sdk   # workspace root or repo root
node server.mjs          # → http://localhost:3000 (static + /api/chat)
```

## Architecture

```
index.html                 shell + sheets (search / settings / for-you)
sw.js                      PWA: precache shell, network-first APIs
server.mjs                 preview server: static + /api/chat (Z.ai SDK)
src/
  main.js                  boot: location → loadWeather → dashboard → chat
  api/open-meteo.js        forecast + AQ + geocoding (retry/429-aware)
  api/imd.js               official IMD gateway client (x-api-key, typed errors)
  api/wmo.js               WMO code → label/icon
  core/engine.js           snapshot builder (AQI, heat index, day/night)
  core/scoring.js          run / event / drive / day scoring models
  core/insights.js         alerts + "Mausam Says" + For You (additive)
  core/aqi-cpcb.js         official CPCB AQI maths
  core/storage.js          localStorage wrapper
  ai/contract.js           the MausamUI wire contract + validators
  ai/prompt.js             system prompt + compact live-data snapshot
  ai/tools.js              get_city_weather / get_next_hours / compare_days
  ai/gemini.js             SSE streaming + function-calling loop
  ai/zai.js                preview provider (same-origin /api/chat)
  ai/offline.js            Mausam Core on-device engine
  ai/client.js             provider resolution + event pump + fence parser
  ai/render.js             component registry → DOM (charts/tables/cards)
  chat/ui.js               streaming chat panel
  ui/*                     header, dashboard, settings, you, shared
  utils/dom.js             hyperscript el() (XSS-safe by construction)
  utils/format.js          units, heat index, labels
```

## Privacy

No accounts, no analytics, no tracking. Your Gemini/IMD keys and personalisation
live in your browser's `localStorage`. The Gemini key is sent only to Google's
API; the IMD key only to IMD's gateway.

## Credits & disclaimer

Data: [Open-Meteo](https://open-meteo.com) (CC-BY 4.0) · Official data:
[IMD](https://mausam.imd.gov.in) / [api.imd.gov.in](https://api.imd.gov.in) ·
AQI standard: [CPCB](https://cpcb.nic.in/) · Geocoding: Open-Meteo & OpenStreetMap.
Mausam is an independent open-source project and is **not** affiliated with IMD or CPCB.
Weather is probabilistic — for life-safety decisions always follow official IMD bulletins.

MIT © harshvardhan9084
