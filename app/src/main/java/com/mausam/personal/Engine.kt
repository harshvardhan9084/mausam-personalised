package com.mausam.personal

/**
 * =======================================================================
 * Engine.kt: IMD Mausam Personalization & Decision Engine (SIH 26076)
 *
 * Implements a weighted 4-factor scoring algorithm:
 *   Score = (Persona Relevance × 0.40)
 *         + (Weather Severity × 0.30)
 *         + (Time Urgency × 0.20)
 *         + (Context / Location Fit × 0.10)
 *
 * Dynamically produces ranked, domain-specific Smart Insight Cards
 * with complete Explainable AI rationale for all 8 SIH domains.
 * =======================================================================
 */

object MausamEngine {

    fun generatePersonalizedCards(
        weather: WeatherData,
        preferences: UserPreferences
    ): List<InsightCard> {
        val candidateCards = mutableListOf<InsightCard>()

        // 1. Health & Wellness Card
        candidateCards.add(buildHealthCard(weather, preferences))

        // 2. Outdoor Fitness Enthusiast Card
        candidateCards.add(buildFitnessCard(weather, preferences))

        // 3. Beachgoers & Surfers Card (only if coastal / beach data available)
        if (weather.waveHeightMeters > 0.0f || weather.tides.isNotEmpty()) {
            candidateCards.add(buildBeachCard(weather, preferences))
        }

        // 4. Travelers & Transit Card
        if (weather.savedDestinations.isNotEmpty() || weather.flightDisruptionAlert != null) {
            candidateCards.add(buildTravelCard(weather, preferences))
        }

        // 5. Parents & Family Card
        candidateCards.add(buildFamilyCard(weather, preferences))

        // 6. Agriculture & Gardeners Card
        candidateCards.add(buildAgriCard(weather, preferences))

        // 7. Commuters & Road Safety Card
        candidateCards.add(buildCommuterCard(weather, preferences))

        // 8. Event Planners & Gatherings Card
        candidateCards.add(buildEventPlannerCard(weather, preferences))

        // Filter and Rank
        // Active personas get higher base priority, but critical weather emergencies always surface to top
        val rankedCards = candidateCards.sortedWith(
            compareByDescending<InsightCard> { it.priority.level }
                .thenByDescending { it.explainability.totalScorePercent }
        )

        return rankedCards
    }

