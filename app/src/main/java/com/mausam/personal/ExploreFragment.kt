package com.mausam.personal

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import com.google.android.material.card.MaterialCardView
import com.mausam.personal.databinding.FragmentExploreBinding

class ExploreFragment : Fragment() {

    private var _binding: FragmentExploreBinding? = null
    private val binding get() = _binding!!

    private var activeTab = "aqi" // "aqi", "marine", "agri", "travel"

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentExploreBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupTabButtons()
        renderTabContent()
    }

    override fun onResume() {
        super.onResume()
        renderTabContent()
    }

    private fun setupTabButtons() {
        binding.tabAqi.setOnClickListener {
            activeTab = "aqi"
            updateTabStyles()
            renderTabContent()
        }
        binding.tabMarine.setOnClickListener {
            activeTab = "marine"
            updateTabStyles()
            renderTabContent()
        }
        binding.tabAgri.setOnClickListener {
            activeTab = "agri"
            updateTabStyles()
            renderTabContent()
        }
        binding.tabTravel.setOnClickListener {
            activeTab = "travel"
            updateTabStyles()
            renderTabContent()
        }
    }

    private fun updateTabStyles() {
        val tabs = listOf(
            Pair(binding.tabAqi, "aqi"),
            Pair(binding.tabMarine, "marine"),
            Pair(binding.tabAgri, "agri"),
            Pair(binding.tabTravel, "travel")
        )

        tabs.forEach { (button, tabKey) ->
            if (activeTab == tabKey) {
                button.setBackgroundColor(Color.parseColor("#1E3E62"))
                button.setTextColor(Color.WHITE)
                button.strokeColor = ColorStateList.valueOf(Color.parseColor("#1E3E62"))
            } else {
                button.setBackgroundColor(Color.TRANSPARENT)
                button.setTextColor(Color.parseColor("#475569"))
                button.strokeColor = ColorStateList.valueOf(Color.parseColor("#E2E8F0"))
            }
        }
    }

    private fun renderTabContent() {
        val container = binding.layoutExploreContent
        container.removeAllViews()
        val ctx = context ?: return

        val prefs = ctx.getSharedPreferences("mausam_personal_prefs", Context.MODE_PRIVATE)
        val selectedCity = prefs.getString("selected_city", "Delhi NCR") ?: "Delhi NCR"
        val weather = MockData.getWeatherDataForCity(selectedCity)

        when (activeTab) {
            "aqi" -> renderAqiSection(container, weather)
            "marine" -> renderMarineSection(container, weather)
            "agri" -> renderAgriSection(container, weather)
            "travel" -> renderTravelSection(container, weather)
        }
    }

    private fun renderAqiSection(container: LinearLayout, weather: WeatherData) {
        val ctx = context ?: return
        val density = resources.displayMetrics.density
        val card = MaterialCardView(ctx).apply {
            radius = 20 * density
            cardElevation = 2 * density
            setCardBackgroundColor(Color.WHITE)
            strokeWidth = (1 * density).toInt()
            strokeColor = Color.parseColor("#E2E8F0")
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        val content = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (16 * density).toInt()
            setPadding(pad, pad, pad, pad)
        }

        val title = TextView(ctx).apply {
            text = "🫁 Comprehensive Air & Pollen Radar (${weather.city})"
            textSize = 16f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#0F172A"))
        }

        val aqiHeader = TextView(ctx).apply {
            text = "Overall Air Quality Index: ${weather.aqi} (${weather.aqiCategory})"
            textSize = 14f
            setTypeface(null, Typeface.BOLD)
            setTextColor(if (weather.aqi > 200) Color.parseColor("#DC2626") else Color.parseColor("#16A34A"))
            val padTop = (6 * density).toInt()
            val padBottom = (8 * density).toInt()
            setPadding(0, padTop, 0, padBottom)
        }

        val grid = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            weightSum = 3f
        }

        val pm25Tile = createMetricTile("PM 2.5", "${weather.pm25} µg/m³", if (weather.pm25 > 100) "#DC2626" else "#0284C7")
        val pm10Tile = createMetricTile("PM 10", "${weather.pm10} µg/m³", if (weather.pm10 > 150) "#D97706" else "#0284C7")
        val uvTile = createMetricTile("UV Index", "${weather.uvIndex} / 11", "#EA580C")

        grid.addView(pm25Tile)
        grid.addView(pm10Tile)
        grid.addView(uvTile)

        val pollenTitle = TextView(ctx).apply {
            text = "Pollen Breakdown:"
            textSize = 14f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#334155"))
            val padTop = (12 * density).toInt()
            val padBottom = (4 * density).toInt()
            setPadding(0, padTop, 0, padBottom)
        }

        val pollenDetails = TextView(ctx).apply {
            text = "• Tree Pollen: ${weather.treePollenLevel}\n• Grass Pollen: ${weather.grassPollenLevel}\n• Weed Pollen: ${weather.weedPollenLevel}\n• Asthma Risk: ${weather.asthmaRiskLevel}"
            textSize = 13f
            setTextColor(Color.parseColor("#475569"))
            setLineSpacing(4f, 1.2f)
        }

        content.addView(title)
        content.addView(aqiHeader)
        content.addView(grid)
        content.addView(pollenTitle)
        content.addView(pollenDetails)
        card.addView(content)
        container.addView(card)
    }

    private fun renderMarineSection(container: LinearLayout, weather: WeatherData) {
        val ctx = context ?: return
        val density = resources.displayMetrics.density
        val card = MaterialCardView(ctx).apply {
            radius = 20 * density
            cardElevation = 2 * density
            setCardBackgroundColor(Color.WHITE)
            strokeWidth = (1 * density).toInt()
            strokeColor = Color.parseColor("#E2E8F0")
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        val content = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (16 * density).toInt()
            setPadding(pad, pad, pad, pad)
        }

        val title = TextView(ctx).apply {
            text = "🏄 Coastal Swell & Tide Timetable"
            textSize = 16f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#0F172A"))
        }

        val seaState = TextView(ctx).apply {
            text = "Sea Condition: ${weather.seaCondition} • Wave Height: ${weather.waveHeightMeters}m"
            textSize = 14f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#0284C7"))
            val padTop = (6 * density).toInt()
            val padBottom = (8 * density).toInt()
            setPadding(0, padTop, 0, padBottom)
        }

        val grid = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            weightSum = 3f
        }

        val waveTile = createMetricTile("Wave Height", "${weather.waveHeightMeters} m", "#0284C7")
        val waterTile = createMetricTile("Water Temp", "${weather.waterTemperatureC}°C", "#0D9488")
        val ripTile = createMetricTile("Rip Current", weather.ripCurrentRisk.substringBefore(" "), if (weather.ripCurrentRisk.contains("DANGER", true)) "#DC2626" else "#16A34A")

        grid.addView(waveTile)
        grid.addView(waterTile)
        grid.addView(ripTile)

        val tidesTitle = TextView(ctx).apply {
            text = "24-Hour Tide Timings:"
            textSize = 14f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#334155"))
            val padTop = (12 * density).toInt()
            val padBottom = (4 * density).toInt()
            setPadding(0, padTop, 0, padBottom)
        }

        val tidesList = TextView(ctx).apply {
            text = if (weather.tides.isNotEmpty()) {
                weather.tides.joinToString("\n") { "• ${it.time}  -  ${it.type} TIDE  (${it.heightMeters} meters)" }
            } else {
                "• No direct tidal stations at inland location. Showing general coastal reference."
            }
            textSize = 13f
            setTextColor(Color.parseColor("#475569"))
            setLineSpacing(4f, 1.2f)
        }

        content.addView(title)
        content.addView(seaState)
        content.addView(grid)
        content.addView(tidesTitle)
        content.addView(tidesList)
        card.addView(content)
        container.addView(card)
    }

    private fun renderAgriSection(container: LinearLayout, weather: WeatherData) {
        val ctx = context ?: return
        val density = resources.displayMetrics.density
        val card = MaterialCardView(ctx).apply {
            radius = 20 * density
            cardElevation = 2 * density
            setCardBackgroundColor(Color.WHITE)
            strokeWidth = (1 * density).toInt()
            strokeColor = Color.parseColor("#E2E8F0")
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        val content = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (16 * density).toInt()
            setPadding(pad, pad, pad, pad)
        }

        val title = TextView(ctx).apply {
            text = "🌾 Soil Moisture & Agro-Meteorology"
            textSize = 16f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#0F172A"))
        }

        val grid = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            weightSum = 3f
            val padV = (8 * density).toInt()
            setPadding(0, padV, 0, padV)
        }

        val soilMoist = createMetricTile("Soil Moisture", "${weather.soilMoisturePercent}%", "#16A34A")
        val soilTemp = createMetricTile("Soil Temp", "${weather.soilTempC}°C", "#D97706")
        val rain7 = createMetricTile("7-Day Rain", "${weather.rainfall7DaySumMm} mm", "#0284C7")

        grid.addView(soilMoist)
        grid.addView(soilTemp)
        grid.addView(rain7)

        val advisoryTitle = TextView(ctx).apply {
            text = "IMD Seasonal Crop Advisory:"
            textSize = 14f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#334155"))
            val padTop = (4 * density).toInt()
            val padBottom = (3 * density).toInt()
            setPadding(0, padTop, 0, padBottom)
        }

        val advisoryText = TextView(ctx).apply {
            text = weather.cropAdvisoryNote
            textSize = 13f
            setTextColor(Color.parseColor("#475569"))
            setLineSpacing(4f, 1.2f)
        }

        content.addView(title)
        content.addView(grid)
        content.addView(advisoryTitle)
        content.addView(advisoryText)
        card.addView(content)
        container.addView(card)
    }

    private fun renderTravelSection(container: LinearLayout, weather: WeatherData) {
        val ctx = context ?: return
        val density = resources.displayMetrics.density
        val card = MaterialCardView(ctx).apply {
            radius = 20 * density
            cardElevation = 2 * density
            setCardBackgroundColor(Color.WHITE)
            strokeWidth = (1 * density).toInt()
            strokeColor = Color.parseColor("#E2E8F0")
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        val content = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (16 * density).toInt()
            setPadding(pad, pad, pad, pad)
        }

        val title = TextView(ctx).apply {
            text = "✈️ Global Transit & Smart Packing Assistant"
            textSize = 16f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#0F172A"))
        }

        val flightStatus = TextView(ctx).apply {
            text = "Airport Flight Radar: ${weather.flightDisruptionAlert ?: "All regional air corridors operating normally."}"
            textSize = 13f
            setTypeface(null, Typeface.BOLD)
            setTextColor(if (weather.flightDisruptionAlert != null) Color.parseColor("#D97706") else Color.parseColor("#16A34A"))
            val padTop = (5 * density).toInt()
            val padBottom = (8 * density).toInt()
            setPadding(0, padTop, 0, padBottom)
        }

        content.addView(title)
        content.addView(flightStatus)

        weather.savedDestinations.forEach { dest ->
            val destBox = LinearLayout(ctx).apply {
                orientation = LinearLayout.VERTICAL
                val padH = (12 * density).toInt()
                val padV = (10 * density).toInt()
                setPadding(padH, padV, padH, padV)
                background = ContextCompat.getDrawable(ctx, R.drawable.bg_metric_tile)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = (8 * density).toInt()
                }
            }

            val destHeader = TextView(ctx).apply {
                text = "${dest.icon} ${dest.cityName}, ${dest.country} — ${dest.temperature}°C (${dest.condition})"
                textSize = 14f
                setTypeface(null, Typeface.BOLD)
                setTextColor(Color.parseColor("#0F172A"))
            }

            val packingList = TextView(ctx).apply {
                text = "🧳 Smart Packing Advice: ${dest.packingSuggestions.joinToString(", ")}"
                textSize = 12f
                setTextColor(Color.parseColor("#475569"))
                val padTop = (3 * density).toInt()
                setPadding(0, padTop, 0, 0)
            }

            destBox.addView(destHeader)
            destBox.addView(packingList)
            content.addView(destBox)
        }

        card.addView(content)
        container.addView(card)
    }

    private fun createMetricTile(label: String, value: String, colorHex: String): LinearLayout {
        val ctx = context ?: return LinearLayout(requireContext())
        val density = resources.displayMetrics.density
        return LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginEnd = (4 * density).toInt()
            }
            val padH = (6 * density).toInt()
            val padV = (8 * density).toInt()
            setPadding(padH, padV, padH, padV)
            background = ContextCompat.getDrawable(ctx, R.drawable.bg_metric_tile)

            val lTv = TextView(ctx).apply {
                text = label
                textSize = 11f
                setTextColor(Color.parseColor("#64748B"))
            }
            val vTv = TextView(ctx).apply {
                text = value
                textSize = 13f
                setTypeface(null, Typeface.BOLD)
                setTextColor(Color.parseColor(colorHex))
            }
            addView(lTv)
            addView(vTv)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
