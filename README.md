# ☁️ Mausam — Your Weather, Your Profile

**Not a weather app. Your weather app.** Mausam builds a personal profile in 60
seconds — no account — and turns raw forecast data into decisions: *when should I
run, what should I wear, will it rain on my commute, should I irrigate today, what
do I pack for Shimla?* And when you'd rather just ask, **Mausam Mitra** — the
built-in weather assistant — answers with real cards built from live data, not links.

> Born from the SIH 2026 (Problem 26076) concept. v1 replaced the mock-only MVP
> with live data; **v2 replaces the five hardcoded persona presets with real,
> user-created profiles, official IMD integration and a data-aware chatbot.**

![Mausam](icons/icon-512.png)

---

## ✨ What's new in v2

| | v1 (prototype) | v2 (product) |
|---|---|---|
| Profiles | 5 hardcoded presets | **User-built profiles** via onboarding — name, avatar, accent, home city, focus lens, sensitivities |
| Identity | Persona only | **Multi-profile** — every family member gets their own view, switch in one tap |
| Personalisation | Same thresholds for all | **Sensitivity-tuned alerts** — heat/cold/rain/air-sensitive users get warned earlier |
| Data | Open-Meteo only | **Open-Meteo + official IMD** (7-day city forecast, observations, moon times) via free API key |
| Assistant | — | **Mausam Mitra**: context- & data-aware chatbot, component-driven answers, full error handling |
| First run | Persona picker | **Guided onboarding wizard** with a personal watch-list preview |

## 🧑‍🤝‍🧑 Profiles, not accounts

Everything personal stays in `localStorage` on your device. A profile is:

- **Name + avatar + accent colour** — yours, visually
- **Home city** — anchors every forecast; you can still check anywhere
- **Focus lens** — what the dashboard optimises for: 🏃 fitness · 🚗 commute ·
  🌾 farming · ✈️ travel · 🎉 events (the old presets, now *starting points*)
- **Sensitivities** — 🥵 heat · 🥶 cold · ☔ rain · 😷 air quality — these shift
  alert thresholds (a rain-sensitive user gets umbrella warnings from 40% instead
  of 55%; an air-sensitive user gets mask advice from AQI 100 instead of 150)

Create, edit, switch or delete profiles anytime from the header badge or Settings.

## 🌦 Mausam Mitra — the assistant

A weather-only chatbot that answers from the **same engine the dashboards use**:

- **Data-aware** — every number comes from the live snapshot: rain timing by the
  hour, CPCB AQI, UV, sunrise/sunset, best run/commute/event windows, irrigation
  calls, packing lists
- **Context-aware** — knows your profile, your sensitivities, the time of day,
  the conversation ("*and tomorrow?*", "*what about the evening?*") and other
  cities ("*weather in Shimla*" fetches live, your home stays untouched)
- **Component-driven** — answers are composed of cards: mini current-conditions,
  hourly rain timeline, rated time windows, 7-day strip, AQI badge, packing lists,
  profile card, quick-reply chips
- **Hinglish-friendly** — "*baarish?*", "*garmi kitni?*", "*kal shaam*"
- **Honest error handling** — offline banner, retry chips on failed fetches,
  "I'm a weather-only assistant" fallbacks with did-you-mean suggestions, and it
  never invents a number it doesn't have

## 📡 Data sources

