// ============================================================
// data.js — Mock IMD Weather Database for Mausam MVP
// Simulates data that would come from IMD / Open-Meteo APIs
// ============================================================

const WEATHER_DB = {

  cities: {

    delhi: {
      name: "Delhi",
      state: "Delhi",
      current: {
        temp: 34,
        feels_like: 38,
        humidity: 62,
        aqi: 187,
        aqi_label: "Unhealthy",
        aqi_color: "#e05c5c",
        wind_speed: 14,
        wind_dir: "NW",
        uv_index: 8,
        uv_label: "Very High",
        visibility: 4.2,          // km
        soil_moisture: 28,         // % volumetric
        rain_probability: 35,      // %
        comfort_index: 42,         // 0-100
        sunrise: "05:48 AM",
        sunset: "07:12 PM",
        tide_height: null,
        wave_height: null,
        sea_temp: null,
        pollen_count: "High",
        pollen_color: "#e07c3a",
        frost_alert: false,
        fog_alert: false,
        traffic_index: 7,          // 1-10 (10 = worst)
        traffic_label: "Heavy",
        description: "Partly Cloudy",
        icon: "⛅"
      },
      forecast: [
        { day: "Today",    icon: "⛅", temp_max: 34, temp_min: 26, rain_prob: 35, condition: "Partly Cloudy" },
        { day: "Tomorrow", icon: "🌦️", temp_max: 31, temp_min: 24, rain_prob: 65, condition: "Light Rain"   },
        { day: "Wed",      icon: "🌧️", temp_max: 29, temp_min: 22, rain_prob: 80, condition: "Heavy Rain"   }
      ],
      persona_tips: {
        fitness:     { run_window: "05:30 – 07:00 AM", alert: "⚠️ UV Very High after 9 AM. Run early or skip afternoon.", best_day: "Tomorrow (cooler + lower UV)" },
        traveler:    { packing_tip: "☂️ Pack umbrella & raincoat. Heavy rain by Day 3.", flight_alert: "⚠️ Possible flight delays Day 3 due to storms.", saved: ["Mumbai", "Jaipur"] },
        commuter:    { best_route: "Metro recommended — road traffic at Level 7/10.", fog_alert: "🌫️ Visibility 4.2 km. Allow extra 20 min.", peak_avoid: "Avoid 8–10 AM & 5–8 PM." },
        agriculture: { planting_tip: "🌱 Delay sowing — heavy rain expected Day 3. Check drainage.", irrigation: "Skip irrigation for 2 days.", frost_note: "No frost risk this week." },
        event:       { rating: "⚠️ Fair (42/100)", best_day: "Tomorrow — rain probability drops to 65%. Day 3 avoid completely.", advice: "Book indoor backup venue for weekend events." }
      }
    },

    mumbai: {
      name: "Mumbai",
      state: "Maharashtra",
      current: {
        temp: 29,
        feels_like: 33,
        humidity: 84,
        aqi: 78,
        aqi_label: "Moderate",
        aqi_color: "#e0a83a",
        wind_speed: 22,
        wind_dir: "SW",
        uv_index: 5,
        uv_label: "Moderate",
        visibility: 6.8,
        soil_moisture: 72,
        rain_probability: 75,
        comfort_index: 55,
        sunrise: "06:15 AM",
        sunset: "07:05 PM",
        tide_height: 3.2,          // meters (high tide)
        wave_height: 1.8,          // meters
        sea_temp: 28,              // °C
        pollen_count: "Low",
        pollen_color: "#4caf50",
        frost_alert: false,
        fog_alert: false,
        traffic_index: 8,
        traffic_label: "Very Heavy",
        description: "Monsoon Showers",
        icon: "🌧️"
      },
      forecast: [
        { day: "Today",    icon: "🌧️", temp_max: 29, temp_min: 24, rain_prob: 75, condition: "Monsoon Showers" },
        { day: "Tomorrow", icon: "⛈️", temp_max: 28, temp_min: 23, rain_prob: 85, condition: "Heavy Rain"      },
        { day: "Wed",      icon: "🌦️", temp_max: 27, temp_min: 23, rain_prob: 60, condition: "Moderate Rain"   }
      ],
      persona_tips: {
        fitness:     { run_window: "No good outdoor window today.", alert: "🌧️ Rain throughout morning. Consider indoor workout.", best_day: "Wednesday (lighter rain, cooler)" },
        traveler:    { packing_tip: "🎒 Waterproof bag essential. Strong SW winds.", flight_alert: "⚠️ Flight delays very likely tomorrow. Check airline status.", saved: ["Goa", "Pune"] },
        commuter:    { best_route: "Local train preferred — road flooding risk.", fog_alert: "🌧️ Rain impacting visibility. Drive slow.", peak_avoid: "Avoid road travel 7–11 AM tomorrow." },
        agriculture: { planting_tip: "💧 Soil fully saturated (72%). Skip all irrigation.", irrigation: "No irrigation needed for 4–5 days.", frost_note: "No frost risk." },
        event:       { rating: "❌ Poor (55/100)", best_day: "Wednesday (partially better). Still risky.", advice: "Strongly recommend indoor venue this week." }
      }
    },

    bengaluru: {
      name: "Bengaluru",
      state: "Karnataka",
      current: {
        temp: 24,
        feels_like: 25,
        humidity: 68,
        aqi: 52,
        aqi_label: "Moderate",
        aqi_color: "#e0a83a",
        wind_speed: 9,
        wind_dir: "SE",
        uv_index: 6,
        uv_label: "High",
        visibility: 9.1,
        soil_moisture: 45,
        rain_probability: 20,
        comfort_index: 78,
        sunrise: "06:08 AM",
        sunset: "06:48 PM",
        tide_height: null,
        wave_height: null,
        sea_temp: null,
        pollen_count: "Moderate",
        pollen_color: "#e0a83a",
        frost_alert: false,
        fog_alert: false,
        traffic_index: 6,
        traffic_label: "Moderate",
        description: "Mostly Cloudy",
        icon: "🌤️"
      },
      forecast: [
        { day: "Today",    icon: "🌤️", temp_max: 24, temp_min: 19, rain_prob: 20, condition: "Mostly Cloudy" },
        { day: "Tomorrow", icon: "🌥️", temp_max: 26, temp_min: 18, rain_prob: 10, condition: "Partly Sunny"  },
        { day: "Wed",      icon: "⛅", temp_max: 25, temp_min: 19, rain_prob: 30, condition: "Cloudy"        }
      ],
      persona_tips: {
        fitness:     { run_window: "06:00 – 08:00 AM or 05:30 – 07:00 PM", alert: "✅ Excellent conditions. UV manageable. Wind light.", best_day: "Tomorrow (partly sunny, slightly warmer)" },
        traveler:    { packing_tip: "🧥 Light jacket for evenings. No severe weather.", flight_alert: "✅ No disruptions expected.", saved: ["Mysuru", "Coorg"] },
        commuter:    { best_route: "All modes fine. Traffic moderate.", fog_alert: "✅ Good visibility (9.1 km). Safe to drive.", peak_avoid: "Standard peak hours 8–10 AM & 5–8 PM." },
        agriculture: { planting_tip: "🌱 Ideal conditions! Soil at 45% — perfect for most crops.", irrigation: "Light irrigation tomorrow if no rain.", frost_note: "No frost risk." },
        event:       { rating: "✅ Excellent (78/100)", best_day: "Tomorrow is the best — sunny and 82/100 comfort.", advice: "Great weekend for outdoor events. Minimal rain risk." }
      }
    }

  },

  // Simulated AI persona detection — based on time of day + mock behavioral signals
  ai_detection: {
    morning_early: {   // 5–9 AM
      top_persona: "fitness",
      confidence: 82,
      reason: "Early morning access pattern → likely fitness user"
    },
    morning_late: {    // 9–12 PM
      top_persona: "commuter",
      confidence: 74,
      reason: "Mid-morning check → likely tracking commute conditions"
    },
    afternoon: {       // 12–5 PM
      top_persona: "traveler",
      confidence: 68,
      reason: "Afternoon planning session → possible travel research"
    },
    evening: {         // 5–9 PM
      top_persona: "event",
      confidence: 71,
      reason: "Evening access → likely planning outdoor activities or events"
    },
    night: {           // 9 PM–5 AM
      top_persona: "agriculture",
      confidence: 62,
      reason: "Night-time check → farming schedule planning pattern"
    }
  }

};
