/** Made-up event details for trying the demo quickly. Clearly fictional. */
const EVENTS = [
  "Friday Night Social", "Rooftop Sundown Session", "Neon Garden Party", "Late Night Vinyl Club",
  "Summer Block Party", "Midnight Disco Revival", "Afrobeats After Dark", "House Music Brunch",
  "Warehouse Weekender", "Soulful Sunday Session",
];
/** Each venue with a made-up address on an obviously fictional street. */
const VENUES = [
  { name: "The Copper Room", address: "101 Example Ave, Atlanta, GA 30303" },
  { name: "Skyline Terrace", address: "202 Sample St, Atlanta, GA 30308" },
  { name: "Warehouse 9", address: "303 Demo Way, Atlanta, GA 30318" },
  { name: "The Velvet Lounge", address: "404 Placeholder Rd, Atlanta, GA 30306" },
  { name: "Riverside Hall", address: "505 Example Blvd, Atlanta, GA 30305" },
  { name: "Studio Eleven", address: "606 Sample Ln, Atlanta, GA 30312" },
  { name: "The Glasshouse", address: "707 Demo Ct, Atlanta, GA 30309" },
  { name: "Parkside Pavilion", address: "808 Placeholder Pl, Atlanta, GA 30307" },
  { name: "The Lantern Bar", address: "909 Example Row, Atlanta, GA 30310" },
  { name: "Harbor Loft", address: "1010 Sample Pier, Atlanta, GA 30318" },
];

/** A random event name, venue and its address; `random` is injectable so tests can pin it. */
export function sampleEventDetails(random: () => number = Math.random): { eventName: string; venueName: string; venueAddress: string } {
  const pick = <T,>(items: readonly T[]) => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  const venue = pick(VENUES);
  return { eventName: pick(EVENTS), venueName: venue.name, venueAddress: venue.address };
}
