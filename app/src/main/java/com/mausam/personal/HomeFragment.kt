package com.mausam.personal

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import com.google.android.material.button.MaterialButton
import com.mausam.personal.databinding.FragmentHomeBinding

class HomeFragment : Fragment() {

    private var _binding: FragmentHomeBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentHomeBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onResume() {
        super.onResume()
        refreshDashboard()
    }

    fun refreshDashboard() {
        val ctx = context ?: return

        // 1. Retrieve user preferences and selected city
        val prefs = ctx.getSharedPreferences("mausam_personal_prefs", Context.MODE_PRIVATE)
        val selectedCity = prefs.getString("selected_city", "Delhi NCR") ?: "Delhi NCR"

        val activePersonaStrings = prefs.getStringSet(
            "active_personas",
            setOf(
                PersonaType.HEALTH.idName,
                PersonaType.FITNESS.idName,
                PersonaType.COMMUTE.idName,
                PersonaType.FAMILY.idName
            )
        ) ?: setOf(
            PersonaType.HEALTH.idName,
            PersonaType.FITNESS.idName,
            PersonaType.COMMUTE.idName,
            PersonaType.FAMILY.idName
        )

        val activePersonas = activePersonaStrings.mapNotNull { PersonaType.fromId(it) }.toMutableSet()
        val userPreferences = UserPreferences(
            activePersonas = activePersonas,
            selectedCity = selectedCity
        )

        // 2. Fetch current weather data from repository
        val weatherData = MockData.getWeatherDataForCity(selectedCity)

        // 3. Render Persona Chips
        renderPersonaChips(activePersonas)

        // 4. Render Hero Weather Card
        renderHeroCard(weatherData)

        // 5. Render Emergency Alert Banner if active
        renderEmergencyAlert(weatherData)

        // 6. Render Hourly Forecast Timeline
        renderHourlyForecast(weatherData)

        // 7. Run AI Personalization Engine and Render Insight Cards
        val insightCards = MausamEngine.generatePersonalizedCards(weatherData, userPreferences)
        renderInsightCards(insightCards)
    }

    private fun renderPersonaChips(activePersonas: Set<PersonaType>) {
        val container = binding.layoutPersonaChips
        container.removeAllViews()
        val ctx = context ?: return

        PersonaType.entries.forEach { persona ->
            val isActive = activePersonas.contains(persona)

            val chip = MaterialButton(ctx, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
                text = "${persona.emoji} ${persona.displayName}"
                textSize = 12f
                cornerRadius = 32
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    marginEnd = 16
                }
                setPadding(24, 0, 24, 0)
                isAllCaps = false

                if (isActive) {
                    setBackgroundColor(Color.parseColor("#1E3E62"))
                    setTextColor(Color.WHITE)
                    strokeColor = ColorStateList.valueOf(Color.parseColor("#1E3E62"))
                } else {
                    setBackgroundColor(Color.parseColor("#F1F5F9"))
                    setTextColor(Color.parseColor("#475569"))
                    strokeColor = ColorStateList.valueOf(Color.parseColor("#E2E8F0"))
                }

                setOnClickListener {
                    togglePersona(persona)
                }
            }
            container.addView(chip)
        }

