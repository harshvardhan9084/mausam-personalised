package com.mausam.personal

import android.content.Context
import android.os.Bundle
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import androidx.fragment.app.commit
import com.mausam.personal.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    private val homeFragment by lazy { HomeFragment() }
    private val personaHubFragment by lazy { PersonaHubFragment() }
    private val exploreFragment by lazy { ExploreFragment() }
    private val scenarioStudioFragment by lazy { ScenarioStudioFragment() }

    private val cities = arrayOf(
        "Delhi NCR",
        "Goa Coast",
        "Bengaluru",
        "Punjab Agri Belt",
        "Mumbai",
        "London",
        "Shimla"
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val prefs = getSharedPreferences("mausam_personal_prefs", Context.MODE_PRIVATE)
        val currentCity = prefs.getString("selected_city", "Delhi NCR") ?: "Delhi NCR"
        updateCityButtonText(currentCity)

        binding.btnCitySelector.setOnClickListener {
            showCitySelectionDialog()
        }

        binding.bottomNav.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_home -> {
                    switchFragment(homeFragment)
                    true
                }
                R.id.nav_personas -> {
                    switchFragment(personaHubFragment)
                    true
                }
                R.id.nav_explore -> {
                    switchFragment(exploreFragment)
                    true
                }
                R.id.nav_studio -> {
                    switchFragment(scenarioStudioFragment)
                    true
                }
                else -> false
            }
        }

        // Start on Home tab
        switchFragment(homeFragment)
    }

    private fun switchFragment(fragment: Fragment) {
        supportFragmentManager.commit {
            setReorderingAllowed(true)
            replace(R.id.fragment_container, fragment)
        }
    }

    fun navigateToTab(tabId: Int) {
        binding.bottomNav.selectedItemId = tabId
    }

    fun updateCityButtonText(cityName: String) {
        binding.btnCitySelector.text = "📍 $cityName ▾"
    }

    private fun showCitySelectionDialog() {
        val prefs = getSharedPreferences("mausam_personal_prefs", Context.MODE_PRIVATE)
        val currentCity = prefs.getString("selected_city", "Delhi NCR") ?: "Delhi NCR"
        val checkedItem = cities.indexOf(currentCity).coerceAtLeast(0)

        AlertDialog.Builder(this)
            .setTitle("Select Meteorological Station / City")
            .setSingleChoiceItems(cities, checkedItem) { dialog, which ->
                val selected = cities[which]
                prefs.edit().putString("selected_city", selected).apply()
                updateCityButtonText(selected)
                dialog.dismiss()

                // Refresh current active fragment
                val currentFragment = supportFragmentManager.findFragmentById(R.id.fragment_container)
                if (currentFragment is HomeFragment) {
                    currentFragment.refreshDashboard()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
}