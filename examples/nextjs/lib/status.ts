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

/** What the bookings list shows for a request; an unknown status keeps the Gelatin link. */
export function describeStatus(status: PartnerBookingStatus | undefined): Described {
  return status ? LABELS[status] : { label: null, tone: "wait", action: "Review and pay in Gelatin", via: "gelatin", manage: false };
}

/** A DJ still has to answer one of these requests, so their status can change without the organizer. */
export function shouldPoll(statuses: Record<string, PartnerBookingStatus>): boolean {
  return Object.values(statuses).some((status) => status === "requested" || status === "negotiating");
}
