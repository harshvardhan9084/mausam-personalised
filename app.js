// ================================================================
// app.js — Mausam v2 — Fully differentiated persona dashboards
// No AI detect. No city switcher. Ghaziabad only. Time-first.
// ================================================================

const PERSONAS = {
  fitness: {
    id: "fitness", icon: "🏃", name: "Outdoor Fitness",
    desc: "Running, cycling, workouts"
  },
  commuter: {
    id: "commuter", icon: "🚗", name: "Commuter",
    desc: "Daily office commute & traffic"
  },
  agriculture: {
    id: "agriculture", icon: "🌾", name: "Agriculture",
    desc: "Farming, gardening, planting"
  },
  traveler: {
    id: "traveler", icon: "✈️", name: "Traveler",
    desc: "Trips, flights, destinations"
  },
  event: {
    id: "event", icon: "🎉", name: "Event Planner",
    desc: "Outdoor gatherings & events"
  }
};

let currentPersona = null;

// ================================================================
// PERSONA SELECT
// ================================================================
function selectPersona(id) {
  currentPersona = id;
  localStorage.setItem("mausam_persona", id);
  document.body.setAttribute("data-persona", id);
  document.getElementById("persona-screen").style.display  = "none";
  document.getElementById("dashboard-screen").style.display = "block";
  renderDashboard(id);
}

function openSwitch() { document.getElementById("switch-modal").classList.add("active"); }
function closeSwitch() { document.getElementById("switch-modal").classList.remove("active"); }

function switchPersona(id) {
  closeSwitch();
  selectPersona(id);
}

// ================================================================
// MAIN RENDER DISPATCHER
// ================================================================
function renderDashboard(persona) {
  const p = PERSONAS[persona];
  // Update header
  document.getElementById("persona-badge-text").textContent = `${p.icon} ${p.name}`;

  // Clear content area
  const content = document.getElementById("dash-content-area");
  content.innerHTML = "";

  // Dispatch to persona-specific renderer
  const renderers = {
    fitness:     renderFitnessDash,
    commuter:    renderCommuterDash,
    agriculture: renderAgricultureDash,
    traveler:    renderTravelerDash,
    event:       renderEventDash
  };
  renderers[persona](content);

  // Footer
  content.innerHTML += `
    <div class="footer-note">
      Data: India Meteorological Department (IMD) · Ghaziabad, UP · SIH 2026 MVP
    </div>`;
}

