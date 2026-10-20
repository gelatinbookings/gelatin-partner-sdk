/**
 * The partner API's request and response shapes, exactly as they go over the
 * wire (snake_case JSON). Each nested object has its own named type so you can
 * read a whole request top to bottom and reuse the parts in your own code.
 *
 * These are Gelatin's public projections, never its internal records.
 *
 * The live journey uses five calls, in order:
 *
 *   1. listDjs                 DjCatalogQuery          → DjCatalogPage
 *   2. submitBookingRequests   BookingRequest          → BookingRequestResult
 *   3. createPaymentSession    PaymentSessionRequest   → PaymentSessionResult
 *   4. createPortalLaunch      PortalLaunchRequest     → PortalLaunchResult
 *   5. getEventBookings        (your event ID)         → EventBookings
 *
 * Shapes for routes that are not live yet are at the bottom of this file.
 */

// ─── Shared building blocks ─────────────────────────────────────────────────

/** A money amount in the smallest currency unit: `{ currency: "usd", total_cents: 45000 }` is $450.00. */
export interface Money {
  /** Lowercase ISO 4217 code, for example `"usd"`. */
  currency: string;
  total_cents: number;
}

// ─── 1. listDjs ─────────────────────────────────────────────────────────────

export type DjTier = "verified" | "top_performer" | "resident" | "city_pillar";

export interface DjCatalogQuery {
  /** City name as Gelatin lists it, for example `"Atlanta"`. */
  city?: string;
  /** `YYYY-MM-DD`. When set, each DJ's `available` is for that night. */
  date?: string;
  /** `next_cursor` from the previous page. */
  cursor?: string;
  /** Page size, 1–100. Defaults to 20. */
  limit?: number;
}

/** How many people the DJ typically draws (`min`–`max`), and over what `window`. */
export interface DjDraw {
  min: number;
  max: number;
  window: string;
}

export interface PublicDj {
  /** Gelatin's DJ ID. Send it back as `dj_id` in a booking request. */
  id: string;
  name: string;
  city: string;
  tier: DjTier;
  /** The DJ's public Gelatin profile. */
  profile_url: string;
  /** An https image URL, or null when the DJ has no photo. */
  image_url: string | null;
  draw: DjDraw | null;
  /** The DJ's published rate. Null means show no rate or price hint at all. */
  published_rate_cents: number | null;
  /** Advisory only: Gelatin checks availability again when you send the request. */
  available: boolean;
}

export interface DjCatalogPage {
  items: PublicDj[];
  /** Pass as `cursor` for the next page; null on the last page. */
  next_cursor: string | null;
}

// ─── 2. submitBookingRequests ───────────────────────────────────────────────

/** Where the organizer places the first card hold. */
export type AuthorizationPlacement =
  /** On your own page, with `createPaymentSession`. */
  | "partner_event_flow"
  /** On Gelatin's booking page, with `createPortalLaunch`. */
  | "gelatin_portal_handoff";

/** The person booking. Use your own stable user ID. */
export interface Organizer {
  /** Your user ID. Gelatin remembers the first email it sees for it. */
  external_user_id: string;
  /** Where Gelatin sends payment and booking emails. */
  email: string;
  /** True if you have verified this email yourself. */
  email_verified?: boolean;
  display_name?: string;
}

/** The event the DJs are booked for. */
export interface EventDetails {
  name: string;
  /** ISO 8601 with an offset, for example `"2026-11-14T22:00:00-05:00"`. */
  starts_at: string;
  /** ISO 8601 with an offset; after `starts_at`. */
  ends_at: string;
  /** IANA time zone for the event's local calendar and display, for example `"America/New_York"`. */
  time_zone: string;
  venue_name: string;
  /** Optional street address. Gelatin shows it to the DJ so they know where to go. */
  venue_address?: string;
}

/** The organizer's first offer to one DJ. */
export interface DjOffer {
  /** Lowercase ISO 4217 code, for example `"usd"`. */
  currency: string;
  /** What the DJ is paid, in cents. Gelatin adds its own fees on top; see the result's `total_cents`. */
  dj_fee_cents: number;
  /** An optional message to the DJ. */
  note?: string;
}

/** One DJ in the booking. Each DJ is requested, paid and answered separately. */
export interface DjRequest {
  /** Your ID for this one DJ request. */
  external_request_id: string;
  /** `PublicDj.id`. */
  dj_id: string;
  initial_offer: DjOffer;
}

/** Body of `submitBookingRequests`: one booking with one or more DJs. */
export interface BookingRequest {
  /** Your event ID. You read status back with it. */
  external_event_id: string;
  /** Your ID for this send of the form. */
  external_submission_id: string;
  /** Your booking ID. Gelatin accepts each one once, so a retry is never a second booking. */
  external_booking_id: string;
  organizer: Organizer;
  event: EventDetails;
  requests: DjRequest[];
  authorization_placement: AuthorizationPlacement;
  /** Where Gelatin's booking page sends the organizer back. Its origin must be registered with Gelatin. */
  return_url: string;
}

/** @deprecated Renamed to `BookingRequest`; same shape. */
export type DjRequestSubmission = BookingRequest;

/** What Gelatin created for one DJ. Store these IDs with your event. */
export interface BookingRequestEngagement {
  id: string;
  /** Your `DjRequest.external_request_id`. */
  external_request_id: string;
  dj_id: string;
  /** Pass to `createPaymentSession` and `createPortalLaunch` as `{ kind: "request", id }`. */
  request_id: string;
  /** Pass to `createPortalLaunch` as `{ kind: "booking", id }`. */
  booking_id: string;
  offer_id: string;
  revision: number;
  /** What the organizer pays: DJ fee plus Gelatin's service fee and card processing. Never compute this yourself. */
  total_cents: number;
  currency: string;
}

