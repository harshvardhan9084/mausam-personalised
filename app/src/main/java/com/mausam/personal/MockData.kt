package com.mausam.personal

/**
 * =======================================================================
 * MockData.kt: Official IMD/MoES Comprehensive Datasets
 * Covers all 8 SIH 26076 domains with realistic meteorological data:
 * - Delhi NCR (Severe Air Quality, Fog Commute, Health & Asthma)
 * - Goa Coast (Surfing, Tides, Marine, Beachgoer safety)
 * - Bengaluru (Outdoor Fitness, Gardeners, Event Planning)
 * - Punjab Agri Belt (Soil moisture, 7-day rainfall, Fertilizer spray)
 * - Mumbai Coastal Monsoon (School commute alerts, Heavy rain, Flights)
 * - London (International travel, Cold drizzle, Packing suggestions)
 * - Shimla (Mountain frost, Icy roads, Woolen packing)
 * =======================================================================
 */

object MockData {

    fun getWeatherDataForCity(cityName: String): WeatherData {
        return when (cityName.lowercase().trim()) {
            "goa", "goa coast", "coastal" -> getGoaBeachScenario()
            "bengaluru", "bangalore" -> getBengaluruFitnessEventScenario()
            "punjab", "punjab agri belt", "farming" -> getPunjabAgriScenario()
            "mumbai", "mumbai monsoon" -> getMumbaiMonsoonScenario()
            "london", "uk", "travel" -> getLondonTravelScenario()
            "shimla", "hills" -> getShimlaFrostScenario()
            else -> getDelhiSmogHealthScenario()
        }
    }

    /**
     * SCENARIO 1: Delhi NCR - Severe Winter Smog & Commute Fog
     * Highlights: Health (AQI 385, PM2.5, Asthma Alert), Commute (Fog/Low visibility 0.4km), Family (School caution).
     */
    fun getDelhiSmogHealthScenario(): WeatherData {
        return WeatherData(
            city = "Delhi NCR",
            state = "Delhi",
            temperature = 18,
            feelsLike = 17,
            condition = "Dense Smog & Haze",
            icon = "🌫️",
            humidityPercent = 82,
            windSpeedKmph = 6,
            windDirection = "NW",
            uvIndex = 3,
            hourOfDay = 8,
            severeEmergencyAlert = "AIR QUALITY SEVERE (AQI 385): Sensitive groups must avoid all outdoor physical activities.",

            // 1. Health
            aqi = 385,
            aqiCategory = "Severe / Hazardous",
            pm25 = 245,
            pm10 = 360,
            treePollenLevel = "Moderate",
            grassPollenLevel = "Low",
            weedPollenLevel = "High",
            asthmaRiskLevel = "CRITICAL HAZARD",

            // 2. Fitness
            sunriseTime = "06:42 AM",
            sunsetTime = "05:48 PM",
            bestRunningWindow = "Shift to Indoor Gym / Treadmill Only",
            workoutSafetyIndex = "Hazardous Outdoors",
            optimalHydrationMlPerHour = 450,

            // 3. Beach (Landlocked)
            seaCondition = "N/A (Inland)",
            waveHeightMeters = 0.0f,
            waterTemperatureC = 0,
            ripCurrentRisk = "N/A",
            tides = emptyList(),

            // 4. Travel
            flightDisruptionAlert = "CAT III Low Visibility Operations active at IGI Airport (DEL). Expect 30-45m runway delays.",
            savedDestinations = listOf(
                SavedCityWeather("Goa", "India", 29, "Sunny & Breezy", "☀️", "On-Time", listOf("Sunscreen SPF 50", "Swimwear", "Flip flops")),
                SavedCityWeather("London", "UK", 12, "Chilly Drizzle", "🌧️", "Minor Delays", listOf("Windproof Umbrella", "Thermal Layer", "Waterproof Boots")),
                SavedCityWeather("Mumbai", "India", 31, "Humid & Clear", "🌤️", "On-Time", listOf("Cotton clothes", "Sunglasses"))
            ),

            // 5. Family
            schoolCommuteStatus = "Heavy Congestion & Smog",
            schoolCommuteAlert = "Morning school buses delayed due to dense fog. Keep N95 masks on children.",
            rainProbability = 5,
            playgroundOutdoorSafety = "UNSAFE: Air toxicity exceeds safe limits for children.",

            // 6. Agriculture
            soilMoisturePercent = 48,
            soilTempC = 16,
            rainfall7DaySumMm = 0,
            frostWarning = "Mild Ground Frost Alert in outer rural belts.",
            cropAdvisoryNote = "Irrigate wheat crop at CRI stage. Light evening irrigation prevents frost damage to mustard.",

            // 7. Commute
            visibilityKm = 0.4f,
            fogSmogAlert = "Dense Fog Advisory: Visibility 400m on Yamuna & Eastern Peripheral Expressways.",
            roadAquaplaningRisk = "None (Dry/Foggy)",
            commuteDelayImpactScore = "Severe Delay (+35 mins)",

            // 8. Event Planner
            outdoorComfortIndex = "Poor (42/100) due to air quality",
            rainChanceExtendedDays = 5,
            weddingEventSuitability = "Indoor Air-conditioned Venues Recommended",

            hourlyForecasts = listOf(
                HourlyForecast("6 AM", 15, "🌫️", 5, 395, "Dense Smog"),
                HourlyForecast("8 AM", 18, "🌫️", 5, 385, "Smoggy"),
                HourlyForecast("10 AM", 21, "⛅", 5, 340, "Hazy Sun"),
                HourlyForecast("12 PM", 24, "☀️", 5, 310, "Warm Sun"),
                HourlyForecast("3 PM", 25, "🌤️", 5, 320, "Hazy"),
                HourlyForecast("6 PM", 20, "🌫️", 5, 370, "Smog Drop"),
                HourlyForecast("9 PM", 17, "🌙", 5, 390, "Cold Fog")
            )
        )
    }

