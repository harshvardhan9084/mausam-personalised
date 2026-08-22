package com.mausam.personal

/**
 * =======================================================================
 * SIH 26076: IMD Mausam Personalized Homepage Data Models
 * Covers all 8 Official Persona Domains:
 * 1. Health-conscious (AQI, PM2.5, PM10, Pollen, UV, Humidity, Asthma)
 * 2. Outdoor Fitness (Sunrise/Sunset, Best Running Windows, Wind, Heat)
 * 3. Beachgoers & Surfers (Sea condition, Tides, Wave height, Water temp)
 * 4. Travelers (Saved cities, Flight delays, Dynamic packing list)
 * 5. Parents & Families (School commute, Rain timing, Severe safety)
 * 6. Agriculture & Gardeners (Soil moisture, 7-day rain, Frost, Crops)
 * 7. Commuters (Visibility/Fog, Road safety, Traffic delay risk)
 * 8. Event Planners (Comfort index, Extended rain probability, Venue tips)
 * =======================================================================
 */

enum class PersonaType(
    val idName: String,
    val displayName: String,
    val emoji: String,
    val tagline: String
) {
    HEALTH("health", "Health & Wellness", "🫁", "Air Quality, Pollen, UV & Asthma Alerts"),
    FITNESS("fitness", "Outdoor Fitness", "🏃", "Optimal Workout Windows & Heat Index"),
    BEACH("beach", "Beach & Surfing", "🏄", "Tide Timings, Wave Heights & Sea State"),
    TRAVEL("travel", "Travel & Transit", "✈️", "Flight Weather & Smart Packing Assistant"),
    FAMILY("family", "Parents & Family", "👨‍👩‍👧", "School Commute & Daily Safety Radar"),
    AGRICULTURE("agri", "Agriculture & Gardeners", "🌾", "Soil Moisture, Frost & Rain Forecast"),
    COMMUTE("commute", "Daily Commuters", "🚗", "Fog, Visibility & Road Risk Updates"),
    EVENT_PLANNER("events", "Event Planners", "🎉", "Outdoor Comfort Index & Extended Rain");

    companion object {
        fun fromId(id: String): PersonaType? = entries.firstOrNull { it.idName == id }
    }
}

enum class CardPriority(val label: String, val level: Int) {
    CRITICAL("🚨 CRITICAL ALERT", 4),
    HIGH("⚠️ HIGH RELEVANCE", 3),
    MEDIUM("ℹ️ ADVISORY", 2),
    NORMAL("✅ OPTIMAL", 1)
}

data class MetricBadge(
    val label: String,
    val value: String,
    val unit: String = "",
    val statusColorHex: String = "#1E3E62",
    val note: String = ""
)

data class TidePoint(
    val time: String,
    val heightMeters: Float,
    val type: String // "HIGH" or "LOW"
)

data class SavedCityWeather(
    val cityName: String,
    val country: String,
    val temperature: Int,
    val condition: String,
    val icon: String,
    val flightDisruptionRisk: String, // "Low Risk", "Delay Warning", "Turbulence Alert"
    val packingSuggestions: List<String>
)

data class ExplainabilityBreakdown(
    val personaWeight: Float = 0.40f,
    val personaScore: Float = 1.0f,
    val severityWeight: Float = 0.30f,
    val severityScore: Float = 0.8f,
    val urgencyWeight: Float = 0.20f,
    val urgencyScore: Float = 0.7f,
    val contextWeight: Float = 0.10f,
    val contextScore: Float = 0.9f,
    val totalScorePercent: Int = 85,
    val reasons: List<String> = emptyList()
)

data class InsightCard(
    val id: String,
    val domain: PersonaType,
    val title: String,
    val subtitle: String,
    val icon: String,
    val priority: CardPriority,
    val heroMetric: MetricBadge? = null,
    val metricList: List<MetricBadge> = emptyList(),
    val advisories: List<String> = emptyList(),
    val explainability: ExplainabilityBreakdown,
    val actionCta: String? = null
)

