import type { DjAlternates, PartnerBookingStatus } from "@gelatinbookings/partner-sdk/types";
import type { DemoBooking } from "./cookies";
import type { Draft } from "./draft";
import { DEMO_TIME_ZONES } from "./time";

/**
 * Alternates: after a DJ passes, an offer expires or a request is otherwise
 * lost, Gelatin lists who else is open that night, in that city, at about that
 * budget. Offer starts this demo's usual flow, pre-filled; nothing is booked
 * or held until the organizer sends it.
 */

const LOST = new Set<PartnerBookingStatus>(["declined", "expired", "cancelled"]);

export function isLost(status: PartnerBookingStatus | undefined): boolean {
  return status !== undefined && LOST.has(status);
}

type AlternatesReader = { listAlternates(eventId: string, requestId: string): Promise<DjAlternates> };

/** Alternates for each lost request, by request ID. One Gelatin can't answer is left out. */
export async function readAlternates(
  gelatin: AlternatesReader,
  bookings: DemoBooking[],
  statuses: Record<string, PartnerBookingStatus>,
): Promise<Record<string, DjAlternates>> {
  const lost = bookings.flatMap((booking) => booking.engagements
    .filter((engagement) => isLost(statuses[engagement.requestId]))
    .map((engagement) => ({ eventId: booking.eventId, requestId: engagement.requestId })));
  const results = await Promise.allSettled(lost.map((slot) => gelatin.listAlternates(slot.eventId, slot.requestId)));
  const byRequest: Record<string, DjAlternates> = {};
  results.forEach((result, index) => { if (result.status === "fulfilled") byRequest[lost[index].requestId] = result.value; });
  return byRequest;
}

export function alternateHref(eventId: string, requestId: string, djId: string): string {
  return `/alternate?${new URLSearchParams({ event: eventId, request: requestId, dj: djId })}`;
}

/**
 * Gelatin's own page sends Offer back to the return URL with these two
 * parameters. Only a request this browser sent is followed.
 */
export function returnedOffer(params: Record<string, string | string[] | undefined>, bookings: DemoBooking[]): string | null {
  const requestId = params.gelatin_request_id, djId = params.gelatin_offer_dj;
  if (typeof requestId !== "string" || typeof djId !== "string") return null;
  const booking = bookings.find((item) => item.engagements.some((engagement) => engagement.requestId === requestId));
  return booking ? alternateHref(booking.eventId, requestId, djId) : null;
}

function clock(at: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(at));
}

/**
 * A new booking for the chosen DJ: the lost one's night, venue and budget.
 * The browser gives it a fresh nonce. Null for a DJ not in the list.
 */
export function draftFromAlternate(alternates: DjAlternates, djId: string): Omit<Draft, "nonce"> | null {
  const dj = alternates.items.find((item) => item.id === djId);
  if (!dj) return null;
  const event = alternates.event;
  const timeZone = (DEMO_TIME_ZONES as readonly string[]).includes(event.time_zone) ? event.time_zone : DEMO_TIME_ZONES[0];
  return {
    date: alternates.date, eventName: event.name, venueName: event.venue_name, venueAddress: event.venue_address ?? "",
    startTime: clock(event.starts_at, timeZone), endTime: clock(event.ends_at, timeZone), timeZone,
    email: "", organizerName: "", note: "",
    selected: [{ id: dj.id, name: dj.name, fee: String(Math.round(alternates.budget.dj_fee_cents / 100)) }],
  };
}
