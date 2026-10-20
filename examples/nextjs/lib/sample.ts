/** Made-up event details for trying the demo quickly. Clearly fictional. */
const EVENTS = [
  "Friday Night Social", "Rooftop Sundown Session", "Neon Garden Party", "Late Night Vinyl Club",
  "Summer Block Party", "Midnight Disco Revival", "Afrobeats After Dark", "House Music Brunch",
  "Warehouse Weekender", "Soulful Sunday Session",
];
const VENUES = [
  "The Copper Room", "Skyline Terrace", "Warehouse 9", "The Velvet Lounge", "Riverside Hall",
  "Studio Eleven", "The Glasshouse", "Parkside Pavilion", "The Lantern Bar", "Harbor Loft",
];

/** A random event name and venue; `random` is injectable so tests can pin it. */
export function sampleEventDetails(random: () => number = Math.random): { eventName: string; venueName: string } {
  const pick = (items: readonly string[]) => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  return { eventName: pick(EVENTS), venueName: pick(VENUES) };
}