    // -------------------------------------------------------------
    // DOMAIN 1: Health & Wellness
    // -------------------------------------------------------------
    private fun buildHealthCard(weather: WeatherData, preferences: UserPreferences): InsightCard {
        val isActive = preferences.activePersonas.contains(PersonaType.HEALTH)
        val pRel = if (isActive) 1.0f else 0.35f

        val sevScore = when {
            weather.aqi >= 300 -> 1.0f
            weather.aqi >= 200 -> 0.8f
            weather.aqi >= 100 -> 0.5f
            else -> 0.2f
        }

        val urgScore = if (weather.aqi >= 250 || weather.asthmaRiskLevel.contains("HAZARD", true)) 0.95f else 0.4f
        val ctxScore = if (weather.hourOfDay in 6..10 || weather.hourOfDay in 18..22) 0.9f else 0.6f

        val totalPercent = ((pRel * 0.40f + sevScore * 0.30f + urgScore * 0.20f + ctxScore * 0.10f) * 100).toInt()

        val priority = when {
            weather.aqi >= 300 -> CardPriority.CRITICAL
            weather.aqi >= 200 -> CardPriority.HIGH
            isActive -> CardPriority.MEDIUM
            else -> CardPriority.NORMAL
        }

        val reasons = mutableListOf<String>()
        if (isActive) reasons.add("Your active profile: Health & Wellness (Asthma/Allergy mode)")
        reasons.add("Real-time AQI: ${weather.aqi} (${weather.aqiCategory})")
        reasons.add("PM2.5: ${weather.pm25} µg/m³, PM10: ${weather.pm10} µg/m³")
        reasons.add("Pollen Levels: Tree (${weather.treePollenLevel}), Weed (${weather.weedPollenLevel})")
        if (weather.aqi >= 250) reasons.add("Hazardous particulate concentration requires immediate respiratory protection")

        val advisories = mutableListOf<String>()
        if (weather.aqi >= 300) {
            advisories.add("Wear an N95/N99 respirator if stepping outdoors.")
            advisories.add("Keep indoor air purifiers running on maximum filtration.")
            advisories.add("Asthma inhaler users: keep rescue medication readily accessible.")
        } else if (weather.aqi >= 150) {
            advisories.add("Sensitive groups should reduce prolonged outdoor exertion.")
            advisories.add("Pollen count elevated; close windows during early morning hours.")
        } else {
            advisories.add("Clean air window: Great time for natural room ventilation.")
            advisories.add("Pollen and UV levels within comfortable safety bounds.")
        }

        return InsightCard(
            id = "card_health_aqi",
            domain = PersonaType.HEALTH,
            title = "Air Quality & Health Shield",
            subtitle = "AQI ${weather.aqi} • ${weather.aqiCategory}",
            icon = "🫁",
            priority = priority,
            heroMetric = MetricBadge("Air Quality Index", "${weather.aqi}", "AQI", if (weather.aqi > 200) "#DC2626" else "#16A34A", weather.aqiCategory),
            metricList = listOf(
                MetricBadge("PM 2.5", "${weather.pm25}", "µg/m³", "#DC2626"),
                MetricBadge("PM 10", "${weather.pm10}", "µg/m³", "#D97706"),
                MetricBadge("UV Index", "${weather.uvIndex}", "/11", "#2563EB"),
                MetricBadge("Pollen", weather.treePollenLevel, "Tree", "#8B5CF6")
            ),
            advisories = advisories,
            explainability = ExplainabilityBreakdown(
                personaWeight = 0.40f,
                personaScore = pRel,
                severityWeight = 0.30f,
                severityScore = sevScore,
                urgencyWeight = 0.20f,
                urgencyScore = urgScore,
                contextWeight = 0.10f,
                contextScore = ctxScore,
                totalScorePercent = totalPercent,
                reasons = reasons
            ),
            actionCta = if (weather.aqi >= 200) "View Respiratory Defense Plan" else "View Full Pollen Radar"
        )
    }

