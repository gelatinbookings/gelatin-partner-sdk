import type { EventLineup } from "@gelatinbookings/partner-sdk/types";

/** One name on the public lineup: display data only, as Gelatin sent it. */
export type PublicLineupRow = { id: string; name: string; initials: string; profileUrl: string | null; imageUrl: string | null };

const https = (value: string | null) => (value && value.startsWith("https://") ? value : null);

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "DJ";
}

/**
 * The lineup an audience sees: confirmed DJs only, in Gelatin's order, each
 * linking to the profile Gelatin gave. No fees, offers or booker details exist
 * in this data, and none are added here.
 */
export function toPublicLineup(lineup: EventLineup): PublicLineupRow[] {
  return lineup.entries
    .filter((entry) => entry.status === "confirmed")
    .map((entry) => ({ id: entry.dj_id, name: entry.name, initials: initials(entry.name), profileUrl: https(entry.profile_url), imageUrl: https(entry.image_url) }));
}

/** "Sat, Nov 14, 2026" and "10:00 PM – 2:00 AM EST", in the event's own time zone. */
export function eventWhen(event: { startsAt: string; endsAt: string; timeZone: string }): { date: string; time: string } {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const date = new Intl.DateTimeFormat("en-US", { timeZone: event.timeZone, weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(start);
  const clock = (value: Date, zone: boolean) =>
    new Intl.DateTimeFormat("en-US", { timeZone: event.timeZone, hour: "numeric", minute: "2-digit", ...(zone ? { timeZoneName: "short" as const } : {}) }).format(value);
  return { date, time: `${clock(start, false)} – ${clock(end, true)}` };
}