// ================================================================
// 1. FITNESS DASHBOARD
// Focus: WHEN to run — time is everything
// ================================================================
function renderFitnessDash(el) {
  const f = DB.personas.fitness;
  const now = DB.now;

  // Hero — run windows
  el.innerHTML += `
    <div class="hero">
      <div class="hero-label">🏃 Today's Run Windows — Ghaziabad</div>
      <div class="hero-big">${f.run_windows[0].slot}</div>
      <div style="margin-bottom:10px;">
        <span class="badge badge-green">${f.run_windows[0].rating}</span>
        <span style="font-size:0.84rem; color:var(--muted); margin-left:10px;">${f.run_windows[0].reason}</span>
      </div>
      <div style="font-size:0.9rem; margin-bottom:6px;">
        Evening option: <strong>${f.run_windows[1].slot}</strong>
        <span class="badge badge-yellow" style="margin-left:8px;">${f.run_windows[1].rating}</span>
      </div>
      <div class="hero-sub">⛔ ${f.avoid}</div>
    </div>`;

  // Alert
  const alertClass = now.aqi > 150 ? "alert-danger" : "alert-warn";
  el.innerHTML += `
    <div class="alert ${alertClass}">
      😷 AQI ${now.aqi} (${now.aqi_label}) — Air quality is poor. Wear N95 mask during outdoor activity.
      Heat index today: <strong>${f.heat_index}°C</strong>. ${f.hydration_tip}
    </div>`;

  // Hourly safety strip
  el.innerHTML += `<div class="sec-title">Hourly Safety for Running — Today</div>`;
  const strip = document.createElement("div");
  strip.className = "hourly-strip";
  DB.hourly.forEach(h => {
    let cls = "";
    if (f.hourly_safe.includes(h.time))    cls = "safe";
    if (f.hourly_caution.includes(h.time)) cls = "caution";
    if (f.hourly_danger.includes(h.time))  cls = "danger";
    strip.innerHTML += `
      <div class="hour-card ${cls}">
        <div class="h-time">${h.time}</div>
        <div class="h-icon">${h.icon}</div>
        <div class="h-val">${h.temp}°</div>
        <div class="h-sub">UV ${h.uv}</div>
      </div>`;
  });
  el.appendChild(strip);

  // Key stats row
  el.innerHTML += `
    <div class="sec-title">Current Conditions</div>
    <div class="row-4">
      <div class="card"><div class="mini-stat"><div class="mini-val">${now.temp}°C</div><div class="mini-lbl">Temperature</div></div></div>
      <div class="card"><div class="mini-stat"><div class="mini-val">${now.uv_index}</div><div class="mini-lbl">UV Index — ${now.uv_label}</div></div></div>
      <div class="card"><div class="mini-stat"><div class="mini-val" style="color:#e05c5c;">${now.aqi}</div><div class="mini-lbl">AQI (${now.aqi_label})</div></div></div>
      <div class="card"><div class="mini-stat"><div class="mini-val">${now.wind_speed}</div><div class="mini-lbl">Wind km/h ${now.wind_dir}</div></div></div>
    </div>`;

  // Gear tip + best week days
  el.innerHTML += `
    <div class="row-2">
      <div class="card">
        <div class="sec-title" style="margin-bottom:8px;">Gear Checklist</div>
        <div class="kv-list">
          <div class="kv-row"><span class="kv-label">Clothing</span><span class="kv-value">${f.gear_tip}</span></div>
          <div class="kv-row"><span class="kv-label">Sunrise</span><span class="kv-value">${now.sunrise}</span></div>
          <div class="kv-row"><span class="kv-label">Sunset</span><span class="kv-value">${now.sunset}</span></div>
          <div class="kv-row"><span class="kv-label">Humidity</span><span class="kv-value">${now.humidity}%</span></div>
        </div>
      </div>
      <div class="card">
        <div class="sec-title" style="margin-bottom:8px;">Best Days This Week</div>
        ${f.weekly_best_days.map(d => `<div style="padding:8px 0; border-bottom:1px solid var(--border); font-size:0.87rem;">✅ ${d}</div>`).join("")}
        <div style="padding-top:10px; font-size:0.8rem; color:var(--muted);">Sun–Mon: Heavy rain — avoid outdoor activity</div>
      </div>
    </div>`;
}