    // -------------------------------------------------------------
    // DOMAIN 2: Outdoor Fitness Enthusiasts
    // -------------------------------------------------------------
    private fun buildFitnessCard(weather: WeatherData, preferences: UserPreferences): InsightCard {
        val isActive = preferences.activePersonas.contains(PersonaType.FITNESS)
        val pRel = if (isActive) 1.0f else 0.30f

        val isHazardousAir = weather.aqi > 250
        val isExtremeHeat = weather.temperature >= 38 || weather.uvIndex >= 9
        val isRaining = weather.rainProbability >= 70

        val sevScore = if (isHazardousAir || isExtremeHeat || isRaining) 0.9f else 0.3f
        val urgScore = if (weather.hourOfDay in 5..9 || weather.hourOfDay in 17..20) 0.95f else 0.4f
        val ctxScore = 0.8f

        val totalPercent = ((pRel * 0.40f + sevScore * 0.30f + urgScore * 0.20f + ctxScore * 0.10f) * 100).toInt()

        val priority = when {
            isHazardousAir && isActive -> CardPriority.HIGH
            isActive -> CardPriority.MEDIUM
            else -> CardPriority.NORMAL
        }

        val reasons = listOf(
            if (isActive) "Your active profile: Outdoor Fitness Enthusiast" else "General fitness optimization",
            "Optimal Running Window: ${weather.bestRunningWindow}",
            "Sun Schedule: Sunrise at ${weather.sunriseTime}, Sunset at ${weather.sunsetTime}",
            "Temperature: ${weather.temperature}°C (Feels like ${weather.feelsLike}°C), Wind: ${weather.windSpeedKmph} km/h ${weather.windDirection}",
            if (isHazardousAir) "High AQI restricts safe cardiovascular exertion outdoors" else "Workout safety condition: ${weather.workoutSafetyIndex}"
        )

        val advisories = listOf(
            "Target Running Window: ${weather.bestRunningWindow}.",
            "Hydration Target: Drink at least ${weather.optimalHydrationMlPerHour} ml/hour during physical activity.",
            if (weather.uvIndex >= 8) "Apply water-resistant broad spectrum sunscreen SPF 50+." else "Wind resistance: ${weather.windSpeedKmph} km/h from ${weather.windDirection}."
        )

        return InsightCard(
            id = "card_fitness_window",
            domain = PersonaType.FITNESS,
            title = "Workout & Running Window",
            subtitle = weather.bestRunningWindow,
            icon = "🏃",
            priority = priority,
            heroMetric = MetricBadge("Best Run Time", weather.bestRunningWindow.substringBefore(" ("), "", "#1E3E62", "Optimal window"),
            metricList = listOf(
                MetricBadge("Sunrise", weather.sunriseTime, "", "#EA580C"),
                MetricBadge("Sunset", weather.sunsetTime, "", "#9333EA"),
                MetricBadge("Wind", "${weather.windSpeedKmph}", "km/h ${weather.windDirection}", "#0284C7"),
                MetricBadge("Hydration", "${weather.optimalHydrationMlPerHour}", "ml/hr", "#059669")
            ),
            advisories = advisories,
            explainability = ExplainabilityBreakdown(
                personaWeight = 0.40f,
                personaScore = pRel,
                severityWeight = 0.30f,
                severityScore = sevScore,
                urgencyWeight = 0.20f,
                urgencyScore = urgScore,
                contextWeight = 0.10f,
                contextScore = ctxScore,
                totalScorePercent = totalPercent,
                reasons = reasons
            ),
            actionCta = "Plan Workout Route"
        )
    }

    // -------------------------------------------------------------
    // DOMAIN 3: Beachgoers & Surfers
    // -------------------------------------------------------------
    private fun buildBeachCard(weather: WeatherData, preferences: UserPreferences): InsightCard {
        val isActive = preferences.activePersonas.contains(PersonaType.BEACH)
        val pRel = if (isActive) 1.0f else 0.20f

        val isRoughSea = weather.waveHeightMeters >= 2.5f || weather.ripCurrentRisk.contains("DANGER", true)
        val sevScore = if (isRoughSea) 0.95f else 0.4f
        val urgScore = if (isActive) 0.8f else 0.3f
        val ctxScore = 0.85f

        val totalPercent = ((pRel * 0.40f + sevScore * 0.30f + urgScore * 0.20f + ctxScore * 0.10f) * 100).toInt()

        val priority = when {
            isRoughSea -> CardPriority.CRITICAL
            isActive -> CardPriority.HIGH
            else -> CardPriority.NORMAL
        }

        val reasons = listOf(
            if (isActive) "Your active profile: Beachgoer & Surfer" else "Coastal marine monitoring",
            "Sea Condition: ${weather.seaCondition}",
            "Wave Height: ${weather.waveHeightMeters} meters, Water Temp: ${weather.waterTemperatureC}°C",
            "Rip Current Alert: ${weather.ripCurrentRisk}",
            "Next High Tide: ${weather.tides.firstOrNull { it.type == "HIGH" }?.let { "${it.time} (${it.heightMeters}m)" } ?: "N/A"}"
        )

        val advisories = listOf(
            "Wave Swell: ${weather.waveHeightMeters}m swells with ${weather.waterTemperatureC}°C coastal sea temperature.",
            "Tide Schedule: High tide at ${weather.tides.firstOrNull { it.type == "HIGH" }?.time ?: "Morning"}, Low tide at ${weather.tides.firstOrNull { it.type == "LOW" }?.time ?: "Afternoon"}.",
            if (isRoughSea) "DANGER: High swells & rip currents. Strictly follow lifeguard flags." else "Ideal conditions for surfing, paddleboarding, and coastal leisure."
        )

        return InsightCard(
            id = "card_beach_marine",
            domain = PersonaType.BEACH,
            title = "Marine & Surfing Conditions",
            subtitle = "${weather.waveHeightMeters}m Waves • ${weather.seaCondition}",
            icon = "🏄",
            priority = priority,
            heroMetric = MetricBadge("Wave Height", "${weather.waveHeightMeters}", "m", if (weather.waveHeightMeters > 2.0f) "#0284C7" else "#16A34A", weather.seaCondition),
            metricList = listOf(
                MetricBadge("Water Temp", "${weather.waterTemperatureC}°C", "", "#0284C7"),
                MetricBadge("Rip Current", weather.ripCurrentRisk.substringBefore(" "), "", if (isRoughSea) "#DC2626" else "#16A34A"),
                MetricBadge("High Tide", weather.tides.firstOrNull { it.type == "HIGH" }?.time ?: "--", "", "#4F46E5"),
                MetricBadge("Low Tide", weather.tides.firstOrNull { it.type == "LOW" }?.time ?: "--", "", "#059669")
            ),
            advisories = advisories,
            explainability = ExplainabilityBreakdown(
                personaWeight = 0.40f,
                personaScore = pRel,
                severityWeight = 0.30f,
                severityScore = sevScore,
                urgencyWeight = 0.20f,
                urgencyScore = urgScore,
                contextWeight = 0.10f,
                contextScore = ctxScore,
                totalScorePercent = totalPercent,
                reasons = reasons
            ),
            actionCta = "View 24h Tide Curve"
        )
    }

