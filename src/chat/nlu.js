/**
 * nlu.js — natural-language understanding for Mausam Mitra (the chatbot).
 *
 * Deliberately dependency-free: token/keyword scoring with priority rules,
 * entity extraction (day, time-of-day, hour, place, activity) and
 * follow-up detection ("and tomorrow?", "what about the evening?").
 * English + common Hinglish weather words. Runs anywhere (Node + browser).
 */

export const INTENTS = {
  GREETING: 'greeting',
  HELP: 'help',
  PROFILE: 'profile',
  THANKS: 'thanks',
  RAIN: 'rain',
  TEMP: 'temp',
  WEAR: 'wear',
  AIR: 'air',
  UV: 'uv',
  SUN: 'sun',
  ACTIVITY: 'activity',
  LAUNDRY: 'laundry',
  COMMUTE: 'commute',
  EVENT: 'event',
  TRAVEL: 'travel',
  FARM: 'farm',
  FORECAST: 'forecast',
  NOW: 'now',
  UNKNOWN: 'unknown',
};

/* ---------------- keyword tables ---------------- */

// Later table rows win ties (reverse iteration) — specific beats generic.
const PHRASES = [
  [INTENTS.LAUNDRY, ['laundry', 'dry clothes', 'clothes dry', 'drying', 'wash clothes', 'kapde']],
  [INTENTS.FARM, ['irrigat', 'crop', 'farm', 'field', 'soil', 'spray', 'pesticid', 'kheti', 'khet', 'fasal', 'harvest', 'sow']],
  [INTENTS.COMMUTE, ['commute', 'traffic', 'drive', 'driving', 'office', 'leave for', 'road', 'metro', 'cab', 'fog on road']],
  [INTENTS.EVENT, ['event', 'party', 'picnic', 'wedding', 'function', 'ceremony', 'barbeque', 'bbq', 'garden party', 'outdoor plan']],
  [INTENTS.TRAVEL, ['travel', 'trip', 'pack', 'packing', 'suitcase', 'vacation', 'holiday', 'flight', 'going to', 'visit', 'tour']],
  [INTENTS.ACTIVITY, ['run', 'running', 'jog', 'jogging', 'cycling', 'cycle ride', 'walk', 'walking', 'trek', 'hike', 'hiking', 'workout', 'exercise', 'cricket', 'football', 'badminton', 'tennis', 'yoga outside', 'outdoor workout', 'training', 'gym outdoors', 'match', 'play outside', 'khel']],
  [INTENTS.WEAR, ['wear', 'clothes should', 'what to wear', 'dress', 'outfit', 'jacket', 'sweater', 'cap', 'sunglasses', 'footwear', 'sandals', 'boots', 'kapde kaise']],
  [INTENTS.AIR, ['aqi', 'air quality', ' air ', 'pollution', 'smog', 'asthma', 'mask', 'dhuan', 'pradushan', 'pollutant']],
  [INTENTS.UV, ['uv', 'sunburn', 'sun screen', 'sunscreen', 'tanning', 'sun exposure']],
  [INTENTS.SUN, ['sunrise', 'sunset', 'sun rise', 'sun set', 'golden hour', 'dusk', 'dawn', 'suraj', 'moonrise', 'moonset']],
  [INTENTS.RAIN, ['rain', 'raining', 'rainy', 'umbrella', 'chhata', 'chatri', 'shower', 'drizzle', 'thunder', 'storm', 'baarish', 'barish', 'barsat', 'wet weather', 'baris']],
  [INTENTS.TEMP, ['temperature', 'hot', 'cold', 'warm', 'cool', 'chilly', 'freezing', 'garmi', 'thand', 'thandi', 'sardi', 'degree', 'heat', 'how hot', 'how cold']],
  [INTENTS.FORECAST, ['forecast', 'this week', 'week ahead', 'coming days', 'next few days', 'weekend', '7 day', 'seven day', 'hafta']],
  [INTENTS.NOW, ['weather', 'current', 'right now', 'abhi', 'outside', 'conditions', 'mausam kaisa', 'how is it', "what's it like", 'whats it like', 'update']],
];