export interface BookingRequestResult {
  group_id: string;
  event_id: string;
  /** One per DJ request, in the order you sent them. */
  engagements: BookingRequestEngagement[];
}

// ─── 3. createPaymentSession ────────────────────────────────────────────────

/** Pay for the organizer's own first offer on your page. A DJ's counteroffer is paid in Gelatin. */
export interface PaymentSessionRequest {
  external_event_id: string;
  /** The same organizer ID the booking was sent with. */
  external_user_id: string;
  resource: { kind: "request"; id: string };
}

/**
 * Mount it in the organizer's browser with Stripe.js:
 * `(await loadStripe(publishable_key)).createEmbeddedCheckoutPage({ fetchClientSecret: async () => client_secret })`.
 * The client secret opens only this one checkout. Give it to that organizer's browser only, and never log it.
 */
export interface PaymentSessionResult {
  client_secret: string;
  publishable_key: string;
  /** What the organizer authorizes: DJ fee plus Gelatin's service fee and card processing. */
  total_cents: number;
  currency: string;
}

// ─── 4. createPortalLaunch ──────────────────────────────────────────────────

/** Which booking Gelatin's page opens on. */
export interface LaunchResource {
  /** `"request"` opens one DJ; `"booking"` opens the whole booking. */
  kind: "request" | "booking";
  /** `BookingRequestEngagement.request_id` or `.booking_id`. */
  id: string;
}

export interface PortalLaunchRequest {
  external_event_id: string;
  /** The same organizer ID the booking was sent with. */
  external_user_id: string;
  resource: LaunchResource;
  /** Where "Back to your event" goes. Its origin must be registered with Gelatin. */
  return_url: string;
}

/** A one-use link to Gelatin's booking page. Redirect to it straight away: it expires in about 60 seconds. */
export interface PortalLaunchResult {
  url: string;
  expires_at: string;
}

/** @deprecated Renamed to `PortalLaunchRequest`; same shape. */
export type LaunchSessionRequest = PortalLaunchRequest;
/** @deprecated Renamed to `PortalLaunchResult`; same shape. */
export type LaunchSessionResult = PortalLaunchResult;

// ─── 5. getEventBookings ────────────────────────────────────────────────────

export type PartnerBookingStatus =
  /** The organizer hasn't placed the card hold yet. */
  | "authorization_required"
  /** Card held; the DJ is deciding (or accepted and the payment is going through). */
  | "requested"
  /** The DJ is answering the organizer's counteroffer. */
  | "negotiating"
  /** The DJ countered; the organizer reviews and re-authorizes in Gelatin. */
  | "reauthorization_required"
  /** The DJ is booked and paid. */
  | "confirmed"
  | "declined"
  | "expired"
  | "cancelled";

export type BookingActionKind = "authorize" | "review_terms" | "reauthorize" | "view_booking";

/** Something the organizer can do next, with a Gelatin link for it. */
export interface BookingAction {
  kind: BookingActionKind;
  url: string;
}

/** One DJ's current state. */
export interface DjBookingStatus {
  external_request_id: string;
  request_id: string;
  dj_id: string;
  status: PartnerBookingStatus;
  /** Goes up each time the offer changes. */
  offer_revision: number;
  /** The current organizer total, or null when there is no live offer. */
  amount: Money | null;
  actions: BookingAction[];
}

/** One booking you sent, with each of its DJs. */
export interface PartnerBooking {
  partner_booking_id: string;
  external_booking_id: string;
  requests: DjBookingStatus[];
}

/** Everything booked for one of your events. */
export interface EventBookings {
  external_event_id: string;
  /** Goes up on every change. */
  revision: number;
  bookings: PartnerBooking[];
}

/** @deprecated Renamed to `EventBookings`; same shape. */
export type EventBookingProjection = EventBookings;

/**
 * `getEventBookings` result. Pass the last `etag` as `ifNoneMatch` and an
 * unchanged read comes back as `{ modified: false }` with no body.
 */
export type ConditionalEventBookings =
  | { modified: false; etag: string | null }
  | { modified: true; etag: string | null; data: EventBookings };

// ─── Not live yet ───────────────────────────────────────────────────────────
// Typed for an upcoming release. Their routes aren't mounted yet, so calling
// them returns 404 today.

export interface EventUpdate {
  revision: number;
  kind: "updated";
  event: EventDetails;
}

export interface EventCancellation {
  revision: number;
  kind: "cancelled";
  cancelled_at: string;
  reason?: string;
}

export type EventChange = EventUpdate | EventCancellation;

export interface EventChangeResult {
  external_event_id: string;
  revision: number;
  status: "updated" | "cancelled";
}

export interface AttendanceAggregate {
  count: number;
  source: string;
  recorded_at: string;
}

export interface AttendanceResult {
  external_event_id: string;
  recorded: true;
}

/** Proposed result of `submitDjRequests`. Use `submitBookingRequests`. */
export type AuthorizationAction =
  | { kind: "portal"; url: string; expires_at: string }
  | { kind: "in_flow"; bootstrap_url: string; expires_at: string };

/** Proposed result of `submitDjRequests`. Use `submitBookingRequests`. */
export interface SubmissionResult {
  submission_id: string;
  partner_booking_id: string;
  requests: Array<{
    request_id: string;
    dj_id: string;
    status: "authorization_required";
    offer_revision: number;
    amount: Money;
    authorization: AuthorizationAction;
    portal_url: string;
  }>;
}