// ================================================================
// 2. COMMUTER DASHBOARD
// Focus: WHEN is my commute safe — traffic + weather by hour
// ================================================================
function renderCommuterDash(el) {
  const c = DB.personas.commuter;
  const now = DB.now;

  // Hero
  el.innerHTML += `
    <div class="hero">
      <div class="hero-label">🚗 Commute Status — Right Now</div>
      <div class="hero-big">Traffic Level ${now.traffic_index}/10 — ${now.traffic_label}</div>
      <div class="hero-sub">Visibility: ${now.visibility} km &nbsp;·&nbsp; ${now.description} &nbsp;·&nbsp; ${now.rain_probability}% rain chance</div>
    </div>`;

  // Fog alert
  if (c.fog_risk_tonight) {
    el.innerHTML += `
      <div class="alert alert-warn">
        🌫️ Fog Alert Tonight — ${c.fog_time}. Plan early departure or use fog lights. Roads most affected: ${c.worst_roads[0]}.
      </div>`;
  }

  // Morning + Evening commute blocks
  el.innerHTML += `
    <div class="sec-title">Commute Windows</div>
    <div class="row-2" style="margin-bottom:20px;">
      <div class="commute-block">
        <div class="commute-time-label">☀️ Morning Commute</div>
        <div class="commute-status">${c.morning_commute.traffic}</div>
        <div class="kv-list">
          <div class="kv-row"><span class="kv-label">Time</span><span class="kv-value">${c.morning_commute.time}</span></div>
          <div class="kv-row"><span class="kv-label">Visibility</span><span class="kv-value">${c.morning_commute.visibility}</span></div>
          <div class="kv-row"><span class="kv-label">Rain Risk</span><span class="kv-value">${c.morning_commute.rain_risk}</span></div>
          <div class="kv-row"><span class="kv-label">Best Mode</span><span class="kv-value">${c.morning_commute.mode}</span></div>
          <div class="kv-row"><span class="kv-label">Tip</span><span class="kv-value" style="color:var(--accent);">${c.morning_commute.recommendation}</span></div>
        </div>
      </div>
      <div class="commute-block">
        <div class="commute-time-label">🌇 Evening Commute</div>
        <div class="commute-status">${c.evening_commute.traffic}</div>
        <div class="kv-list">
          <div class="kv-row"><span class="kv-label">Time</span><span class="kv-value">${c.evening_commute.time}</span></div>
          <div class="kv-row"><span class="kv-label">Visibility</span><span class="kv-value">${c.evening_commute.visibility}</span></div>
          <div class="kv-row"><span class="kv-label">Rain Risk</span><span class="kv-value">${c.evening_commute.rain_risk}</span></div>
          <div class="kv-row"><span class="kv-label">Best Mode</span><span class="kv-value">${c.evening_commute.mode}</span></div>
          <div class="kv-row"><span class="kv-label">Tip</span><span class="kv-value" style="color:var(--accent);">${c.evening_commute.recommendation}</span></div>
        </div>
      </div>
    </div>`;

  // Hourly traffic strip
  el.innerHTML += `<div class="sec-title">Hourly Traffic + Weather — Today</div>`;
  const strip = document.createElement("div");
  strip.className = "hourly-strip";
  DB.hourly.forEach(h => {
    const isPeak = c.hourly_traffic.peak_am.includes(h.time) || c.hourly_traffic.peak_pm.includes(h.time);
    const isLight = c.hourly_traffic.light.includes(h.time);
    const cls = isPeak ? "danger" : isLight ? "safe" : "";
    strip.innerHTML += `
      <div class="hour-card ${cls}">
        <div class="h-time">${h.time}</div>
        <div class="h-icon">${h.icon}</div>
        <div class="h-val">${h.traffic}/10</div>
        <div class="h-sub">${h.rain_prob}% 💧</div>
      </div>`;
  });
  el.appendChild(strip);

  // Roads + stats
  el.innerHTML += `
    <div class="row-2">
      <div class="card">
        <div class="sec-title" style="margin-bottom:8px;">Congested Roads</div>
        ${c.worst_roads.map((r,i) => `
          <div style="padding:8px 0; border-bottom:1px solid var(--border); font-size:0.86rem;">
            ${i === 0 ? "🔴" : "🟡"} ${r}
          </div>`).join("")}
      </div>
      <div class="card">
        <div class="sec-title" style="margin-bottom:8px;">Weather at a Glance</div>
        <div class="kv-list">
          <div class="kv-row"><span class="kv-label">Temp</span><span class="kv-value">${now.temp}°C (feels ${now.feels_like}°C)</span></div>
          <div class="kv-row"><span class="kv-label">Rain today</span><span class="kv-value">${now.rain_probability}%</span></div>
          <div class="kv-row"><span class="kv-label">AQI</span><span class="kv-value" style="color:#e05c5c;">${now.aqi} (${now.aqi_label})</span></div>
          <div class="kv-row"><span class="kv-label">Fog tonight</span><span class="kv-value" style="color:var(--accent);">Yes — after 10 PM</span></div>
        </div>
      </div>
    </div>`;
}