    // -------------------------------------------------------------
    // DOMAIN 4: Travelers & Transit
    // -------------------------------------------------------------
    private fun buildTravelCard(weather: WeatherData, preferences: UserPreferences): InsightCard {
        val isActive = preferences.activePersonas.contains(PersonaType.TRAVEL)
        val pRel = if (isActive) 1.0f else 0.25f

        val hasFlightAlert = weather.flightDisruptionAlert != null
        val sevScore = if (hasFlightAlert) 0.85f else 0.35f
        val urgScore = if (hasFlightAlert) 0.9f else 0.4f
        val ctxScore = 0.8f

        val totalPercent = ((pRel * 0.40f + sevScore * 0.30f + urgScore * 0.20f + ctxScore * 0.10f) * 100).toInt()

        val priority = when {
            hasFlightAlert -> CardPriority.HIGH
            isActive -> CardPriority.MEDIUM
            else -> CardPriority.NORMAL
        }

        val reasons = mutableListOf<String>()
        if (isActive) reasons.add("Your active profile: Traveler & Transit")
        if (hasFlightAlert) reasons.add("Active Flight Advisory: ${weather.flightDisruptionAlert}")
        if (weather.savedDestinations.isNotEmpty()) {
            reasons.add("Tracking ${weather.savedDestinations.size} saved destinations: ${weather.savedDestinations.joinToString { it.cityName }}")
        }

        val advisories = mutableListOf<String>()
        if (hasFlightAlert) {
            advisories.add("Flight Alert: ${weather.flightDisruptionAlert}")
        }
        weather.savedDestinations.take(2).forEach { dest ->
            advisories.add("Packing for ${dest.cityName} (${dest.temperature}°C, ${dest.condition}): ${dest.packingSuggestions.joinToString()}")
        }

        return InsightCard(
            id = "card_travel_destinations",
            domain = PersonaType.TRAVEL,
            title = "Transit Radar & Smart Packing",
            subtitle = if (hasFlightAlert) "Flight Disruption Warning" else "${weather.savedDestinations.size} Tracked Destinations",
            icon = "✈️",
            priority = priority,
            heroMetric = MetricBadge("Flight Ops", if (hasFlightAlert) "Delays" else "Normal", "", if (hasFlightAlert) "#D97706" else "#16A34A", "Airport status"),
            metricList = weather.savedDestinations.take(4).map { dest ->
                MetricBadge(dest.cityName, "${dest.temperature}°C", dest.icon, "#1E3E62", dest.flightDisruptionRisk)
            },
            advisories = advisories,
            explainability = ExplainabilityBreakdown(
                personaWeight = 0.40f,
                personaScore = pRel,
                severityWeight = 0.30f,
                severityScore = sevScore,
                urgencyWeight = 0.20f,
                urgencyScore = urgScore,
                contextWeight = 0.10f,
                contextScore = ctxScore,
                totalScorePercent = totalPercent,
                reasons = reasons
            ),
            actionCta = "Open Smart Packing Assistant"
        )
    }

