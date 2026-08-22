// ================================================================
// app.js — Mausam Personalized Homepage Logic — SIH MVP
// All rendering, persona detection, and state management here.
// ================================================================

// ---- App State ----
const state = {
  city: "delhi",
  persona: null   // set after persona select
};

// ---- Persona Definitions ----
const PERSONAS = {
  fitness: {
    id: "fitness",
    icon: "🏃",
    name: "Outdoor Fitness",
    desc: "Running, cycling, workouts",
    alertClass: "alert-warning",
    color: "#4f8ef7"
  },
  traveler: {
    id: "traveler",
    icon: "✈️",
    name: "Traveler",
    desc: "Flights, trips, destinations",
    alertClass: "alert-warning",
    color: "#a07af7"
  },
  commuter: {
    id: "commuter",
    icon: "🚗",
    name: "Commuter",
    desc: "Daily office commute & traffic",
    alertClass: "alert-danger",
    color: "#f78a4f"
  },
  agriculture: {
    id: "agriculture",
    icon: "🌾",
    name: "Agriculture",
    desc: "Farming, gardening, planting",
    alertClass: "alert-success",
    color: "#4caf82"
  },
  event: {
    id: "event",
    icon: "🎉",
    name: "Event Planner",
    desc: "Outdoor events & gatherings",
    alertClass: "alert-success",
    color: "#e0c03a"
  }
};

// ================================================================
// SECTION 1: AI Persona Detection (Simulated)
// Reads time-of-day as a proxy for behavioral patterns.
// In production: would use ML on search history, saved locations.
// ================================================================
function runAIDetect() {
  const hour = new Date().getHours();
  let bucket;
  if (hour >= 5  && hour < 9)  bucket = "morning_early";
  else if (hour >= 9  && hour < 12) bucket = "morning_late";
  else if (hour >= 12 && hour < 17) bucket = "afternoon";
  else if (hour >= 17 && hour < 21) bucket = "evening";
  else                               bucket = "night";

  const result  = WEATHER_DB.ai_detection[bucket];
  const persona = PERSONAS[result.top_persona];

  // Show result
  const box = document.getElementById("ai-result");
  box.style.display = "block";
  box.innerHTML = `
    <div class="ai-persona-name">${persona.icon} ${persona.name} detected</div>
    <div class="ai-conf">Confidence: <strong>${result.confidence}%</strong> &nbsp;|&nbsp; ${result.reason}</div>
    <button class="btn btn-primary" style="margin-top:10px; width:100%;"
      onclick="selectPersona('${persona.id}')">
      ✅ Use This Profile
    </button>
  `;
}

// ================================================================
// SECTION 2: Persona & City Selection
// ================================================================
function selectPersona(personaId) {
  state.persona = personaId;
  localStorage.setItem("mausam_persona", personaId);
  document.getElementById("persona-screen").style.display  = "none";
  document.getElementById("dashboard-screen").style.display = "block";
  renderDashboard();
}

function openSwitchModal() {
  document.getElementById("switch-modal").classList.add("active");
}

function closeSwitchModal() {
  document.getElementById("switch-modal").classList.remove("active");
}

function switchPersonaFromModal(personaId) {
  state.persona = personaId;
  localStorage.setItem("mausam_persona", personaId);
  closeSwitchModal();
  renderDashboard();
}

function onCityChange(val) {
  state.city = val;
  renderDashboard();
}

// ================================================================
// SECTION 3: Dashboard Renderer
// Reads state.city and state.persona → builds the whole dashboard
// ================================================================
function renderDashboard() {
  const cityData    = WEATHER_DB.cities[state.city];
  const w           = cityData.current;
  const persona     = PERSONAS[state.persona];
  const tips        = cityData.persona_tips[state.persona];

  // Update header badge
  document.getElementById("persona-badge-text").textContent =
    `${persona.icon} ${persona.name}`;
  document.getElementById("city-select").value = state.city;

  // --- Alert Banner ---
  const alertEl = document.getElementById("alert-banner");
  alertEl.className = `alert-banner ${persona.alertClass}`;
  alertEl.textContent = getAlertText(state.persona, w, tips, cityData.name);

  // --- Main Weather Card ---
  document.getElementById("city-name").textContent  = cityData.name;
  document.getElementById("city-state").textContent = cityData.state;
  document.getElementById("weather-icon").textContent    = w.icon;
  document.getElementById("weather-desc").textContent    = w.description;
  document.getElementById("temp-big").textContent        = `${w.temp}°C`;
  document.getElementById("feels-like").textContent      = `Feels like ${w.feels_like}°C`;
  document.getElementById("sun-times").innerHTML       =
    `🌅 ${w.sunrise} &nbsp;&nbsp; 🌇 ${w.sunset}`;

  // --- Metric Cards (persona-highlighted) ---
  renderMetricCards(w, state.persona);

  // --- Persona-Specific Widget ---
  renderPersonaWidget(tips, state.persona, w, cityData);

  // --- 3-Day Forecast ---
  renderForecast(cityData.forecast);
}

