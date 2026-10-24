/**
 * personas.js — persona registry: identity + visual metadata.
 * The advisory LOGIC lives in core/engine.js; this is the catalogue.
 */

export const PERSONAS = {
  fitness: {
    id: 'fitness',
    icon: '🏃',
    name: 'Outdoor Fitness',
    desc: 'Running, cycling, workouts',
  },
  commuter: {
    id: 'commuter',
    icon: '🚗',
    name: 'Commuter',
    desc: 'Daily travel & road conditions',
  },
  agriculture: {
    id: 'agriculture',
    icon: '🌾',
    name: 'Agriculture',
    desc: 'Farming, irrigation, fieldwork',
  },
  traveler: {
    id: 'traveler',
    icon: '✈️',
    name: 'Traveler',
    desc: 'Trips, packing, destinations',
  },
  event: {
    id: 'event',
    icon: '🎉',
    name: 'Event Planner',
    desc: 'Outdoor gatherings & events',
  },
};

export const PERSONA_IDS = Object.keys(PERSONAS);