    // -------------------------------------------------------------
    // DOMAIN 5: Parents & Family
    // -------------------------------------------------------------
    private fun buildFamilyCard(weather: WeatherData, preferences: UserPreferences): InsightCard {
        val isActive = preferences.activePersonas.contains(PersonaType.FAMILY)
        val pRel = if (isActive) 1.0f else 0.25f

        val hasSchoolAlert = weather.schoolCommuteAlert != null || weather.rainProbability >= 60 || weather.aqi > 250
        val sevScore = if (hasSchoolAlert) 0.9f else 0.3f
        val urgScore = if (weather.hourOfDay in 6..9 || weather.hourOfDay in 14..16) 0.95f else 0.4f
        val ctxScore = 0.85f

        val totalPercent = ((pRel * 0.40f + sevScore * 0.30f + urgScore * 0.20f + ctxScore * 0.10f) * 100).toInt()

        val priority = when {
            hasSchoolAlert && isActive -> CardPriority.HIGH
            isActive -> CardPriority.MEDIUM
            else -> CardPriority.NORMAL
        }

        val reasons = listOf(
            if (isActive) "Your active profile: Parents & Families" else "Family daily routine protection",
            "School Commute Status: ${weather.schoolCommuteStatus}",
            "Rain Probability: ${weather.rainProbability}%",
            "Playground & Outdoor Safety: ${weather.playgroundOutdoorSafety}",
            if (weather.schoolCommuteAlert != null) "Commute advisory: ${weather.schoolCommuteAlert}" else "Normal transit window"
        )

        val advisories = listOf(
            "School Commute Window: ${weather.schoolCommuteStatus}.",
            weather.schoolCommuteAlert ?: "Clear route conditions for morning drop-off & afternoon pickup.",
            "Outdoor Play Recommendation: ${weather.playgroundOutdoorSafety}."
        )

        return InsightCard(
            id = "card_family_school",
            domain = PersonaType.FAMILY,
            title = "School Commute & Family Radar",
            subtitle = weather.schoolCommuteStatus,
            icon = "👨‍👩‍👧",
            priority = priority,
            heroMetric = MetricBadge("Commute Safety", if (hasSchoolAlert) "Alert" else "Safe", "", if (hasSchoolAlert) "#DC2626" else "#16A34A", "For school transit"),
            metricList = listOf(
                MetricBadge("Rain Chance", "${weather.rainProbability}%", "", if (weather.rainProbability > 50) "#DC2626" else "#16A34A"),
                MetricBadge("Air Quality", "${weather.aqi}", "AQI", if (weather.aqi > 200) "#DC2626" else "#16A34A"),
                MetricBadge("UV Exposure", "${weather.uvIndex}", "/11", "#EA580C"),
                MetricBadge("Outdoor Play", if (weather.aqi > 200) "Avoid" else "Safe", "", "#2563EB")
            ),
            advisories = advisories,
            explainability = ExplainabilityBreakdown(
                personaWeight = 0.40f,
                personaScore = pRel,
                severityWeight = 0.30f,
                severityScore = sevScore,
                urgencyWeight = 0.20f,
                urgencyScore = urgScore,
                contextWeight = 0.10f,
                contextScore = ctxScore,
                totalScorePercent = totalPercent,
                reasons = reasons
            ),
            actionCta = "Set School Alarm Notification"
        )
    }