// ================================================================
// 3. AGRICULTURE DASHBOARD
// Focus: Weekly irrigation plan + soil + pest + planting
// ================================================================
function renderAgricultureDash(el) {
  const a = DB.personas.agriculture;
  const now = DB.now;

  // Hero
  el.innerHTML += `
    <div class="hero">
      <div class="hero-label">🌾 Today's Farm Advisory — Ghaziabad</div>
      <div class="hero-big">${a.today_action}</div>
      <div class="hero-sub">Soil: ${a.soil_status}</div>
    </div>`;

  // Pest alert
  el.innerHTML += `
    <div class="alert alert-warn">
      🦠 ${a.pest_alert}
    </div>`;

  // Soil + key stats
  el.innerHTML += `
    <div class="sec-title">Current Soil & Weather</div>
    <div class="row-4" style="margin-bottom:20px;">
      <div class="card"><div class="mini-stat">
        <div class="mini-val" style="color:var(--accent);">${now.soil_moisture}%</div>
        <div class="mini-lbl">Soil Moisture</div>
      </div></div>
      <div class="card"><div class="mini-stat">
        <div class="mini-val">${now.humidity}%</div>
        <div class="mini-lbl">Air Humidity</div>
      </div></div>
      <div class="card"><div class="mini-stat">
        <div class="mini-val">${now.rain_probability}%</div>
        <div class="mini-lbl">Rain Today</div>
      </div></div>
      <div class="card"><div class="mini-stat">
        <div class="mini-val">${now.temp}°C</div>
        <div class="mini-lbl">Temperature</div>
      </div></div>
    </div>`;

  // 7-day irrigation schedule
  el.innerHTML += `<div class="sec-title">7-Day Irrigation Schedule</div>`;
  el.innerHTML += `
    <div class="card" style="margin-bottom:20px;">
      <table class="irr-table">
        <thead>
          <tr><th>Day</th><th>Rain Forecast</th><th>Soil Water</th><th>Action</th></tr>
        </thead>
        <tbody>
          ${a.irrigation_schedule.map((row, i) => {
            const w = DB.weekly[i];
            return `<tr>
              <td><strong>${row.day}</strong></td>
              <td>${w ? w.icon + " " + w.rain_prob + "%" : "—"}</td>
              <td>${w ? w.soil_water : "—"}</td>
              <td>${row.icon} ${row.action}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;

  // Rain by hour today (when to do fieldwork)
  el.innerHTML += `<div class="sec-title">Hourly Rain Risk — Best Field Work Times</div>`;
  const strip = document.createElement("div");
  strip.className = "hourly-strip";
  DB.hourly.forEach(h => {
    const cls = h.rain_prob < 15 ? "safe" : h.rain_prob < 40 ? "caution" : "danger";
    strip.innerHTML += `
      <div class="hour-card ${cls}">
        <div class="h-time">${h.time}</div>
        <div class="h-icon">${h.icon}</div>
        <div class="h-val">${h.rain_prob}%</div>
        <div class="h-sub">💧 rain</div>
      </div>`;
  });
  el.appendChild(strip);

  // Planting + seasonal note
  el.innerHTML += `
    <div class="row-2">
      <div class="card">
        <div class="sec-title" style="margin-bottom:8px;">Planting Advisory</div>
        <div style="font-size:0.87rem;">${a.planting_tip}</div>
      </div>
      <div class="card">
        <div class="sec-title" style="margin-bottom:8px;">Seasonal Note</div>
        <div style="font-size:0.87rem;">${a.seasonal_note}</div>
        <div style="margin-top:10px; font-size:0.8rem; color:var(--muted);">
          Frost alert: ${a.frost_alert ? "⚠️ Yes" : "✅ None this week"}
        </div>
      </div>
    </div>`;
}

