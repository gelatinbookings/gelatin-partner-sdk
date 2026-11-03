import type { ConditionalEventBookings, PartnerBookingStatus } from "@gelatinbookings/partner-sdk/types";
import type { DemoBooking } from "./cookies";

type StatusReader = { getEventBookings(eventId: string): Promise<ConditionalEventBookings> };

/**
 * Gelatin call 5 of 5: `getEventBookings`, by your own event ID.
 *
 * Gelatin never calls your server; status is pull-only. Read it when you show
 * the booking. The result groups DJs by booking:
 * `EventBookings.bookings[].requests[]` is one `DjBookingStatus` per DJ, matched
 * here by the `request_id` that `submitBookingRequests` returned.
 *
 * Gelatin's current status for each request in these bookings, read once per
 * event. An event Gelatin can't answer for is left out, so the page still
 * renders and falls back to offering the Gelatin link.
 */
export async function readRequestStatuses(gelatin: StatusReader, bookings: DemoBooking[]): Promise<Record<string, PartnerBookingStatus>> {
  const statuses: Record<string, PartnerBookingStatus> = {};
  const results = await Promise.allSettled(bookings.map((booking) => gelatin.getEventBookings(booking.eventId)));
  for (const result of results) {
    if (result.status !== "fulfilled" || !result.value.modified) continue;
    for (const booking of result.value.data.bookings) {
      for (const request of booking.requests) statuses[request.request_id] = request.status;
    }
  }
  return statuses;
}

type Described = {
  label: string | null;
  tone: "ok" | "wait" | "no";
  action: string | null;
  via: "page" | "gelatin" | null;
  /** Offer the managed booking on Gelatin's page: status, changes and the DJ's replies. */
  manage: boolean;
};

/** What the organizer sees, and can do, for each status. */
const LABELS: Record<PartnerBookingStatus, Described> = {
  // The first card hold is taken right here, in Stripe's embedded checkout.
  authorization_required: { label: "Payment needed", tone: "wait", action: "Pay now", via: "page", manage: false },
  reauthorization_required: { label: "New offer from the DJ", tone: "wait", action: "Review the new offer in Gelatin", via: "gelatin", manage: false },
  requested: { label: "Card held · waiting for the DJ", tone: "wait", action: null, via: null, manage: true },
  negotiating: { label: "Negotiating", tone: "wait", action: null, via: null, manage: true },
  confirmed: { label: "Confirmed", tone: "ok", action: null, via: null, manage: true },
  declined: { label: "Passed", tone: "no", action: null, via: null, manage: false },
  expired: { label: "Expired", tone: "no", action: null, via: null, manage: false },
  cancelled: { label: "Cancelled", tone: "no", action: null, via: null, manage: false },
};

/**
 * What the bookings list shows for a request; an unknown status keeps the
 * Gelatin link. A booking paid with one checkout for every DJ has no per-DJ
 * "Pay now": Gelatin places each hold in the background, so a DJ still waiting
 * reads as confirming just after checkout, and later is finished in Gelatin
 * (the card refused that hold, wanted 3-D Secure, or hit a limit).
 */
export function describeStatus(status: PartnerBookingStatus | undefined, paid?: { eventCheckout: boolean; confirming: boolean }): Described {
  if (status === "authorization_required" && paid?.eventCheckout) {
    return paid.confirming
      ? { label: "Confirming card hold…", tone: "wait", action: null, via: null, manage: false }
      : { label: "Payment needed", tone: "wait", action: "Finish payment in Gelatin", via: "gelatin", manage: false };
  }
  return status ? LABELS[status] : { label: null, tone: "wait", action: "Review and pay in Gelatin", via: "gelatin", manage: false };
}

/** How long after one checkout for every DJ a DJ still waiting reads as "Confirming". */
const CONFIRMING_MS = 2 * 60_000;

/** Whether `since` (the `confirming` time the offer page added, in ms) is recent enough to still be confirming. */
export function confirmingSince(since: string | undefined, now = Date.now()): boolean {
  const elapsed = now - Number(since);
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed < CONFIRMING_MS;
}

/**
 * A DJ still has to answer one of these requests, so their status can change
 * without the organizer; or, just after one checkout for every DJ, Gelatin is
 * still placing the holds.
 */
export function shouldPoll(statuses: Record<string, PartnerBookingStatus>, confirming = false): boolean {
  return Object.values(statuses).some((status) => status === "requested" || status === "negotiating" || (confirming && status === "authorization_required"));
}