    // -------------------------------------------------------------
    // DOMAIN 6: Agriculture & Gardeners
    // -------------------------------------------------------------
    private fun buildAgriCard(weather: WeatherData, preferences: UserPreferences): InsightCard {
        val isActive = preferences.activePersonas.contains(PersonaType.AGRICULTURE)
        val pRel = if (isActive) 1.0f else 0.20f

        val hasFrostOrRain = weather.frostWarning != null || weather.rainfall7DaySumMm >= 80
        val sevScore = if (hasFrostOrRain) 0.9f else 0.3f
        val urgScore = if (isActive) 0.8f else 0.3f
        val ctxScore = 0.8f

        val totalPercent = ((pRel * 0.40f + sevScore * 0.30f + urgScore * 0.20f + ctxScore * 0.10f) * 100).toInt()

        val priority = when {
            weather.frostWarning != null -> CardPriority.CRITICAL
            hasFrostOrRain -> CardPriority.HIGH
            isActive -> CardPriority.MEDIUM
            else -> CardPriority.NORMAL
        }

        val reasons = listOf(
            if (isActive) "Your active profile: Agriculture & Gardeners" else "Agrometeorological insight",
            "Root Zone Soil Moisture: ${weather.soilMoisturePercent}% at 15cm depth",
            "7-Day Cumulative Rainfall: ${weather.rainfall7DaySumMm} mm",
            if (weather.frostWarning != null) "FROST ALERT: ${weather.frostWarning}" else "Frost Risk: None currently",
            "Seasonal Crop Stage: ${weather.cropAdvisoryNote}"
        )

        val advisories = listOf(
            weather.cropAdvisoryNote,
            "Soil Moisture: ${weather.soilMoisturePercent}% (Optimal 50-70%). Soil temperature is ${weather.soilTempC}°C.",
            if (weather.frostWarning != null) "URGENT: ${weather.frostWarning}" else "Upcoming 7-day cumulative rainfall: ${weather.rainfall7DaySumMm} mm."
        )

        return InsightCard(
            id = "card_agri_soil",
            domain = PersonaType.AGRICULTURE,
            title = "Agri-Meteorology & Soil Radar",
            subtitle = "${weather.soilMoisturePercent}% Soil Moisture • ${weather.rainfall7DaySumMm}mm 7-Day Rain",
            icon = "🌾",
            priority = priority,
            heroMetric = MetricBadge("Soil Moisture", "${weather.soilMoisturePercent}%", "", if (weather.soilMoisturePercent in 45..75) "#16A34A" else "#D97706", "Root level"),
            metricList = listOf(
                MetricBadge("7-Day Rain", "${weather.rainfall7DaySumMm}", "mm", "#0284C7"),
                MetricBadge("Soil Temp", "${weather.soilTempC}°C", "", "#D97706"),
                MetricBadge("Frost Risk", if (weather.frostWarning != null) "YES" else "None", "", if (weather.frostWarning != null) "#DC2626" else "#16A34A"),
                MetricBadge("Humidity", "${weather.humidityPercent}%", "", "#4F46E5")
            ),
            advisories = advisories,
            explainability = ExplainabilityBreakdown(
                personaWeight = 0.40f,
                personaScore = pRel,
                severityWeight = 0.30f,
                severityScore = sevScore,
                urgencyWeight = 0.20f,
                urgencyScore = urgScore,
                contextWeight = 0.10f,
                contextScore = ctxScore,
                totalScorePercent = totalPercent,
                reasons = reasons
            ),
            actionCta = "Open Seasonal Crop Calendar"
        )
    }