| Source | What it provides | Key needed |
|---|---|---|
| [Open-Meteo](https://open-meteo.com/) | Forecast (7-day, hourly 36 h), air quality, geocoding | No |
| [IMD — api.imd.gov.in](https://api.imd.gov.in) | Official 7-day city forecast text, observations (max/min, 24 h rain, RH), sunrise/sunset & moon times | Free key — register → Dashboard → API key |
| [CPCB](https://cpcb.nic.in/) | National AQI breakpoints — computed client-side from pollutant concentrations | — |
| [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/) | Reverse geocoding for "use my location" during onboarding | No |

**IMD is an optional enrichment layer.** Paste your free key in Settings →
"IMD official data", hit *Test connection*, and the app merges official IMD
data (badge shows `IMD + Open-Meteo`). The test reports exactly what's wrong if
anything fails — rejected key, CORS block, rate limit. Without a key, everything
works on Open-Meteo and nothing blocks.

## 🏗 Architecture

Zero dependencies, zero build step. Native ES modules only — ~28 modules.

```
mausam-personalised/
├── index.html                  # App shell: profiles · onboarding · dashboard · modals
├── manifest.webmanifest        # Installable PWA
├── sw.js                       # Service worker: SWR shell + network-first API cache
├── icons/                      # Generated PNG icons + SVG favicon
└── src/
    ├── main.js                 # Boot, profile routing, IMD enrichment, chat wiring
    ├── styles/                 # tokens · base · layout · components · plus · onboarding · chat
    ├── api/
    │   ├── open-meteo.js       # Forecast + air quality + geocoding (retry, abort)
    │   ├── imd.js              # Official IMD gateway client (x-api-key, station matching,
    │   │                       #   typed error diagnostics: auth/cors/network/http/shape)
    │   └── wmo.js              # WMO weather-code → label/icon
    ├── core/
    │   ├── aqi-cpcb.js         # Official CPCB AQI breakpoints + sub-index math
    │   ├── scoring.js          # run / event / drive / field / day scoring models
    │   ├── engine.js           # Lens advisory engine
    │   ├── profiles.js         # User profiles: model, validation, CRUD, legacy migration
    │   ├── personalise.js      # Sensitivity thresholds, greetings, personal alerts
    │   ├── personas.js         # Lens registry (visual metadata)
    │   └── storage.js          # Namespaced localStorage wrapper (offline state)
    ├── ui/
    │   ├── onboarding.js       # 5-step profile wizard (create / edit / first-run)
    │   ├── profile-manager.js  # Profile grid + switch modal
    │   ├── header.js           # Brand, profile badge, city search, settings, IMD key
    │   ├── shared.js           # Hero, strips, cards, badges, error/skeleton states
    │   └── dashboards/         # fitness · commuter · agriculture · traveler · event
    ├── chat/
    │   ├── nlu.js              # Intent classification + entity extraction (day/time/place)
    │   ├── brain.js            # Data-aware answer builder (reuses engine maths)
    │   ├── components.js       # Chat card renderers
    │   └── ui.js               # Panel, composer, typing, error handling, history
    └── utils/                  # dom (hyperscript el) · format (units, heat index)
```

**Data flow:** `fetchWeatherBundle()` → optional `fetchImdBundle()` merge →
`buildSnapshot()` (enriches hours with CPCB AQI, heat index, night flag) →
lens advisor + `personalise.js` → dashboard. The chatbot reads the same
snapshot through `brain.js`, so dashboard and assistant never disagree.

## 🚀 Run it

```bash
# any static server works
npx serve .            # or: python3 -m http.server
```

Open the printed URL. No install, no build.

### Deploy

Static hosting only — zero config on **GitHub Pages** (Settings → Pages →
Deploy from branch → `main` / root), Netlify, Vercel or Cloudflare Pages.
The service worker makes it installable and offline-capable.

## 🔢 The scoring models

Every number is derived, never invented:

- **Run score** — apparent-temperature comfort window (8–28 °C), humidity ramp,
  UV penalty (≥ 6), rain probability, CPCB-AQI breathing penalty (≥ 100)
- **Event score** — rain-dominant weighting, then feels-like (17–30 °C), UV,
  gusts (≥ 30 km/h), humidity
- **Drive score** — visibility bands (< 400 m severe), precipitation, gusts,
  explicit fog/thunderstorm WMO codes
- **Day score** — event model on daily aggregates; powers "best day" claims
- **CPCB AQI** — sub-index per pollutant via linear interpolation on official
  breakpoints; overall AQI = max sub-index; dominant pollutant reported

## ⚠️ Disclaimer

Mausam is an independent open-source project and is **not affiliated with the
India Meteorological Department (IMD)** or CPCB; IMD data is used via the
official public API with a user-supplied key and proper attribution. Model data
(Open-Meteo) is not a substitute for official IMD nowcasts or CPCB station
measurements — always verify critical agricultural, aviation or health decisions
against official sources.

## 📄 License

[MIT](LICENSE) © harsh vardhan
