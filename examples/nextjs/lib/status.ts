import type { ConditionalEventBookings, PartnerBookingStatus } from "@gelatinbookings/partner-sdk/types";
import type { DemoBooking } from "./cookies";

type StatusReader = { getEventBookings(eventId: string): Promise<ConditionalEventBookings> };

/**
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

type Described = { label: string | null; tone: "ok" | "wait" | "no"; action: string | null; via: "page" | "gelatin" | null };

const LABELS: Record<PartnerBookingStatus, Described> = {
  // The first card hold is taken right here, in Stripe's embedded checkout.
  authorization_required: { label: "Payment needed", tone: "wait", action: "Pay now", via: "page" },
  reauthorization_required: { label: "New offer from the DJ", tone: "wait", action: "Review the new offer in Gelatin", via: "gelatin" },
  requested: { label: "Card held · waiting for the DJ", tone: "wait", action: null, via: null },
  negotiating: { label: "Negotiating", tone: "wait", action: null, via: null },
  confirmed: { label: "Confirmed", tone: "ok", action: null, via: null },
  declined: { label: "Declined by the DJ", tone: "no", action: null, via: null },
  expired: { label: "Expired", tone: "no", action: null, via: null },
  cancelled: { label: "Cancelled", tone: "no", action: null, via: null },
};

/** What the bookings list shows for a request; an unknown status keeps the Gelatin link. */
export function describeStatus(status: PartnerBookingStatus | undefined): Described {
  return status ? LABELS[status] : { label: null, tone: "wait", action: "Review and pay in Gelatin", via: "gelatin" };
}