    // -------------------------------------------------------------
    // DOMAIN 7: Daily Commuters
    // -------------------------------------------------------------
    private fun buildCommuterCard(weather: WeatherData, preferences: UserPreferences): InsightCard {
        val isActive = preferences.activePersonas.contains(PersonaType.COMMUTE)
        val pRel = if (isActive) 1.0f else 0.25f

        val isLowVis = weather.visibilityKm <= 1.0f || weather.fogSmogAlert != null
        val sevScore = if (isLowVis) 0.95f else 0.3f
        val urgScore = if (weather.hourOfDay in 7..10 || weather.hourOfDay in 17..20) 0.95f else 0.4f
        val ctxScore = 0.85f

        val totalPercent = ((pRel * 0.40f + sevScore * 0.30f + urgScore * 0.20f + ctxScore * 0.10f) * 100).toInt()

        val priority = when {
            weather.visibilityKm <= 0.5f -> CardPriority.CRITICAL
            isLowVis -> CardPriority.HIGH
            isActive -> CardPriority.MEDIUM
            else -> CardPriority.NORMAL
        }

        val reasons = listOf(
            if (isActive) "Your active profile: Daily Commuters" else "Urban transit & road safety",
            "Visibility Range: ${weather.visibilityKm} km",
            if (weather.fogSmogAlert != null) "Traffic Alert: ${weather.fogSmogAlert}" else "Clear highway visibility",
            "Road Surface Condition: Aquaplaning risk ${weather.roadAquaplaningRisk}",
            "Weather Delay Impact: ${weather.commuteDelayImpactScore}"
        )

        val advisories = listOf(
            "Road Visibility: ${weather.visibilityKm} km. ${weather.fogSmogAlert ?: "Clear road visibility across major corridors."}",
            "Tire Grip / Wetness: ${weather.roadAquaplaningRisk} aquaplaning hazard.",
            "Transit Buffer: Add ${weather.commuteDelayImpactScore} to planned travel schedule."
        )

        val delayColor = when {
            weather.commuteDelayImpactScore.contains("Critical", true) || weather.commuteDelayImpactScore.contains("Severe", true) -> "#DC2626"
            weather.commuteDelayImpactScore.contains("Moderate", true) || weather.commuteDelayImpactScore.contains("Slight", true) -> "#D97706"
            else -> "#16A34A"
        }

        val isHazardousRoad = weather.roadAquaplaningRisk.contains("EXTREME", true) ||
                weather.roadAquaplaningRisk.contains("BLACK ICE", true) ||
                weather.roadAquaplaningRisk.contains("High", true)
        val aquaColor = when {
            isHazardousRoad -> "#DC2626"
            weather.roadAquaplaningRisk.contains("Moderate", true) -> "#D97706"
            else -> "#16A34A"
        }

        val aquaDisplay = when {
            weather.roadAquaplaningRisk.contains("BLACK ICE", true) -> "Ice Alert"
            weather.roadAquaplaningRisk.contains("EXTREME", true) -> "Extreme"
            weather.roadAquaplaningRisk.contains("High", true) -> "High"
            weather.roadAquaplaningRisk.contains("Moderate", true) -> "Moderate"
            else -> "Low / None"
        }

        return InsightCard(
            id = "card_commute_traffic",
            domain = PersonaType.COMMUTE,
            title = "Commute Visibility & Road Safety",
            subtitle = "${weather.visibilityKm}km Visibility • ${weather.commuteDelayImpactScore}",
            icon = "🚗",
            priority = priority,
            heroMetric = MetricBadge("Visibility", "${weather.visibilityKm}", "km", if (weather.visibilityKm < 1.0f) "#DC2626" else "#16A34A", "Road distance"),
            metricList = listOf(
                MetricBadge("Delay Index", weather.commuteDelayImpactScore.substringBefore(" "), "", delayColor),
                MetricBadge("Aquaplaning", aquaDisplay, "", aquaColor),
                MetricBadge("Wind Gusts", "${weather.windSpeedKmph}", "km/h", "#0284C7"),
                MetricBadge("Humidity", "${weather.humidityPercent}%", "", "#8B5CF6")
            ),
            advisories = advisories,
            explainability = ExplainabilityBreakdown(
                personaWeight = 0.40f,
                personaScore = pRel,
                severityWeight = 0.30f,
                severityScore = sevScore,
                urgencyWeight = 0.20f,
                urgencyScore = urgScore,
                contextWeight = 0.10f,
                contextScore = ctxScore,
                totalScorePercent = totalPercent,
                reasons = reasons
            ),
            actionCta = "Check Highway Fog Radar"
        )
    }