    /**
     * SCENARIO 2: Goa - Coastal Marine & Surfing Paradise
     * Highlights: Beachgoers (Wave height 2.4m, High Tides, 28°C Water), Fitness (Beach run 6 AM), Travel (Beach vacation).
     */
    fun getGoaBeachScenario(): WeatherData {
        return WeatherData(
            city = "Goa Coast",
            state = "Goa",
            temperature = 29,
            feelsLike = 33,
            condition = "Breezy & Coastal Sun",
            icon = "🏄",
            humidityPercent = 76,
            windSpeedKmph = 22,
            windDirection = "WSW",
            uvIndex = 9,
            hourOfDay = 7,
            severeEmergencyAlert = null,

            // 1. Health
            aqi = 28,
            aqiCategory = "Good / Clean Air",
            pm25 = 8,
            pm10 = 18,
            treePollenLevel = "Low",
            grassPollenLevel = "Low",
            weedPollenLevel = "Low",
            asthmaRiskLevel = "Minimal (Clean Sea Breeze)",

            // 2. Fitness
            sunriseTime = "06:18 AM",
            sunsetTime = "06:44 PM",
            bestRunningWindow = "05:45 AM – 07:30 AM (Breezy Sand Running)",
            workoutSafetyIndex = "Optimal (Hydrate for High UV)",
            optimalHydrationMlPerHour = 850,

            // 3. Beach & Surfing (Dominant)
            seaCondition = "Moderate Swell - Ideal for Surfers",
            waveHeightMeters = 2.4f,
            waterTemperatureC = 28,
            ripCurrentRisk = "Moderate near Rocky Points",
            tides = listOf(
                TidePoint("06:30 AM", 2.4f, "HIGH"),
                TidePoint("12:45 PM", 0.6f, "LOW"),
                TidePoint("07:10 PM", 2.6f, "HIGH"),
                TidePoint("01:20 AM", 0.7f, "LOW")
            ),

            // 4. Travel
            flightDisruptionAlert = "Goa Dabolim & MOPA airports operating smoothly with zero weather delays.",
            savedDestinations = listOf(
                SavedCityWeather("Mumbai", "India", 30, "Monsoon Showers", "🌧️", "On-Time", listOf("Umbrella", "Sandals")),
                SavedCityWeather("Delhi", "India", 19, "Smog", "🌫️", "Delayed", listOf("N95 Mask", "Warm jacket"))
            ),

            // 5. Family
            schoolCommuteStatus = "Clear Coastal Roads",
            schoolCommuteAlert = null,
            rainProbability = 15,
            playgroundOutdoorSafety = "Safe. Apply SPF 50 sunscreen between 11 AM - 3 PM.",

            // 6. Agriculture
            soilMoisturePercent = 62,
            soilTempC = 27,
            rainfall7DaySumMm = 15,
            frostWarning = null,
            cropAdvisoryNote = "Coconut and cashew groves thriving with tropical humidity.",

            // 7. Commute
            visibilityKm = 10.0f,
            fogSmogAlert = null,
            roadAquaplaningRisk = "Low",
            commuteDelayImpactScore = "Smooth Travel (Zero Delay)",

            // 8. Event Planner
            outdoorComfortIndex = "High (88/100) with Sunset Sea Breeze",
            rainChanceExtendedDays = 10,
            weddingEventSuitability = "Spectacular for Beachfront & Sunset Lawn Receptions",

            hourlyForecasts = listOf(
                HourlyForecast("6 AM", 26, "🌅", 10, 24, "Sunrise Breeze"),
                HourlyForecast("9 AM", 29, "☀️", 10, 28, "Sunny"),
                HourlyForecast("12 PM", 32, "☀️", 15, 32, "Strong UV"),
                HourlyForecast("3 PM", 31, "🌤️", 20, 30, "Sea Breeze"),
                HourlyForecast("6 PM", 28, "🌅", 10, 25, "Sunset Glow"),
                HourlyForecast("9 PM", 27, "🌙", 10, 26, "Pleasant Tide")
            )
        )
    }

