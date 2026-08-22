package com.mausam.personal

import android.content.Context
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import com.google.android.material.materialswitch.MaterialSwitch
import com.mausam.personal.databinding.FragmentPersonaHubBinding

class PersonaHubFragment : Fragment() {

    private var _binding: FragmentPersonaHubBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentPersonaHubBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        renderPersonaList()

        binding.btnSelectAllPersonas.setOnClickListener {
            val allIds = PersonaType.entries.map { it.idName }.toSet()
            savePersonas(allIds)
            renderPersonaList()
            Toast.makeText(requireContext(), "All 8 personas enabled!", Toast.LENGTH_SHORT).show()
        }

        binding.btnResetPersonas.setOnClickListener {
            val defaultIds = setOf(
                PersonaType.HEALTH.idName,
                PersonaType.FITNESS.idName,
                PersonaType.COMMUTE.idName,
                PersonaType.FAMILY.idName
            )
            savePersonas(defaultIds)
            renderPersonaList()
            Toast.makeText(requireContext(), "Reset to default 4 personas", Toast.LENGTH_SHORT).show()
        }

        binding.btnSavePersonas.setOnClickListener {
            (activity as? MainActivity)?.navigateToTab(R.id.nav_home)
        }
    }

    private fun renderPersonaList() {
        val container = binding.layoutPersonasList
        container.removeAllViews()
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
        ) ?: setOf(
            PersonaType.HEALTH.idName,
            PersonaType.FITNESS.idName,
            PersonaType.COMMUTE.idName,
            PersonaType.FAMILY.idName
        )

        PersonaType.entries.forEach { persona ->
            val cardView = LayoutInflater.from(ctx).inflate(R.layout.item_persona_card, container, false)

            val emojiTv: TextView = cardView.findViewById(R.id.tv_persona_emoji)
            val titleTv: TextView = cardView.findViewById(R.id.tv_persona_title)
            val descTv: TextView = cardView.findViewById(R.id.tv_persona_desc)
            val switchToggle: MaterialSwitch = cardView.findViewById(R.id.switch_persona_active)

            emojiTv.text = persona.emoji
            titleTv.text = persona.displayName
            descTv.text = persona.tagline
            switchToggle.isChecked = activeSet.contains(persona.idName)

            switchToggle.setOnCheckedChangeListener { _, isChecked ->
                val currentSet = prefs.getStringSet(
                    "active_personas",
                    setOf(
                        PersonaType.HEALTH.idName,
                        PersonaType.FITNESS.idName,
                        PersonaType.COMMUTE.idName,
                        PersonaType.FAMILY.idName
                    )
                )?.toMutableSet() ?: mutableSetOf()

                if (isChecked) {
                    currentSet.add(persona.idName)
                } else {
                    if (currentSet.size > 1) {
                        currentSet.remove(persona.idName)
                    } else {
                        switchToggle.isChecked = true
                        Toast.makeText(ctx, "At least 1 persona must remain active", Toast.LENGTH_SHORT).show()
                    }
                }
                savePersonas(currentSet)
            }

            container.addView(cardView)
        }
    }

    private fun savePersonas(personas: Set<String>) {
        val ctx = context ?: return
        val prefs = ctx.getSharedPreferences("mausam_personal_prefs", Context.MODE_PRIVATE)
        prefs.edit().putStringSet("active_personas", personas).apply()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