data class HourlyForecast(
    val hourTime: String,
    val tempC: Int,
    val icon: String,
    val rainProbability: Int,
    val aqi: Int,
    val condition: String
)

data class WeatherData(
    val city: String = "Delhi NCR",
    val state: String = "Delhi",
    val temperature: Int = 28,
    val feelsLike: Int = 31,
    val condition: String = "Hazy & Warm",
    val icon: String = "☀️",
    val humidityPercent: Int = 68,
    val windSpeedKmph: Int = 14,
    val windDirection: String = "NW",
    val uvIndex: Int = 7,
    val hourOfDay: Int = 8,
    val severeEmergencyAlert: String? = null,

    // 1. Health Specifics
    val aqi: Int = 310,
    val aqiCategory: String = "Very Poor",
    val pm25: Int = 185,
    val pm10: Int = 260,
    val treePollenLevel: String = "High",
    val grassPollenLevel: String = "Moderate",
    val weedPollenLevel: String = "Low",
    val asthmaRiskLevel: String = "High Warning",

    // 2. Outdoor Fitness
    val sunriseTime: String = "5:48 AM",
    val sunsetTime: String = "6:52 PM",
    val bestRunningWindow: String = "5:30 AM – 7:15 AM",
    val workoutSafetyIndex: String = "Caution (Smog & Heat)",
    val optimalHydrationMlPerHour: Int = 650,

    // 3. Beach & Surfers
    val seaCondition: String = "Calm Waters",
    val waveHeightMeters: Float = 1.2f,
    val waterTemperatureC: Int = 27,
    val ripCurrentRisk: String = "Low Risk",
    val tides: List<TidePoint> = listOf(
        TidePoint("06:14 AM", 2.1f, "HIGH"),
        TidePoint("12:35 PM", 0.5f, "LOW"),
        TidePoint("06:50 PM", 2.3f, "HIGH"),
        TidePoint("11:58 PM", 0.8f, "LOW")
    ),

    // 4. Travelers
    val flightDisruptionAlert: String? = null,
    val savedDestinations: List<SavedCityWeather> = emptyList(),

    // 5. Parents & Families
    val schoolCommuteStatus: String = "Clear & Manageable",
    val schoolCommuteAlert: String? = null,
    val rainProbability: Int = 25,
    val playgroundOutdoorSafety: String = "Safe until 11:00 AM",

    // 6. Agriculture & Gardeners
    val soilMoisturePercent: Int = 42,
    val soilTempC: Int = 24,
    val rainfall7DaySumMm: Int = 35,
    val frostWarning: String? = null,
    val cropAdvisoryNote: String = "Ideal conditions for foliar nutrient spray and light irrigation.",

    // 7. Commuters
    val visibilityKm: Float = 1.8f,
    val fogSmogAlert: String? = "Dense Morning Smog - Reduce Speed",
    val roadAquaplaningRisk: String = "Low",
    val commuteDelayImpactScore: String = "Moderate (+15 mins)",

    // 8. Event Planners
    val outdoorComfortIndex: String = "Good (76/100)",
    val rainChanceExtendedDays: Int = 20,
    val weddingEventSuitability: String = "Excellent for Evening Open-air Gatherings",

    // Hourly Curve
    val hourlyForecasts: List<HourlyForecast> = emptyList()
)

data class UserPreferences(
    val activePersonas: MutableSet<PersonaType> = mutableSetOf(
        PersonaType.HEALTH,
        PersonaType.FITNESS,
        PersonaType.COMMUTE,
        PersonaType.FAMILY
    ),
    val selectedCity: String = "Delhi NCR",
    val hasAsthmaOrAllergies: Boolean = true,
    val preferredWorkoutTime: String = "Morning (6 AM)",
    val commuteWindow: String = "8:30 AM - 9:30 AM",
    val primaryCrop: String = "Wheat / Vegetables"
)