// ================================================================
// 4. TRAVELER DASHBOARD
// Focus: Packing, destinations, travel alerts, best travel day
// ================================================================
function renderTravelerDash(el) {
  const t = DB.personas.traveler;
  const now = DB.now;

  // Hero
  el.innerHTML += `
    <div class="hero">
      <div class="hero-label">✈️ Travel Weather — Ghaziabad Departure</div>
      <div class="hero-big">Best Travel Day: ${t.best_travel_day}</div>
      <div class="hero-sub">${now.temp}°C · ${now.description} · AQI ${now.aqi_label} · Rain ${now.rain_probability}%</div>
    </div>`;

  // Flight conditions alert
  const flightCls = t.flight_conditions.status.includes("Moderate") ? "alert-warn" : "alert-ok";
  el.innerHTML += `
    <div class="alert ${flightCls}">
      ✈️ Flight Conditions: ${t.flight_conditions.status}<br>
      ${t.flight_conditions.weekend_alert}
    </div>`;

  // Packing checklist
  el.innerHTML += `
    <div class="sec-title">Today's Packing Checklist — Based on Weather</div>
    <div class="card" style="margin-bottom:20px;">
      ${t.current_packing.map(p => `
        <div class="kv-row">
          <span class="kv-label">${p.item}</span>
          <span class="kv-value" style="color:var(--muted);">${p.reason}</span>
        </div>`).join("")}
    </div>`;

  // Saved destinations
  el.innerHTML += `<div class="sec-title">Saved Destinations — Weather Now</div>`;
  const destGrid = document.createElement("div");
  destGrid.className = "dest-grid";
  t.saved_destinations.forEach(d => {
    const alertColor = d.alert === "None" ? "var(--muted)" : "#e05c5c";
    destGrid.innerHTML += `
      <div class="dest-card">
        <div class="dest-name">📍 ${d.name}</div>
        <div class="dest-temp">${d.temp}°C</div>
        <div class="dest-cond">${d.condition} · ${d.rain}% rain</div>
        <div class="dest-alert" style="color:${alertColor};">${d.alert === "None" ? "✅ No alerts" : "⚠️ " + d.alert}</div>
      </div>`;
  });
  el.appendChild(destGrid);

  // Hourly rain strip — for departure planning
  el.innerHTML += `<div class="sec-title">Hourly Rain — Departure Time Planning</div>`;
  const strip = document.createElement("div");
  strip.className = "hourly-strip";
  DB.hourly.forEach(h => {
    const cls = h.rain_prob < 20 ? "safe" : h.rain_prob < 50 ? "caution" : "danger";
    strip.innerHTML += `
      <div class="hour-card ${cls}">
        <div class="h-time">${h.time}</div>
        <div class="h-icon">${h.icon}</div>
        <div class="h-val">${h.rain_prob}%</div>
        <div class="h-sub">${h.temp}°C</div>
      </div>`;
  });
  el.appendChild(strip);

  // 7 day forecast
  el.innerHTML += `<div class="sec-title">7-Day Forecast — Travel Planning</div>`;
  const wGrid = document.createElement("div");
  wGrid.className = "week-grid";
  DB.weekly.forEach((d, i) => {
    wGrid.innerHTML += `
      <div class="week-card ${i === 0 ? "today" : ""}">
        <div class="w-day">${d.day}</div>
        <div class="w-icon">${d.icon}</div>
        <div class="w-temp">${d.high}°/${d.low}°</div>
        <div class="w-rain">💧 ${d.rain_prob}%</div>
      </div>`;
  });
  el.appendChild(wGrid);
}