const GREETINGS = ['hi', 'hello', 'hey', 'hii', 'namaste', 'namaskar', 'yo', 'good morning', 'good afternoon', 'good evening', 'hola'];
const THANKS = ['thanks', 'thank you', 'thx', 'shukriya', 'dhanyavad', 'dhanyawad', 'great job', 'nice work', 'awesome'];
const HELP = ['help', 'what can you do', 'who are you', 'how do you work', 'commands', 'options', 'kya kar sakte'];
const PROFILE = ['my profile', 'who am i', 'profile', 'switch profile', 'new profile', 'change profile', 'edit profile', 'delete profile', 'about me', 'my settings', 'preferences'];

/* ---------------- entities ---------------- */

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const TIME_OF_DAY = [
  ['morning', ['morning', 'subah', 'sunrise time']],
  ['afternoon', ['afternoon', 'noon', 'midday', 'dopahar', 'lunch']],
  ['evening', ['evening', 'shaam', 'sham', 'dusk', 'tonight']],
  ['night', ['night', 'raat', 'late', 'midnight', 'overnight']],
];

const STOP_PLACE_WORDS = new Set([
  'today', 'tomorrow', 'tonight', 'now', 'here', 'there', 'weather', 'rain', 'the', 'a', 'an',
  'morning', 'evening', 'afternoon', 'night', 'week', 'weekend', 'right', 'currently', 'like',
  'going', 'at', 'in', 'on', 'for', 'my', 'is', 'it', 'will', 'be', 'this', 'that', 'should', 'i',
]);