    /**
     * SCENARIO 3: Bengaluru - Garden City & Outdoor Fitness / Events
     * Highlights: Fitness (24°C, Sunrise 6:05 AM, Ideal workout), Event Planners (Wedding comfort index 95/100), Gardeners.
     */
    fun getBengaluruFitnessEventScenario(): WeatherData {
        return WeatherData(
            city = "Bengaluru",
            state = "Karnataka",
            temperature = 23,
            feelsLike = 23,
            condition = "Pleasant & Partly Cloudy",
            icon = "🌤️",
            humidityPercent = 58,
            windSpeedKmph = 14,
            windDirection = "E",
            uvIndex = 5,
            hourOfDay = 7,
            severeEmergencyAlert = null,

            // 1. Health
            aqi = 45,
            aqiCategory = "Good",
            pm25 = 14,
            pm10 = 32,
            treePollenLevel = "Moderate (Gulmohar / Jacaranda)",
            grassPollenLevel = "Low",
            weedPollenLevel = "Low",
            asthmaRiskLevel = "Low (Comfortable Respiratory Index)",

            // 2. Fitness (Dominant)
            sunriseTime = "06:05 AM",
            sunsetTime = "06:35 PM",
            bestRunningWindow = "05:30 AM – 08:30 AM (Peak Cool Energy)",
            workoutSafetyIndex = "100% Ideal Running & Cycling Weather",
            optimalHydrationMlPerHour = 500,

            // 3. Beach
            seaCondition = "Inland Plateau",
            waveHeightMeters = 0.0f,
            waterTemperatureC = 0,
            ripCurrentRisk = "N/A",
            tides = emptyList(),

            // 4. Travel
            flightDisruptionAlert = "Kempegowda Int'l Airport (BLR) operating with perfect visibility.",
            savedDestinations = listOf(
                SavedCityWeather("Goa", "India", 29, "Coastal Sun", "🏄", "On-Time", listOf("Beachwear", "Sunscreen")),
                SavedCityWeather("Manali", "India", 6, "Chilly", "❄️", "Clear", listOf("Heavy Woolens", "Trekking Boots"))
            ),

            // 5. Family
            schoolCommuteStatus = "Pleasant & Smooth",
            schoolCommuteAlert = null,
            rainProbability = 10,
            playgroundOutdoorSafety = "All-day outdoor play safe and comfortable.",

            // 6. Agriculture & Gardeners
            soilMoisturePercent = 55,
            soilTempC = 22,
            rainfall7DaySumMm = 25,
            frostWarning = null,
            cropAdvisoryNote = "Prime season for pruning rose gardens, planting potted greens, and organic lawn seeding.",

            // 7. Commute
            visibilityKm = 9.5f,
            fogSmogAlert = null,
            roadAquaplaningRisk = "None",
            commuteDelayImpactScore = "Standard City Flow",

            // 8. Event Planner (Dominant)
            outdoorComfortIndex = "Exceptional (96/100)",
            rainChanceExtendedDays = 15,
            weddingEventSuitability = "Flawless for Open Lawn Weddings, Music Gigs & Gatherings",

            hourlyForecasts = listOf(
                HourlyForecast("6 AM", 19, "⛅", 5, 38, "Cool Breeze"),
                HourlyForecast("8 AM", 22, "🌤️", 10, 42, "Comfortable"),
                HourlyForecast("11 AM", 26, "☀️", 10, 48, "Warm"),
                HourlyForecast("2 PM", 28, "⛅", 15, 52, "Mild Cloud"),
                HourlyForecast("5 PM", 25, "🌤️", 10, 45, "Sunset"),
                HourlyForecast("8 PM", 21, "🌙", 5, 40, "Cozy Night")
            )
        )
    }