        binding.tvActivePersonaCount.text = "${activePersonas.size} Active Domains"
    }

    private fun togglePersona(persona: PersonaType) {
        val ctx = context ?: return
        val prefs = ctx.getSharedPreferences("mausam_personal_prefs", Context.MODE_PRIVATE)
        val activeSet = prefs.getStringSet(
            "active_personas",
            setOf(
                PersonaType.HEALTH.idName,
                PersonaType.FITNESS.idName,
                PersonaType.COMMUTE.idName,
                PersonaType.FAMILY.idName
            )
        )?.toMutableSet() ?: mutableSetOf()

        if (activeSet.contains(persona.idName)) {
            if (activeSet.size > 1) {
                activeSet.remove(persona.idName)
            } else {
                Toast.makeText(ctx, "At least 1 persona must remain active", Toast.LENGTH_SHORT).show()
                return
            }
        } else {
            activeSet.add(persona.idName)
        }

        prefs.edit().putStringSet("active_personas", activeSet).apply()
        refreshDashboard()
    }

    private fun renderHeroCard(weather: WeatherData) {
        binding.tvHeroCity.text = "${weather.city}, ${weather.state}"
        binding.tvHeroIcon.text = weather.icon
        binding.tvHeroTemp.text = "${weather.temperature}°"
        binding.tvHeroCondition.text = weather.condition
        binding.tvHeroFeelsLike.text = "Feels like ${weather.feelsLike}°C • UV ${weather.uvIndex}"

        binding.tvHeroHumidity.text = "💧 ${weather.humidityPercent}% Humidity"
        binding.tvHeroWind.text = "💨 ${weather.windSpeedKmph} km/h ${weather.windDirection}"
        binding.tvHeroAqi.text = "🫁 AQI ${weather.aqi} (${weather.aqiCategory})"
    }

    private fun renderEmergencyAlert(weather: WeatherData) {
        if (!weather.severeEmergencyAlert.isNullOrBlank()) {
            binding.cardEmergencyAlert.visibility = View.VISIBLE
            binding.tvEmergencyAlertText.text = weather.severeEmergencyAlert
        } else {
            binding.cardEmergencyAlert.visibility = View.GONE
        }
    }

    private fun renderHourlyForecast(weather: WeatherData) {
        val container = binding.layoutHourlyContainer
        container.removeAllViews()
        val ctx = context ?: return

        weather.hourlyForecasts.forEach { hour ->
            val tile = LinearLayout(ctx).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                setPadding(24, 14, 24, 14)
                background = ContextCompat.getDrawable(ctx, R.drawable.bg_metric_tile)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    marginEnd = 16
                }
            }

            val timeTv = TextView(ctx).apply {
                text = hour.hourTime
                textSize = 11f
                setTextColor(Color.parseColor("#64748B"))
            }

            val iconTv = TextView(ctx).apply {
                text = hour.icon
                textSize = 22f
                setPadding(0, 4, 0, 4)
            }

            val tempTv = TextView(ctx).apply {
                text = "${hour.tempC}°"
                textSize = 14f
                setTypeface(null, Typeface.BOLD)
                setTextColor(Color.parseColor("#0F172A"))
            }

            val rainAqiTv = TextView(ctx).apply {
                text = "💧${hour.rainProbability}%"
                textSize = 10f
                setTextColor(Color.parseColor("#0284C7"))
            }

            tile.addView(timeTv)
            tile.addView(iconTv)
            tile.addView(tempTv)
            tile.addView(rainAqiTv)
            container.addView(tile)
        }
    }

    private fun renderInsightCards(cards: List<InsightCard>) {
        val container = binding.layoutCardsContainer
        container.removeAllViews()
        val ctx = context ?: return

        cards.forEach { card ->
            val cardView = LayoutInflater.from(ctx).inflate(R.layout.item_insight_card, container, false)

            val iconTv: TextView = cardView.findViewById(R.id.tv_domain_icon)
            val titleTv: TextView = cardView.findViewById(R.id.tv_card_title)
            val subtitleTv: TextView = cardView.findViewById(R.id.tv_card_subtitle)
            val priorityBadge: TextView = cardView.findViewById(R.id.tv_priority_badge)
            val metricsGrid: LinearLayout = cardView.findViewById(R.id.layout_metrics_grid)
            val advisoriesLayout: LinearLayout = cardView.findViewById(R.id.layout_advisories)
            val whyToggleLayout: LinearLayout = cardView.findViewById(R.id.layout_why_toggle)
            val whyContentLayout: LinearLayout = cardView.findViewById(R.id.layout_why_content)
            val scorePill: TextView = cardView.findViewById(R.id.tv_score_pill)
            val scoreFactorsLayout: LinearLayout = cardView.findViewById(R.id.layout_score_factors)
            val triggerReasonsLayout: LinearLayout = cardView.findViewById(R.id.layout_trigger_reasons)
            val btnAction: MaterialButton = cardView.findViewById(R.id.btn_card_action)

            iconTv.text = card.icon
            titleTv.text = card.title
            subtitleTv.text = card.subtitle
            priorityBadge.text = card.priority.label

            // Priority badge color
            when (card.priority) {
                CardPriority.CRITICAL -> {
                    priorityBadge.setTextColor(Color.parseColor("#991B1B"))
                    priorityBadge.setBackgroundResource(R.drawable.bg_badge_critical)
                }
                CardPriority.HIGH -> {
                    priorityBadge.setTextColor(Color.parseColor("#D97706"))
                    priorityBadge.setBackgroundResource(R.drawable.bg_badge_high)
                }
                CardPriority.MEDIUM -> {
                    priorityBadge.setTextColor(Color.parseColor("#1E3E62"))
                    priorityBadge.setBackgroundResource(R.drawable.bg_badge_good)
                }
                CardPriority.NORMAL -> {
                    priorityBadge.setTextColor(Color.parseColor("#16A34A"))
                    priorityBadge.setBackgroundResource(R.drawable.bg_badge_good)
                }
            }

            // Populate Secondary Metrics Grid
            metricsGrid.removeAllViews()
            card.metricList.forEach { metric ->
                val tile = LinearLayout(ctx).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.CENTER
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                        marginEnd = 8
                    }
                    setPadding(8, 10, 8, 10)
                    background = ContextCompat.getDrawable(ctx, R.drawable.bg_metric_tile)
                }

                val labelTv = TextView(ctx).apply {
                    text = metric.label
                    textSize = 10f
                    setTextColor(Color.parseColor("#64748B"))
                    maxLines = 1
                }

                val valTv = TextView(ctx).apply {
                    text = "${metric.value} ${metric.unit}".trim()
                    textSize = 12f
                    setTypeface(null, Typeface.BOLD)
                    setTextColor(Color.parseColor(metric.statusColorHex))
                    maxLines = 1
                }

                tile.addView(labelTv)
                tile.addView(valTv)
                metricsGrid.addView(tile)
            }

            // Populate Advisories
            advisoriesLayout.removeAllViews()
            card.advisories.forEach { advisory ->
                val advRow = LinearLayout(ctx).apply {
                    orientation = LinearLayout.HORIZONTAL
                    setPadding(0, 3, 0, 3)
                }
                val checkmark = TextView(ctx).apply {
                    text = "• "
                    textSize = 14f
                    setTextColor(Color.parseColor("#1E3E62"))
                    setTypeface(null, Typeface.BOLD)
                }
                val advText = TextView(ctx).apply {
                    text = advisory
                    textSize = 12f
                    setTextColor(Color.parseColor("#334155"))
                    setLineSpacing(2f, 1.15f)
                }
                advRow.addView(checkmark)
                advRow.addView(advText)
                advisoriesLayout.addView(advRow)
            }

            // Explainable AI Setup
            scorePill.text = "${card.explainability.totalScorePercent}% Match ▾"

            scoreFactorsLayout.removeAllViews()
            val factorData = listOf(
                Pair("Persona Relevance (40%)", card.explainability.personaScore),
                Pair("Weather Severity (30%)", card.explainability.severityScore),
                Pair("Time Urgency (20%)", card.explainability.urgencyScore),
                Pair("Context / Location (10%)", card.explainability.contextScore)
            )

            factorData.forEach { (factorName, scoreVal) ->
                val factorRow = LinearLayout(ctx).apply {
                    orientation = LinearLayout.HORIZONTAL
                    setPadding(0, 4, 0, 4)
                }
                val nameTv = TextView(ctx).apply {
                    text = factorName
                    textSize = 11f
                    setTextColor(Color.parseColor("#475569"))
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                }
                val scoreTv = TextView(ctx).apply {
                    text = "${(scoreVal * 100).toInt()}%"
                    textSize = 11f
                    setTypeface(null, Typeface.BOLD)
                    setTextColor(Color.parseColor("#1E3E62"))
                }
                factorRow.addView(nameTv)
                factorRow.addView(scoreTv)
                scoreFactorsLayout.addView(factorRow)
            }

            triggerReasonsLayout.removeAllViews()
            card.explainability.reasons.forEach { reason ->
                val reasonTv = TextView(ctx).apply {
                    text = "✓ $reason"
                    textSize = 11f
                    setTextColor(Color.parseColor("#059669"))
                    setPadding(0, 2, 0, 2)
                }
                triggerReasonsLayout.addView(reasonTv)
            }

            // Toggle Expand / Collapse
            whyToggleLayout.setOnClickListener {
                if (whyContentLayout.visibility == View.VISIBLE) {
                    whyContentLayout.visibility = View.GONE
                    scorePill.text = "${card.explainability.totalScorePercent}% Match ▾"
                } else {
                    whyContentLayout.visibility = View.VISIBLE
                    scorePill.text = "${card.explainability.totalScorePercent}% Match ▴"
                }
            }

            // Action CTA Button Setup
            if (!card.actionCta.isNullOrBlank()) {
                btnAction.visibility = View.VISIBLE
                btnAction.text = "⚡ ${card.actionCta}"
                btnAction.setOnClickListener {
                    AlertDialog.Builder(ctx)
                        .setTitle("${card.icon} ${card.title}")
                        .setMessage("${card.actionCta}:\n\n${card.advisories.joinToString("\n• ", prefix = "• ")}")
                        .setPositiveButton("Got It", null)
                        .show()
                }
            } else {
                btnAction.visibility = View.GONE
            }

            container.addView(cardView)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