/** Extract structured entities from raw text. */
export function extractEntities(raw) {
  const text = ` ${String(raw ?? '').toLowerCase().replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim()} `;

  // ---- day ----
  let dayIndex = null;
  let dayLabel = null;
  if (/\b(today|aaj|right now|this morning|this evening|tonight)\b/.test(text)) { dayIndex = 0; dayLabel = 'today'; }
  else if (/\b(tomorrow|tmrw|tmr|tomorow|kal|next day)\b/.test(text)) { dayIndex = 1; dayLabel = 'tomorrow'; }
  else if (/\bday after\b|\bparso\b/.test(text)) { dayIndex = 2; dayLabel = 'the day after'; }
  else if (/\bweekend\b/.test(text)) { dayIndex = 'weekend'; dayLabel = 'this weekend'; }
  else {
    for (let i = 0; i < WEEKDAYS.length; i++) {
      if (new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(text)) {
        dayIndex = { weekday: i };
        dayLabel = WEEKDAYS[i];
        break;
      }
    }
  }

  // ---- time of day ----
  let timeOfDay = null;
  for (const [name, words] of TIME_OF_DAY) {
    if (words.some((w) => text.includes(w))) { timeOfDay = name; break; }
  }

  // ---- explicit hour ("at 6", "6pm", "by 10 am") ----
  let hour = null;
  const hm = text.match(/\b(?:at|by|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/) ||
             text.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (hm) {
    let h = Number(hm[1]);
    const mer = hm[3] ?? hm[2];
    if (mer === 'pm' && h < 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
    if (h >= 0 && h <= 23) hour = h;
  }

  // ---- place ("in shimla", "weather at goa") ----
  let place = null;
  const pm = text.match(/\b(?:in|at|to|for)\s+((?:[a-z'-]+ ){0,2}[a-z'-]+)\s*$/) ||
             text.match(/\b(?:weather|rain|temp(?:erature)?)\s+(?:in|at)\s+((?:[a-z'-]+ ){0,2}[a-z'-]+)/);
  if (pm) {
    const words = pm[1].trim().split(/\s+/).filter((w) => !STOP_PLACE_WORDS.has(w) && w.length > 1);
    if (words.length && words.length <= 3) place = words.join(' ');
  }

  // ---- activity hint ----
  let activity = null;
  if (/\brun|jog|running/.test(text)) activity = 'run';
  else if (/\bcycl|cycling|bicycle/.test(text)) activity = 'cycle';
  else if (/\bwalk|walking|stroll/.test(text)) activity = 'walk';
  else if (/\bcricket|football|badminton|tennis|match\b/.test(text)) activity = 'sport';
  else if (/\btrek|hike|hiking/.test(text)) activity = 'hike';
  else if (/\bworkout|exercise|training|gym/.test(text)) activity = 'workout';
  else if (/\blaundry|dry clothes|kapde/.test(text)) activity = 'laundry';

  return { dayIndex, dayLabel, timeOfDay, hour, place, activity, text };
}

/** Is this a follow-up like "and tomorrow?" / "what about the evening?"? */
export function detectFollowup(raw) {
  const t = String(raw ?? '').toLowerCase().replace(/[?!.]+/g, ' ').trim();
  const short = t.split(/\s+/).length <= 6;
  const startsFollowup = /^(and|what about|whats about|what's about|how about|there|that day|same for|next|again|also|us din|or)\b/.test(t);
  const bareDay = short &&
    /\b(tomorrow|evening|morning|afternoon|night|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tmrw|kal)\b/.test(t) &&
    !/\b(weather|rain|temp|wear|aqi|run|walk|laundry|drive|pack|air|event)\b/.test(t);
  return { isFollowup: Boolean(startsFollowup || bareDay), text: t };
}

/* ---------------- intent classification ---------------- */

function scorePhrases(text) {
  const scores = [];
  for (const [intent, words] of PHRASES) {
    let s = 0;
    for (const w of words) {
      if (text.includes(w)) s += w.includes(' ') ? 2.2 : 1.4;
    }
    if (s > 0) scores.push([intent, s]);
  }
  return scores;
}

/**
 * Classify a raw user message.
 * @returns {{intent:string, entities:object, confidence:number}}
 */
export function classify(raw) {
  const text = ` ${String(raw ?? '').toLowerCase().replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const words = text.trim().split(/\s+/).filter(Boolean);

  if (words.length <= 4 && GREETINGS.includes(text.trim())) {
    return { intent: INTENTS.GREETING, entities: extractEntities(raw), confidence: 1 };
  }
  if (words.length <= 5 && THANKS.some((t) => text.includes(t))) {
    return { intent: INTENTS.THANKS, entities: extractEntities(raw), confidence: 0.9 };
  }
  if (HELP.some((h) => text.includes(h))) {
    return { intent: INTENTS.HELP, entities: extractEntities(raw), confidence: 0.9 };
  }
  if (PROFILE.some((p) => text.includes(p)) && !/\bwear|rain|temp\b/.test(text)) {
    return { intent: INTENTS.PROFILE, entities: extractEntities(raw), confidence: 0.85 };
  }

  const scores = scorePhrases(text);
  let best = null;
  let bestScore = 0;
  for (let i = scores.length - 1; i >= 0; i--) {
    const [intent, s] = scores[i];
    if (s > bestScore) { best = intent; bestScore = s; }
  }

  if (!best) {
    const e = extractEntities(raw);
    if (e.place) return { intent: INTENTS.NOW, entities: e, confidence: 0.4 };
    if (/\b(when|kab)\b/.test(text) && e.activity) return { intent: INTENTS.ACTIVITY, entities: e, confidence: 0.5 };
    return { intent: INTENTS.UNKNOWN, entities: e, confidence: 0 };
  }

  return { intent: best, entities: extractEntities(raw), confidence: Math.min(1, bestScore / 3) };
}

/** Supported example phrases per intent (used for suggestion chips). */
export const EXAMPLES = {
  [INTENTS.RAIN]: 'Will it rain today?',
  [INTENTS.TEMP]: 'How hot is it right now?',
  [INTENTS.WEAR]: 'What should I wear?',
  [INTENTS.AIR]: 'How is the air quality?',
  [INTENTS.ACTIVITY]: 'Best time to run tomorrow?',
  [INTENTS.LAUNDRY]: 'Can I dry clothes outside today?',
  [INTENTS.COMMUTE]: 'How is the drive this evening?',
  [INTENTS.EVENT]: 'Is Saturday good for a picnic?',
  [INTENTS.TRAVEL]: 'What should I pack for a trip?',
  [INTENTS.FARM]: 'Should I irrigate the field this week?',
  [INTENTS.FORECAST]: 'How does this week look?',
  [INTENTS.SUN]: 'What time is sunrise?',
  [INTENTS.PROFILE]: 'Show my profile',
  [INTENTS.HELP]: 'What can you do?',
};