    /**
     * SCENARIO 4: Punjab Agri Belt - Agriculture & Sowing Radar
     * Highlights: Agriculture (Soil moisture 78%, 7-day rainfall 115mm, Frost alerts, Urea spray guidelines).
     */
    fun getPunjabAgriScenario(): WeatherData {
        return WeatherData(
            city = "Punjab Agri Belt",
            state = "Punjab",
            temperature = 22,
            feelsLike = 21,
            condition = "Overcast & Rain Ready",
            icon = "🌾",
            humidityPercent = 88,
            windSpeedKmph = 18,
            windDirection = "SE",
            uvIndex = 4,
            hourOfDay = 9,
            severeEmergencyAlert = "HEAVY RAIN & HAIL ALERT FOR AGRI ZONES: Postpone pesticide sprays for next 48 hours.",

            // 1. Health
            aqi = 85,
            aqiCategory = "Satisfactory",
            pm25 = 32,
            pm10 = 70,
            treePollenLevel = "Low",
            grassPollenLevel = "High (Wheat/Paddy blooming)",
            weedPollenLevel = "Moderate",
            asthmaRiskLevel = "Moderate",

            // 2. Fitness
            sunriseTime = "06:22 AM",
            sunsetTime = "06:12 PM",
            bestRunningWindow = "06:00 AM – 07:00 AM before expected showers",
            workoutSafetyIndex = "Pre-Rain Wet Roads",
            optimalHydrationMlPerHour = 450,

            // 3. Beach
            seaCondition = "Inland Agricultural Plains",
            waveHeightMeters = 0.0f,
            waterTemperatureC = 0,
            ripCurrentRisk = "N/A",
            tides = emptyList(),

            // 4. Travel
            flightDisruptionAlert = "Amritsar & Chandigarh airport operations may see holding patterns during cloud bursts.",
            savedDestinations = emptyList(),

            // 5. Family
            schoolCommuteStatus = "Rain Showers Expected",
            schoolCommuteAlert = "Carry sturdy rain gear and rain boots for children.",
            rainProbability = 80,
            playgroundOutdoorSafety = "Muddy grounds - Indoor activities advised.",

            // 6. Agriculture (Dominant)
            soilMoisturePercent = 78,
            soilTempC = 18,
            rainfall7DaySumMm = 115,
            frostWarning = "Potential Late Night Frost if skies clear after rain.",
            cropAdvisoryNote = "CRITICAL AGRI GUIDANCE: 115mm cumulative rain will satisfy root-zone moisture for Rabi crops. Halt electric borewells to conserve groundwater. Ensure drainage in low-lying mustard tracts.",

            // 7. Commute
            visibilityKm = 3.5f,
            fogSmogAlert = "Heavy Drizzle & Spray on Highways (NH-44)",
            roadAquaplaningRisk = "High on Fast Highways",
            commuteDelayImpactScore = "Moderate (+20 mins)",

            // 8. Event Planner
            outdoorComfortIndex = "Damp & Humid (55/100)",
            rainChanceExtendedDays = 85,
            weddingEventSuitability = "Waterproof Tents & Canopy Mandap Mandatory",

            hourlyForecasts = listOf(
                HourlyForecast("6 AM", 18, "☁️", 40, 80, "Cloudy"),
                HourlyForecast("9 AM", 21, "🌧️", 80, 75, "Downpour"),
                HourlyForecast("12 PM", 22, "⛈️", 85, 65, "Thunderstorm"),
                HourlyForecast("3 PM", 23, "🌧️", 70, 70, "Passing Rain"),
                HourlyForecast("6 PM", 20, "☁️", 50, 75, "Damp Breeze"),
                HourlyForecast("9 PM", 18, "🌙", 30, 80, "Cool Mist")
            )
        )
    }