// ---- Alert text per persona ----
function getAlertText(persona, w, tips, cityName) {
  switch (persona) {
    case "fitness":
      return `🏃 Best run window in ${cityName}: ${tips.run_window}. ${tips.alert}`;
    case "traveler":
      return `✈️ ${tips.flight_alert} &nbsp; ${tips.packing_tip}`;
    case "commuter":
      return `🚗 Traffic in ${cityName}: ${w.traffic_label} (${w.traffic_index}/10). ${tips.best_route}`;
    case "agriculture":
      return `🌾 ${tips.planting_tip} &nbsp; Irrigation: ${tips.irrigation}`;
    case "event":
      return `🎉 Outdoor comfort in ${cityName}: ${w.comfort_index}/100. ${tips.advice}`;
    default:
      return "Welcome to Mausam — Personalized Weather for India.";
  }
}

// ---- Metric Cards — show relevant ones for each persona ----
function renderMetricCards(w, persona) {
  const container = document.getElementById("metric-cards");
  let cards = [];

  // Always show temp + humidity
  const base = [
    { label: "Temperature", value: `${w.temp}°`, unit: "C", sub: `Humidity ${w.humidity}%`, highlight: false },
    { label: "Wind",        value: w.wind_speed, unit: "km/h", sub: `Direction: ${w.wind_dir}`, highlight: false },
  ];

  const persona_cards = {
    fitness: [
      { label: "UV Index",   value: w.uv_index,   unit: "",    sub: w.uv_label,          highlight: w.uv_index >= 7 },
      { label: "AQI",        value: w.aqi,         unit: "",    sub: w.aqi_label,         highlight: w.aqi > 150 },
    ],
    traveler: [
      { label: "Rain Chance", value: `${w.rain_probability}`, unit: "%",  sub: "Probability today",  highlight: w.rain_probability > 60 },
      { label: "Visibility",  value: w.visibility,             unit: " km", sub: "Clear if > 8 km",  highlight: w.visibility < 5 },
    ],
    commuter: [
      { label: "Traffic",    value: `${w.traffic_index}/10`, unit: "",  sub: w.traffic_label,      highlight: w.traffic_index >= 7 },
      { label: "Visibility", value: w.visibility,             unit: " km", sub: "Road safety",      highlight: w.visibility < 5 },
    ],
    agriculture: [
      { label: "Soil Moisture", value: `${w.soil_moisture}`, unit: "%", sub: "Optimal: 30–60%",  highlight: w.soil_moisture > 70 },
      { label: "Rain Chance",   value: `${w.rain_probability}`, unit: "%", sub: "Irrigation guide", highlight: false },
    ],
    event: [
      { label: "Comfort Index", value: w.comfort_index, unit: "/100", sub: "Outdoor suitability", highlight: w.comfort_index < 50 },
      { label: "Rain Chance",   value: `${w.rain_probability}`, unit: "%",  sub: "Event risk",    highlight: w.rain_probability > 60 },
    ]
  };

  cards = [...base, ...(persona_cards[persona] || [])];

  container.innerHTML = cards.map(c => `
    <div class="card ${c.highlight ? 'card-highlight' : ''}">
      <div class="card-label">${c.label}</div>
      <div class="card-value">${c.value}<span class="card-unit">${c.unit}</span></div>
      <div class="card-sub">${c.sub}</div>
    </div>
  `).join("");
}

