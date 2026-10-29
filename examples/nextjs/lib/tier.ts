/**
 * The demo shows both integration tiers (see Gelatin's partner
 * integration tiers). Full is everything a partner can build;
 * Light is the minimum: pick a DJ, send the request, and let Gelatin's portal
 * take the card hold and everything after it.
 */
export type DemoTier = "full" | "light";

/** Anything but an exact "light" is Full, so an old or unexpected cookie shows the whole demo. */
export function parseTier(value: string | null | undefined): DemoTier {
  return value === "light" ? "light" : "full";
}

/** Where the first card hold happens: on this site in Full, in Gelatin's portal in Light. */
export function placementFor(tier: DemoTier): "partner_event_flow" | "gelatin_portal_handoff" {
  return tier === "light" ? "gelatin_portal_handoff" : "partner_event_flow";
}