    /**
     * SCENARIO 5: Mumbai Coastal Monsoon - Severe Alert & Commuters
     * Highlights: Commuters (Aquaplaning, High Tide alert, School disruption), Travel (Flight delay).
     */
    fun getMumbaiMonsoonScenario(): WeatherData {
        return WeatherData(
            city = "Mumbai",
            state = "Maharashtra",
            temperature = 27,
            feelsLike = 32,
            condition = "Heavy Monsoon Torrent",
            icon = "⛈️",
            humidityPercent = 95,
            windSpeedKmph = 38,
            windDirection = "SW",
            uvIndex = 2,
            hourOfDay = 8,
            severeEmergencyAlert = "RED ALERT MONSOON: High tide (4.6m at 11:40 AM) coinciding with heavy rainfall. Avoid coastal promenades and waterlogged subways.",

            // 1. Health
            aqi = 22,
            aqiCategory = "Pure Rain-Washed",
            pm25 = 6,
            pm10 = 12,
            treePollenLevel = "Low",
            grassPollenLevel = "Low",
            weedPollenLevel = "Low",
            asthmaRiskLevel = "Low",

            // 2. Fitness
            sunriseTime = "06:12 AM",
            sunsetTime = "07:05 PM",
            bestRunningWindow = "Indoor Home Workouts Only",
            workoutSafetyIndex = "High Hazard (Slippery & Flooded)",
            optimalHydrationMlPerHour = 500,

            // 3. Beach & Marine
            seaCondition = "EXTREMELY ROUGH - High Tide 4.6m",
            waveHeightMeters = 3.8f,
            waterTemperatureC = 27,
            ripCurrentRisk = "SEVERE DANGER - Beaches Closed by Police",
            tides = listOf(
                TidePoint("11:40 AM", 4.6f, "HIGH"),
                TidePoint("05:50 PM", 0.9f, "LOW"),
                TidePoint("11:55 PM", 4.2f, "HIGH")
            ),

            // 4. Travel
            flightDisruptionAlert = "CSMIA (BOM) reporting 45-60 min air traffic delays due to poor visibility & crosswinds.",
            savedDestinations = listOf(
                SavedCityWeather("Delhi", "India", 18, "Fog", "🌫️", "Delayed", listOf("Jacket", "N95 Mask")),
                SavedCityWeather("Bengaluru", "India", 24, "Pleasant", "🌤️", "On-Time", listOf("Light sweater"))
            ),

            // 5. Family
            schoolCommuteStatus = "Severe Waterlogging Risk",
            schoolCommuteAlert = "IMD issues orange advisory: Schools advised to switch to online classes or adjust morning dispersal.",
            rainProbability = 95,
            playgroundOutdoorSafety = "Completely Inaccessible due to water accumulation.",

            // 6. Agriculture
            soilMoisturePercent = 100,
            soilTempC = 24,
            rainfall7DaySumMm = 280,
            frostWarning = null,
            cropAdvisoryNote = "Drain excess water from coastal paddy fields to avoid root rot.",

            // 7. Commute (Dominant)
            visibilityKm = 1.1f,
            fogSmogAlert = "Heavy Rain Curtain: Waterlogging at King's Circle, Milan Subway, Hindmata.",
            roadAquaplaningRisk = "EXTREME: High tire aquaplaning risk on Eastern & Western Express Highways.",
            commuteDelayImpactScore = "Critical (+55 mins)",

            // 8. Event Planner
            outdoorComfortIndex = "Drenched (15/100)",
            rainChanceExtendedDays = 95,
            weddingEventSuitability = "Outdoor Events Not Feasible",

            hourlyForecasts = listOf(
                HourlyForecast("6 AM", 26, "🌧️", 90, 20, "Downpour"),
                HourlyForecast("9 AM", 27, "⛈️", 95, 18, "Torrential"),
                HourlyForecast("12 PM", 27, "⛈️", 95, 22, "High Tide Peak"),
                HourlyForecast("3 PM", 28, "🌧️", 85, 25, "Heavy Rain"),
                HourlyForecast("6 PM", 26, "🌧️", 80, 20, "Continuous"),
                HourlyForecast("9 PM", 26, "🌧️", 75, 19, "Night Rain")
            )
        )
    }

