// ================================================================
// data.js — Ghaziabad IMD Mock Database — Mausam SIH MVP
// ================================================================

const DB = {

  city: {
    name: "Ghaziabad",
    state: "Uttar Pradesh",
    district: "Ghaziabad",
    lat: 28.6692,
    lon: 77.4538
  },

  // ---- Current conditions ----
  now: {
    temp: 33,
    feels_like: 37,
    humidity: 68,
    aqi: 196,
    aqi_label: "Unhealthy",
    wind_speed: 11,
    wind_dir: "W",
    uv_index: 7,
    uv_label: "High",
    visibility: 5.1,        // km
    rain_probability: 28,   // %
    soil_moisture: 32,      // % volumetric
    comfort_index: 46,
    sunrise: "05:51 AM",
    sunset: "07:08 PM",
    description: "Partly Cloudy",
    icon: "⛅",
    traffic_index: 8,       // 1–10
    traffic_label: "Heavy"
  },

  // ---- Hourly forecast — 5 AM to 10 PM today ----
  hourly: [
    { time: "05:00", temp: 27, rain_prob: 5,  uv: 0, wind: 8,  aqi: 165, traffic: 2, fog: false, condition: "Clear",         icon: "🌙" },
    { time: "06:00", temp: 28, rain_prob: 8,  uv: 1, wind: 8,  aqi: 170, traffic: 4, fog: false, condition: "Clear",         icon: "🌤️" },
    { time: "07:00", temp: 30, rain_prob: 10, uv: 3, wind: 9,  aqi: 180, traffic: 8, fog: false, condition: "Partly Cloudy", icon: "⛅" },
    { time: "08:00", temp: 31, rain_prob: 12, uv: 5, wind: 10, aqi: 190, traffic: 9, fog: false, condition: "Partly Cloudy", icon: "⛅" },
    { time: "09:00", temp: 33, rain_prob: 15, uv: 7, wind: 11, aqi: 196, traffic: 7, fog: false, condition: "Hazy",          icon: "🌫️" },
    { time: "10:00", temp: 34, rain_prob: 18, uv: 8, wind: 11, aqi: 200, traffic: 5, fog: false, condition: "Hot & Hazy",    icon: "☀️" },
    { time: "11:00", temp: 35, rain_prob: 20, uv: 9, wind: 12, aqi: 202, traffic: 4, fog: false, condition: "Hot & Sunny",   icon: "☀️" },
    { time: "12:00", temp: 36, rain_prob: 22, uv: 10,wind: 13, aqi: 205, traffic: 5, fog: false, condition: "Very Hot",      icon: "🌡️" },
    { time: "13:00", temp: 37, rain_prob: 25, uv: 10,wind: 14, aqi: 208, traffic: 4, fog: false, condition: "Very Hot",      icon: "🌡️" },
    { time: "14:00", temp: 37, rain_prob: 28, uv: 9, wind: 13, aqi: 205, traffic: 4, fog: false, condition: "Hot",           icon: "☀️" },
    { time: "15:00", temp: 36, rain_prob: 30, uv: 8, wind: 12, aqi: 200, traffic: 4, fog: false, condition: "Partly Cloudy", icon: "⛅" },
    { time: "16:00", temp: 35, rain_prob: 35, uv: 6, wind: 11, aqi: 195, traffic: 5, fog: false, condition: "Partly Cloudy", icon: "⛅" },
    { time: "17:00", temp: 34, rain_prob: 30, uv: 4, wind: 10, aqi: 190, traffic: 9, fog: false, condition: "Partly Cloudy", icon: "⛅" },
    { time: "18:00", temp: 32, rain_prob: 25, uv: 2, wind: 9,  aqi: 185, traffic: 8, fog: false, condition: "Cloudy",        icon: "🌥️" },
    { time: "19:00", temp: 31, rain_prob: 22, uv: 0, wind: 8,  aqi: 180, traffic: 6, fog: false, condition: "Evening",       icon: "🌇" },
    { time: "20:00", temp: 30, rain_prob: 20, uv: 0, wind: 7,  aqi: 175, traffic: 4, fog: false, condition: "Clear",         icon: "🌙" },
    { time: "21:00", temp: 29, rain_prob: 15, uv: 0, wind: 6,  aqi: 170, traffic: 3, fog: false, condition: "Clear",         icon: "🌙" },
    { time: "22:00", temp: 28, rain_prob: 10, uv: 0, wind: 6,  aqi: 168, traffic: 2, fog: true,  condition: "Foggy",         icon: "🌫️" }
  ],

  // ---- 7-day forecast ----
  weekly: [
    { day: "Today",  date: "Aug 22", icon: "⛅", high: 37, low: 27, rain_prob: 28, condition: "Partly Cloudy",  comfort: 46, soil_water: "Adequate",  event_score: 46 },
    { day: "Sat",    date: "Aug 23", icon: "🌦️", high: 34, low: 26, rain_prob: 55, condition: "Light Rain",     comfort: 52, soil_water: "Good",      event_score: 52 },
    { day: "Sun",    date: "Aug 24", icon: "🌧️", high: 31, low: 24, rain_prob: 78, condition: "Heavy Rain",     comfort: 35, soil_water: "Excess",    event_score: 22 },
    { day: "Mon",    date: "Aug 25", icon: "⛈️", high: 30, low: 23, rain_prob: 85, condition: "Thunderstorm",  comfort: 30, soil_water: "Waterlog",  event_score: 10 },
    { day: "Tue",    date: "Aug 26", icon: "🌦️", high: 32, low: 24, rain_prob: 45, condition: "Showers",       comfort: 55, soil_water: "Good",      event_score: 50 },
    { day: "Wed",    date: "Aug 27", icon: "🌤️", high: 33, low: 25, rain_prob: 20, condition: "Mostly Sunny",  comfort: 62, soil_water: "Adequate",  event_score: 65 },
    { day: "Thu",    date: "Aug 28", icon: "☀️", high: 35, low: 26, rain_prob: 10, condition: "Sunny",          comfort: 58, soil_water: "Dry Alert", event_score: 72 }
  ],

  // ---- Persona-specific curated data ----
  personas: {

    fitness: {
      run_windows: [
        { slot: "05:30 – 07:15 AM", rating: "🟢 Best", reason: "Cool (28°C), UV=1, AQI=170, Light wind" },
        { slot: "06:00 – 07:30 PM", rating: "🟡 Acceptable", reason: "Cooling (32°C), UV=2, Traffic moderate" }
      ],
      avoid: "09:00 AM – 05:00 PM — UV reaches 10, AQI 200+, Heat Index 42°C",
      heat_index: 42,
      hydration_tip: "Drink 500ml water before run. Carry bottle if running after 06:30 AM.",
      gear_tip: "Light-coloured clothing. UV sunscreen SPF 30+ after 07 AM.",
      weekly_best_days: ["Sat (Cooler + Rain clears air)", "Wed (Sunny, AQI drops to ~140)"],
      hourly_safe: ["05:00","06:00","07:00","18:00","19:00","20:00"],
      hourly_caution: ["08:00","09:00","16:00","17:00"],
      hourly_danger: ["10:00","11:00","12:00","13:00","14:00","15:00"]
    },

    commuter: {
      morning_commute: {
        time: "07:00 – 09:00 AM",
        traffic: "Very Heavy (8–9/10)",
        visibility: "5.1 km — Drive with care",
        rain_risk: "Low (12–15%)",
        recommendation: "Leave before 07:00 AM or after 09:30 AM",
        mode: "🚇 Metro strongly recommended — NH-9 severely congested"
      },
      evening_commute: {
        time: "05:00 – 07:00 PM",
        traffic: "Heavy (8–9/10)",
        visibility: "Good (declining after 7 PM)",
        rain_risk: "Moderate (30%)",
        recommendation: "Leave before 05:00 PM or after 08:00 PM",
        mode: "🚍 UPSRTC / Metro if available — roads heavy"
      },
      fog_risk_tonight: true,
      fog_time: "10 PM onwards — Visibility may drop below 200m",
      worst_roads: ["NH-9 (Delhi–Meerut Expressway)", "Raj Nagar Extension", "Vaishali Metro feeder"],
      hourly_traffic: {
        peak_am: ["07:00","08:00","09:00"],
        peak_pm: ["17:00","18:00","19:00"],
        light: ["05:00","06:00","20:00","21:00","22:00"]
      }
    },

    agriculture: {
      today_action: "Delay irrigation — moderate rain expected Sat–Mon. Conserve water.",
      soil_status: "Adequate (32%) — within optimal range for Kharif crops",
      irrigation_schedule: [
        { day: "Today (Fri)",  action: "Skip — soil adequate",          icon: "⏭️" },
        { day: "Sat",          action: "Skip — 55% rain expected",      icon: "⏭️" },
        { day: "Sun",          action: "Skip — Heavy rain (78%)",       icon: "⏭️" },
        { day: "Mon",          action: "DRAIN — Waterlogging risk!",    icon: "⚠️" },
        { day: "Tue",          action: "Check soil — light irrigation", icon: "💧" },
        { day: "Wed",          action: "Normal irrigation",             icon: "✅" },
        { day: "Thu",          action: "Normal + monitor — drying",     icon: "✅" }
      ],
      pest_alert: "High humidity (68%) — risk of fungal blight. Apply preventive fungicide by Saturday.",
      frost_alert: false,
      planting_tip: "Kharif season — paddy, maize, soybean active. Do NOT sow new crops before Mon storms pass.",
      seasonal_note: "Rabi planning window opens after Sep 15. Soil prep begins Oct."
    },

    traveler: {
      current_packing: [
        { item: "☂️ Umbrella / Raincoat", reason: "Rain from Sat–Mon, 55–85% probability" },
        { item: "🕶️ Sunglasses",          reason: "UV Index 7–10 during daylight" },
        { item: "💧 Water bottle",         reason: "Heat index 42°C — stay hydrated" },
        { item: "😷 N95 Mask",             reason: "AQI 196 — Unhealthy air quality" }
      ],
      saved_destinations: [
        { name: "Shimla",     temp: 18, condition: "Cloudy",  rain: 35, alert: "None"        },
        { name: "Jaipur",     temp: 36, condition: "Hot",     rain: 15, alert: "Heat wave"   },
        { name: "Dehradun",   temp: 24, condition: "Rainy",   rain: 72, alert: "Landslide ⚠️"},
        { name: "Delhi NCR",  temp: 34, condition: "Hazy",    rain: 25, alert: "AQI 180"     }
      ],
      flight_conditions: {
        status: "Moderate — light turbulence possible due to monsoon winds",
        visibility: "5.1 km at ground. No diversions expected.",
        weekend_alert: "Strong winds and heavy rain Mon — check flight status if travelling."
      },
      best_travel_day: "Wed Aug 27 — sunny, low rain, AQI improves to ~140"
    },

    event: {
      today_score: { score: 46, label: "⚠️ Fair", color: "#e0a83a" },
      weekly_scores: null, // populated from weekly data
      best_day: { day: "Thu Aug 28", score: 72, label: "✅ Good", condition: "Sunny, Rain 10%" },
      worst_day: { day: "Mon Aug 25", score: 10, label: "❌ Avoid", condition: "Thunderstorm, Rain 85%" },
      time_windows_today: [
        { window: "06:00 – 08:30 AM", score: 68, note: "Best morning window — cool, breezy" },
        { window: "12:00 – 04:00 PM", score: 22, note: "Avoid — extreme heat, UV 10" },
        { window: "06:30 – 08:30 PM", score: 60, note: "Pleasant evening — light wind" }
      ],
      comfort_breakdown: {
        temp: { val: 33, note: "Warm — needs shade/AC backup" },
        humidity: { val: 68, note: "Moderate — feels sticky" },
        wind: { val: 11, note: "Light breeze — acceptable" },
        rain: { val: 28, note: "Low risk today" },
        uv: { val: 7, note: "High — cover required daytime" }
      },
      recommendation: "Schedule outdoor events early morning (06–08:30 AM) or evening (06:30–08:30 PM). Book indoor backup for Sat–Mon due to monsoon."
    }
  }
};