    // -------------------------------------------------------------
    // DOMAIN 8: Event Planners
    // -------------------------------------------------------------
    private fun buildEventPlannerCard(weather: WeatherData, preferences: UserPreferences): InsightCard {
        val isActive = preferences.activePersonas.contains(PersonaType.EVENT_PLANNER)
        val pRel = if (isActive) 1.0f else 0.20f

        val isHighComfort = weather.outdoorComfortIndex.contains("Exceptional", true) ||
                weather.outdoorComfortIndex.contains("High", true) ||
                weather.outdoorComfortIndex.contains("Good", true)
        val sevScore = if (weather.rainChanceExtendedDays >= 60) 0.85f else 0.3f
        val urgScore = if (isActive) 0.75f else 0.3f
        val ctxScore = 0.8f

        val totalPercent = ((pRel * 0.40f + sevScore * 0.30f + urgScore * 0.20f + ctxScore * 0.10f) * 100).toInt()

        val priority = when {
            weather.rainChanceExtendedDays >= 75 -> CardPriority.HIGH
            isActive -> CardPriority.MEDIUM
            else -> CardPriority.NORMAL
        }

        val reasons = listOf(
            if (isActive) "Your active profile: Event Planners & Gatherings" else "Outdoor event suitability",
            "Outdoor Comfort Index: ${weather.outdoorComfortIndex}",
            "Extended Rain Probability: ${weather.rainChanceExtendedDays}%",
            "Venue Advisory: ${weather.weddingEventSuitability}"
        )

        val advisories = listOf(
            "Outdoor Comfort Score: ${weather.outdoorComfortIndex}.",
            "Precipitation Outlook: ${weather.rainChanceExtendedDays}% rain risk over extended timeline.",
            "Venue Advisory: ${weather.weddingEventSuitability}."
        )

        val comfortColor = when {
            isHighComfort -> "#16A34A"
            weather.outdoorComfortIndex.contains("Damp", true) ||
                    weather.outdoorComfortIndex.contains("Brisk", true) ||
                    weather.outdoorComfortIndex.contains("Crisp", true) -> "#D97706"
            else -> "#DC2626"
        }

        return InsightCard(
            id = "card_event_comfort",
            domain = PersonaType.EVENT_PLANNER,
            title = "Outdoor Comfort & Event Radar",
            subtitle = weather.outdoorComfortIndex,
            icon = "🎉",
            priority = priority,
            heroMetric = MetricBadge("Comfort Index", weather.outdoorComfortIndex.substringBefore(" "), "", comfortColor, "Open-air rating"),
            metricList = listOf(
                MetricBadge("Rain Chance", "${weather.rainChanceExtendedDays}%", "10-day", if (weather.rainChanceExtendedDays > 50) "#DC2626" else "#16A34A"),
                MetricBadge("Temperature", "${weather.temperature}°C", "", "#EA580C"),
                MetricBadge("Feels Like", "${weather.feelsLike}°C", "", "#D97706"),
                MetricBadge("Wind Speed", "${weather.windSpeedKmph}", "km/h", "#0284C7")
            ),
            advisories = advisories,
            explainability = ExplainabilityBreakdown(
                personaWeight = 0.40f,
                personaScore = pRel,
                severityWeight = 0.30f,
                severityScore = sevScore,
                urgencyWeight = 0.20f,
                urgencyScore = urgScore,
                contextWeight = 0.10f,
                contextScore = ctxScore,
                totalScorePercent = totalPercent,
                reasons = reasons
            ),
            actionCta = "Calculate 10-Day Venue Index"
        )
    }
}
