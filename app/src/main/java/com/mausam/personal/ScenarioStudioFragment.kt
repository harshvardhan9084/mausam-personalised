package com.mausam.personal

import android.content.Context
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import com.mausam.personal.databinding.FragmentScenarioStudioBinding

class ScenarioStudioFragment : Fragment() {

    private var _binding: FragmentScenarioStudioBinding? = null
    private val binding get() = _binding!!

    private var selectedCity = "Delhi NCR"

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentScenarioStudioBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val ctx = requireContext()
        val prefs = ctx.getSharedPreferences("mausam_personal_prefs", Context.MODE_PRIVATE)
        selectedCity = prefs.getString("selected_city", "Delhi NCR") ?: "Delhi NCR"
        updateActiveSummary(selectedCity)

        binding.btnPresetDelhi.setOnClickListener {
            applyScenario("Delhi NCR")
        }
        binding.btnPresetGoa.setOnClickListener {
            applyScenario("Goa Coast")
        }
        binding.btnPresetBengaluru.setOnClickListener {
            applyScenario("Bengaluru")
        }
        binding.btnPresetPunjab.setOnClickListener {
            applyScenario("Punjab Agri Belt")
        }
        binding.btnPresetMumbai.setOnClickListener {
            applyScenario("Mumbai")
        }
        binding.btnPresetLondon.setOnClickListener {
            applyScenario("London")
        }
        binding.btnPresetShimla.setOnClickListener {
            applyScenario("Shimla")
        }

        binding.btnApplySimulation.setOnClickListener {
            val p = requireContext().getSharedPreferences("mausam_personal_prefs", Context.MODE_PRIVATE)
            p.edit().putString("selected_city", selectedCity).apply()
            (activity as? MainActivity)?.updateCityButtonText(selectedCity)
            (activity as? MainActivity)?.navigateToTab(R.id.nav_home)
        }
    }

    private fun applyScenario(cityName: String) {
        selectedCity = cityName
        val ctx = context ?: return
        val prefs = ctx.getSharedPreferences("mausam_personal_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("selected_city", cityName).apply()
        (activity as? MainActivity)?.updateCityButtonText(cityName)
        updateActiveSummary(cityName)
        Toast.makeText(ctx, "Applied: $cityName", Toast.LENGTH_SHORT).show()
    }

    private fun updateActiveSummary(cityName: String) {
        val weather = MockData.getWeatherDataForCity(cityName)
        binding.tvActiveSimulationCity.text = "${weather.city} (${weather.condition})"
        binding.tvActiveSimulationStats.text =
            "Temp: ${weather.temperature}°C • AQI: ${weather.aqi} • Rain: ${weather.rainProbability}% • Wind: ${weather.windSpeedKmph}km/h • Vis: ${weather.visibilityKm}km"
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