// ---- Persona Widget — the core personalization feature ----
function renderPersonaWidget(tips, persona, w, cityData) {
  const container = document.getElementById("persona-widget");
  let title = "";
  let rows  = [];

  switch (persona) {

    case "fitness":
      title = `🏃 Fitness Dashboard — ${cityData.name}`;
      rows = [
        { label: "Best Run Window",   value: tips.run_window },
        { label: "Best Day This Week",value: tips.best_day },
        { label: "UV Index",          value: `${w.uv_index} — ${w.uv_label}` },
        { label: "AQI",               value: `${w.aqi} (${w.aqi_label})` },
        { label: "Sunrise / Sunset",  value: `${w.sunrise} / ${w.sunset}` },
        { label: "Wind",              value: `${w.wind_speed} km/h from ${w.wind_dir}` },
        { label: "AI Advice",         value: tips.alert },
      ];
      break;

    case "traveler":
      title = `✈️ Travel Dashboard — ${cityData.name}`;
      rows = [
        { label: "Packing Suggestion",  value: tips.packing_tip },
        { label: "Flight Alert",        value: tips.flight_alert },
        { label: "Saved Destinations",  value: tips.saved.join(" &nbsp;|&nbsp; ") },
        { label: "Visibility",          value: `${w.visibility} km` },
        { label: "Rain Probability",    value: `${w.rain_probability}%` },
        { label: "Comfort Index",       value: `${w.comfort_index}/100` },
      ];
      break;

    case "commuter":
      title = `🚗 Commute Dashboard — ${cityData.name}`;
      rows = [
        { label: "Traffic Level",       value: `${w.traffic_label} (${w.traffic_index}/10)` },
        { label: "Best Route",          value: tips.best_route },
        { label: "Peak Hours to Avoid", value: tips.peak_avoid },
        { label: "Visibility",          value: `${w.visibility} km` },
        { label: "Fog / Conditions",    value: tips.fog_alert },
        { label: "Rain Chance",         value: `${w.rain_probability}%` },
      ];
      break;

    case "agriculture":
      title = `🌾 Farm & Garden Dashboard — ${cityData.name}`;
      rows = [
        { label: "Planting Advice",     value: tips.planting_tip },
        { label: "Irrigation",          value: tips.irrigation },
        { label: "Frost Alert",         value: tips.frost_note },
        { label: "Soil Moisture",       value: `${w.soil_moisture}% volumetric` },
        { label: "Rain Probability",    value: `${w.rain_probability}%` },
        { label: "Humidity",            value: `${w.humidity}%` },
      ];
      break;

    case "event":
      title = `🎉 Event Planner Dashboard — ${cityData.name}`;
      rows = [
        { label: "Outdoor Rating",      value: tips.rating },
        { label: "Best Day to Host",    value: tips.best_day },
        { label: "AI Recommendation",   value: tips.advice },
        { label: "Comfort Index",       value: `${w.comfort_index}/100` },
        { label: "Rain Probability",    value: `${w.rain_probability}%` },
        { label: "Extended Forecast",   value: `3-day view below ↓` },
      ];
      break;
  }

  container.innerHTML = `
    <div class="widget-title">${title}</div>
    ${rows.map(r => `
      <div class="widget-row">
        <span class="widget-row-label">${r.label}</span>
        <span class="widget-row-value">${r.value}</span>
      </div>
    `).join("")}
  `;
}

// ---- 3-Day Forecast Strip ----
function renderForecast(forecast) {
  const container = document.getElementById("forecast-strip");
  container.innerHTML = forecast.map(f => `
    <div class="forecast-card">
      <div class="f-day">${f.day}</div>
      <div class="f-icon">${f.icon}</div>
      <div class="f-temp">${f.temp_max}° / ${f.temp_min}°</div>
      <div class="f-rain">💧 ${f.rain_prob}% rain</div>
      <div class="f-cond">${f.condition}</div>
    </div>
  `).join("");
}

// ================================================================
// SECTION 4: Init
// ================================================================
function init() {
  // Build persona grid on selection screen
  const grid = document.getElementById("persona-grid");
  grid.innerHTML = Object.values(PERSONAS).map(p => `
    <div class="persona-card" onclick="selectPersona('${p.id}')">
      <div class="p-icon">${p.icon}</div>
      <div class="p-name">${p.name}</div>
      <div class="p-desc">${p.desc}</div>
    </div>
  `).join("");

  // Build persona grid inside switch modal
  const modalGrid = document.getElementById("modal-persona-grid");
  modalGrid.innerHTML = Object.values(PERSONAS).map(p => `
    <div class="persona-card" onclick="switchPersonaFromModal('${p.id}')">
      <div class="p-icon">${p.icon}</div>
      <div class="p-name">${p.name}</div>
      <div class="p-desc">${p.desc}</div>
    </div>
  `).join("");

  // Check localStorage for returning user
  const saved = localStorage.getItem("mausam_persona");
  if (saved && PERSONAS[saved]) {
    state.persona = saved;
    document.getElementById("persona-screen").style.display   = "none";
    document.getElementById("dashboard-screen").style.display = "block";
    renderDashboard();
  }
}

// Run on page load
window.addEventListener("DOMContentLoaded", init);