    /**
     * SCENARIO 6: London - International Travel & Packing Assistant
     */
    fun getLondonTravelScenario(): WeatherData {
        return WeatherData(
            city = "London",
            state = "Greater London",
            temperature = 13,
            feelsLike = 10,
            condition = "Overcast & Cold Drizzle",
            icon = "🧥",
            humidityPercent = 84,
            windSpeedKmph = 26,
            windDirection = "W",
            uvIndex = 2,
            hourOfDay = 11,
            severeEmergencyAlert = null,

            aqi = 34,
            aqiCategory = "Good",
            pm25 = 10,
            pm10 = 18,
            treePollenLevel = "Low",
            grassPollenLevel = "Low",
            weedPollenLevel = "Low",
            asthmaRiskLevel = "Low",

            sunriseTime = "07:15 AM",
            sunsetTime = "04:50 PM",
            bestRunningWindow = "12:00 PM – 02:00 PM (Midday warmth)",
            workoutSafetyIndex = "Wind Chill Caution",
            optimalHydrationMlPerHour = 400,

            seaCondition = "Thames Estuary Chilly",
            waveHeightMeters = 0.8f,
            waterTemperatureC = 11,
            ripCurrentRisk = "Low",
            tides = emptyList(),

            flightDisruptionAlert = "Heathrow (LHR) & Gatwick operating with standard European holding slots.",
            savedDestinations = listOf(
                SavedCityWeather("Paris", "France", 15, "Cloudy", "⛅", "On-Time", listOf("Light trench coat", "Scarf")),
                SavedCityWeather("Delhi", "India", 18, "Dense Smog", "🌫️", "Delayed", listOf("N95 Mask", "Warm clothing"))
            ),

            schoolCommuteStatus = "Chilly & Damp",
            schoolCommuteAlert = "Warm waterproof coats required for children.",
            rainProbability = 65,
            playgroundOutdoorSafety = "Damp play equipment.",

            soilMoisturePercent = 70,
            soilTempC = 11,
            rainfall7DaySumMm = 45,
            frostWarning = "Night frost expected if temperature drops below 3°C.",
            cropAdvisoryNote = "Cover sensitive English cottage garden perennials against overnight frost.",

            visibilityKm = 6.0f,
            fogSmogAlert = "Midday Maritime Mist",
            roadAquaplaningRisk = "Moderate Wet Surfaces",
            commuteDelayImpactScore = "Slight (+10 mins)",

            outdoorComfortIndex = "Brisk & Chilly (62/100)",
            rainChanceExtendedDays = 60,
            weddingEventSuitability = "Heated Marquee & Indoor Historic Venue Recommended",

            hourlyForecasts = listOf(
                HourlyForecast("8 AM", 10, "🌧️", 60, 30, "Chilly Drizzle"),
                HourlyForecast("11 AM", 13, "☁️", 65, 34, "Overcast"),
                HourlyForecast("2 PM", 14, "⛅", 40, 36, "Brief Break"),
                HourlyForecast("5 PM", 12, "🌧️", 70, 32, "Evening Rain"),
                HourlyForecast("8 PM", 9, "🌙", 30, 28, "Cold Night")
            )
        )
    }