// ================================================================
// 5. EVENT PLANNER DASHBOARD
// Focus: Comfort score, best time windows, day-by-day suitability
// ================================================================
function renderEventDash(el) {
  const e = DB.personas.event;
  const now = DB.now;

  // Score color helper
  const scoreColor = s => s >= 65 ? "#4caf82" : s >= 45 ? "#f7c44f" : "#e05c5c";
  const scoreBadge = s => s >= 65 ? "badge-green" : s >= 45 ? "badge-yellow" : "badge-red";

  // Hero
  el.innerHTML += `
    <div class="hero">
      <div class="hero-label">🎉 Outdoor Event Suitability — Today</div>
      <div class="hero-big" style="color:${scoreColor(e.today_score.score)};">
        ${e.today_score.score}/100 — ${e.today_score.label}
      </div>
      <div class="hero-sub">${e.recommendation}</div>
    </div>`;

  // Best + worst day callout
  el.innerHTML += `
    <div class="row-2" style="margin-bottom:20px;">
      <div class="card accent-border">
        <div class="sec-title" style="margin-bottom:6px; color:var(--accent);">Best Day This Week</div>
        <div style="font-size:1.1rem; font-weight:700; color:#4caf82;">${e.best_day.day}</div>
        <div style="font-size:0.84rem; color:var(--muted); margin-top:4px;">${e.best_day.condition}</div>
        <div style="margin-top:8px;"><span class="badge badge-green">${e.best_day.score}/100</span></div>
      </div>
      <div class="card">
        <div class="sec-title" style="margin-bottom:6px;">Worst Day — Avoid</div>
        <div style="font-size:1.1rem; font-weight:700; color:#e05c5c;">${e.worst_day.day}</div>
        <div style="font-size:0.84rem; color:var(--muted); margin-top:4px;">${e.worst_day.condition}</div>
        <div style="margin-top:8px;"><span class="badge badge-red">${e.worst_day.score}/100</span></div>
      </div>
    </div>`;

  // Today's best time windows
  el.innerHTML += `
    <div class="sec-title">Best Time Windows — Today</div>
    <div class="card" style="margin-bottom:20px;">
      ${e.time_windows_today.map(w => `
        <div class="window-row">
          <div>
            <div class="window-time">${w.window}</div>
            <div class="window-note">${w.note}</div>
          </div>
          <div class="window-score" style="color:${scoreColor(w.score)};">${w.score}</div>
        </div>`).join("")}
    </div>`;

  // Hourly comfort strip
  el.innerHTML += `<div class="sec-title">Hourly Comfort — Plan Your Event Timing</div>`;
  const strip = document.createElement("div");
  strip.className = "hourly-strip";
  DB.hourly.forEach(h => {
    // Comfort estimate: drops when UV high + heat
    const comfort = Math.max(10, Math.round(100 - h.uv * 5 - (h.temp - 25) * 2 - h.rain_prob * 0.3));
    const cls = comfort >= 60 ? "safe" : comfort >= 40 ? "caution" : "danger";
    strip.innerHTML += `
      <div class="hour-card ${cls}">
        <div class="h-time">${h.time}</div>
        <div class="h-icon">${h.icon}</div>
        <div class="h-val">${comfort}</div>
        <div class="h-sub">comfort</div>
      </div>`;
  });
  el.appendChild(strip);

  // 7-day suitability grid
  el.innerHTML += `<div class="sec-title">7-Day Event Suitability</div>`;
  const wGrid = document.createElement("div");
  wGrid.className = "week-grid";
  DB.weekly.forEach((d, i) => {
    wGrid.innerHTML += `
      <div class="week-card ${i === 0 ? "today" : ""}">
        <div class="w-day">${d.day}</div>
        <div class="w-icon">${d.icon}</div>
        <div class="w-temp">${d.high}°/${d.low}°</div>
        <div class="w-rain">💧 ${d.rain_prob}%</div>
        <div class="w-score" style="color:${scoreColor(d.event_score)};">${d.event_score}/100</div>
      </div>`;
  });
  el.appendChild(wGrid);

  // Comfort breakdown
  el.innerHTML += `
    <div class="sec-title">Comfort Breakdown — Current Hour</div>
    <div class="card">
      ${Object.entries(e.comfort_breakdown).map(([k, v]) => `
        <div class="kv-row">
          <span class="kv-label">${k.charAt(0).toUpperCase() + k.slice(1)}</span>
          <span class="kv-value"><strong>${v.val}${k==="temp"?"°C":k==="humidity"||k==="rain"?"%":k==="wind"?" km/h":""}</strong> — ${v.note}</span>
        </div>`).join("")}
    </div>`;
}

// ================================================================
// INIT
// ================================================================
function init() {
  // Build persona grids (select screen + modal)
  ["persona-grid", "modal-persona-grid"].forEach(id => {
    const grid = document.getElementById(id);
    const fn   = id === "persona-grid" ? "selectPersona" : "switchPersona";
    grid.innerHTML = Object.values(PERSONAS).map(p => `
      <div class="persona-card" onclick="${fn}('${p.id}')">
        <div class="p-icon">${p.icon}</div>
        <div class="p-name">${p.name}</div>
        <div class="p-desc">${p.desc}</div>
      </div>`).join("");
  });

  // Returning user
  const saved = localStorage.getItem("mausam_persona");
  if (saved && PERSONAS[saved]) {
    selectPersona(saved);
  }
}

window.addEventListener("DOMContentLoaded", init);
