# ☁️ Mausam — Personalised Weather Dashboards

**One forecast, five points of view.** Mausam takes live weather data and answers the
question each person actually has: *when should I run, is my commute safe, should I
irrigate today, what do I pack, and can we host the event outdoors?*

> Built as a rethink of the SIH 2026 (Problem 26076) concept — the original mock-only
> MVP has been rebuilt into a real, fully client-side application on live data.

![Mausam](icons/icon-512.png)

---

## ✨ What makes it real

| | The old MVP | Mausam now |
|---|---|---|
| Data | Hardcoded Ghaziabad numbers | **Live Open-Meteo** forecast + air quality |
| AQI | Fixed string "196 Unhealthy" | **CPCB India AQI** computed from PM2.5/PM10/NO₂/SO₂/CO/O₃/NH₃ |
| Cities | Ghaziabad only | **Any city on Earth** (geocoding search) |
| Advisories | Static sentences | **Computed by a rules engine** from real hourly data |
| Offline | Nothing | **Installable PWA** — service worker + cached forecasts |
| Architecture | 2 global-soup scripts | **19 ES modules** with clear separation of concerns |

## 🧑‍🤝‍🧑 The five personas

| Persona | What the engine computes |
|---|---|
| 🏃 **Outdoor Fitness** | Best 2-hour run windows, hourly run score (heat + UV + rain + AQI), avoid-window detection, auto gear checklist (N95 / sunscreen / rain jacket), best training days |
| 🚗 **Commuter** | Morning (07–10) & evening (17–20) window risk from real visibility, rain probability, gusts and fog codes; mode recommendation; tonight's fog warning |
| 🌾 **Agriculture** | Irrigation plan from **real soil moisture** + 7-day precipitation sums, fungal-blight risk from humidity/temperature band, frost alert, best fieldwork hours |
| ✈️ **Traveler** | Auto-generated packing list, best/worst travel day, **live weather cards for saved destinations** (add/remove any city) |
| 🎉 **Event Planner** | Outdoor-suitability score, three best time windows, best/worst day of the week, full comfort breakdown (temp, humidity, wind, rain, UV, AQI) |

## 🏗 Architecture

Zero dependencies, zero build step. Native ES modules only.

```
mausam-personalised/
├── index.html                  # App shell (semantic, a11y, PWA meta)
├── manifest.webmanifest        # Installable PWA manifest
├── sw.js                       # Service worker: SWR shell + network-first API cache
├── icons/                      # Generated PNG icons + SVG favicon
└── src/
    ├── main.js                 # Bootstrap, routing, caching, auto-refresh
    ├── styles/                 # tokens → base → layout → components
    ├── api/
    │   ├── open-meteo.js       # Forecast + air-quality + geocoding client (retry, abort)
    │   └── wmo.js              # WMO weather-code → label/icon/compass
    ├── core/
    │   ├── aqi-cpcb.js         # Official CPCB AQI breakpoints + sub-index math
    │   ├── scoring.js          # run / event / drive / field / day scoring models
    │   ├── engine.js           # Persona advisory engine (the brain)
    │   ├── personas.js         # Persona registry
    │   └── storage.js          # Namespaced localStorage wrapper (offline state)
    ├── ui/
    │   ├── header.js           # Brand, persona badge, city search, settings
    │   ├── persona-picker.js   # Selection screen + switch modal
    │   ├── shared.js           # Hero, strips, cards, badges, error/skeleton states
    │   └── dashboards/         # fitness · commuter · agriculture · traveler · event
    └── utils/                  # dom (hyperscript el) · format (units, heat index)
```

**Data flow:** `fetchWeatherBundle()` → `buildSnapshot()` (enriches hours with CPCB AQI,
heat index, night flag) → persona advisor → dashboard renderer.

## 🔢 The scoring models

Every dashboard number is derived, never invented:

- **Run score** — apparent-temperature comfort window (8–28 °C), humidity ramp, UV
  penalty (≥ 6), rain probability and a CPCB-AQI breathing penalty (≥ 100).
- **Event score** — rain-dominant weighting, then feels-like window (17–30 °C), UV,
  wind gusts (≥ 30 km/h) and humidity.
- **Drive score** — visibility bands (< 400 m severe), precipitation, gusts, plus
  explicit fog/thunderstorm WMO codes.
- **Day score** — event model applied to daily aggregates; powers "best day" claims.
- **CPCB AQI** — sub-index per pollutant via linear interpolation on the official
  breakpoint table; overall AQI = max sub-index; dominant pollutant reported.

## 🚀 Run it

```bash
# any static server works
npx serve .            # or: python3 -m http.server
```

Open `http://localhost:3000`. That's it — no install, no build.

### Deploy

GitHub Pages is wired via **`.github/workflows/deploy.yml`** — push to `main` and the
site deploys automatically (Settings → Pages → Source: GitHub Actions). Any static
host (Netlify, Vercel, Cloudflare Pages) works with zero config.

## 📡 Data sources & credits

- **[Open-Meteo](https://open-meteo.com/)** — forecast, soil moisture, air quality,
  geocoding (free, no API key, CC-BY 4.0). Offered with gratitude.
- **[CPCB](https://cpcb.nic.in/)** — National Air Quality Index breakpoints (2014),
  computed client-side from Open-Meteo pollutant concentrations.

## ⚠️ Disclaimer

Mausam is an independent open-source project and is **not affiliated with the India
Meteorological Department (IMD)** or CPCB. Model data (Open-Meteo) is not a substitute
for official IMD nowcasts or CPCB station measurements — always verify critical
agricultural, aviation or health decisions against official sources.

## 📄 License

[MIT](LICENSE) © harsh vardhan