    /**
     * SCENARIO 7: Shimla - Mountain Frost & Winter Adventure
     */
    fun getShimlaFrostScenario(): WeatherData {
        return WeatherData(
            city = "Shimla",
            state = "Himachal Pradesh",
            temperature = 5,
            feelsLike = 1,
            condition = "Crisp Mountain Freeze",
            icon = "❄️",
            humidityPercent = 60,
            windSpeedKmph = 16,
            windDirection = "NNE",
            uvIndex = 6,
            hourOfDay = 8,
            severeEmergencyAlert = "FROST & BLACK ICE WARNING: High-altitude roads on Kufri-Theog route have black ice. Drive with extreme caution.",

            aqi = 18,
            aqiCategory = "Pristine Mountain Air",
            pm25 = 4,
            pm10 = 8,
            treePollenLevel = "Low (Pine cones dormant)",
            grassPollenLevel = "Low",
            weedPollenLevel = "Low",
            asthmaRiskLevel = "Cold Air Bronchospasm Caution",

            sunriseTime = "06:35 AM",
            sunsetTime = "05:40 PM",
            bestRunningWindow = "11:00 AM – 02:00 PM (Under Direct Mountain Sun)",
            workoutSafetyIndex = "Cold Air Warning - Cover Face",
            optimalHydrationMlPerHour = 450,

            seaCondition = "Himalayan Ridge",
            waveHeightMeters = 0.0f,
            waterTemperatureC = 0,
            ripCurrentRisk = "N/A",
            tides = emptyList(),

            flightDisruptionAlert = "Shimla Jubbarhatti airport flights subject to mountain valley crosswinds.",
            savedDestinations = listOf(
                SavedCityWeather("Chandigarh", "India", 17, "Clear", "☀️", "On-Time", listOf("Cardigan")),
                SavedCityWeather("Delhi", "India", 18, "Smog", "🌫️", "Delayed", listOf("Jacket", "Mask"))
            ),

            schoolCommuteStatus = "Cold Morning Commute",
            schoolCommuteAlert = "Heavy winter uniforms, gloves, and caps recommended.",
            rainProbability = 10,
            playgroundOutdoorSafety = "Cold temperatures - ensure warm layers.",

            soilMoisturePercent = 65,
            soilTempC = 4,
            rainfall7DaySumMm = 10,
            frostWarning = "Severe Ground Frost: Apple orchards require orchard heaters / smoke smudge to protect budding spurts.",
            cropAdvisoryNote = "Apple orchard winter pruning and organic mulching at peak stage.",

            visibilityKm = 12.0f,
            fogSmogAlert = "Valley mist in deep gorges, clear ridge line.",
            roadAquaplaningRisk = "BLACK ICE on shaded hairpin turns",
            commuteDelayImpactScore = "Moderate (+25 mins on ghats)",

            outdoorComfortIndex = "Crisp Mountain Chill (70/100)",
            rainChanceExtendedDays = 15,
            weddingEventSuitability = "Breathtaking for Mountain Winter Weddings with Bonfire setups",

            hourlyForecasts = listOf(
                HourlyForecast("6 AM", 2, "❄️", 5, 15, "Freezing"),
                HourlyForecast("9 AM", 5, "☀️", 5, 18, "Crisp Sun"),
                HourlyForecast("12 PM", 9, "☀️", 5, 20, "Sunny Peak"),
                HourlyForecast("3 PM", 8, "🌤️", 10, 19, "Pleasant Sun"),
                HourlyForecast("6 PM", 4, "🌙", 5, 16, "Sharp Drop"),
                HourlyForecast("9 PM", 1, "❄️", 5, 14, "Frosty Night")
            )
        )
    }
}
