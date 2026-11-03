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
 *      or createEventPaymentSession (one checkout for every DJ on the event)
 *   4. createPortalLaunch      PortalLaunchRequest     → PortalLaunchResult
 *   5. getEventBookings        (your event ID)         → EventBookings
 *
 * Shapes for routes that are not live yet are at the bottom of this file.
 */

import type { BudgetBand } from "./budget.js";

// ─── Shared building blocks ─────────────────────────────────────────────────

/** A money amount in the smallest currency unit: `{ currency: "usd", total_cents: 45000 }` is $450.00. */
export interface Money {
  /** Lowercase ISO 4217 code, for example `"usd"`. */
  currency: string;
  total_cents: number;
}

// ─── 1. listDjs ─────────────────────────────────────────────────────────────

export type DjTier = "verified" | "top_performer" | "resident" | "city_pillar";

/** A set time for `listDjs`. */
export interface DjSetWindow {
  /** ISO 8601 with an offset. */
  starts_at: string;
  /** ISO 8601 with an offset; after `starts_at`. */
  ends_at: string;
  /** The event's IANA time zone, for example `"America/New_York"`. */
  time_zone: string;
}

export interface DjCatalogQuery {
  /**
   * A city, with or without its state: `"Atlanta, GA"`, `"Atlanta"` and
   * `"Atlanta, Georgia"` find the same DJs. Use a `label` from `listCities()`.
   */
  city?: string;
  /**
   * One genre. Case, accents, spaces and punctuation are ignored, so
   * `"Deep-House"` and `"deep house"` find the same DJs; there are no
   * synonyms. Use a `name` from `listGenres()`. A genre no DJ has returns an
   * empty page, not an error.
   */
  genre?: string;
  /** `YYYY-MM-DD`. When set, each DJ's `available` is for that night. */
  date?: string;
  /**
   * The time the organizer chose for the set, instead of `date`. Each DJ's
   * `available` is then for that window. Send the same times on the DJ's
   * request in `submitBookingRequests`.
   */
  set?: DjSetWindow;
  /**
   * With `date`: list only the DJs free that night, so a page never holds a
   * DJ the organizer can't book. Needs `date`. Without it, every DJ is
   * listed with their own `available`.
   */
  available?: boolean;
  /**
   * Budget bands from `BUDGET_BANDS` (`@gelatinbookings/partner-sdk/budget`).
   * Returns DJs whose real minimum rate is in any of them, including DJs who
   * keep their rate private (their `published_rate_cents` stays null). A DJ
   * with no rate on file is in no band. Empty or omitted means any budget.
   */
  budget?: readonly BudgetBand[];
  /** `next_cursor` from the previous page. */
  cursor?: string;
  /** Page size, 1–100. Defaults to 20. */
  limit?: number;
}

/**
 * How many people the DJ draws on a verified night (`min`–`max`, averaging
 * `avg`), and over what `window`. Only venue-confirmed head counts count; a DJ
 * with none has no draw (null), never a 0.
 */
export interface DjDraw {
  min: number;
  max: number;
  /** Null only from a Gelatin API that predates the average. */
  avg: number | null;
  window: string;
}

export interface PublicDj {
  /** Gelatin's DJ ID. Send it back as `dj_id` in a booking request. */
  id: string;
  name: string;
  city: string;
  tier: DjTier;
  /**
   * The DJ's public profile: the read-only, co-branded page on your portal
   * origin when Gelatin has one registered for you, otherwise the Gelatin profile.
   */
  profile_url: string;
  /** An https image URL, or null when the DJ has no photo. */
  image_url: string | null;
  draw: DjDraw | null;
  /**
   * Up to six genres from the DJ's profile, in the DJ's own order; empty when
   * the DJ lists none. When `listDjs` was filtered by `genre`, that genre is
   * first. Servers older than this field send none; the SDK reads that as `[]`.
   */
  genres: string[];
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

// ─── listCities (feeds listDjs) ─────────────────────────────────────────────

export interface DirectoryCity {
  /** `"Atlanta"`. */
  name: string;
  /** `"Atlanta, GA"`. Pass it as `listDjs({ city })`. */
  label: string;
  /** DJs your catalog lists in this city. Zero is a real answer: the city is listed and can still be searched. */
  dj_count: number;
}

export interface DirectoryRegion {
  /** A state code, `"GA"`, or null for the cities Gelatin could not place in a state. */
  code: string | null;
  /** `"Georgia"`. */
  name: string;
  cities: DirectoryCity[];
}

export interface DirectoryCountry {
  /** `"US"`, or null for cities Gelatin could not place in a country. */
  code: string | null;
  name: string;
  regions: DirectoryRegion[];
}

/**
 * Every US state with its major cities (the same list as `US_MAJOR_CITIES` in
 * `@gelatinbookings/partner-sdk/places`), plus any other city where your
 * catalog has a DJ, each with this partner's DJ count.
 */
export interface CityDirectory {
  countries: DirectoryCountry[];
}

// ─── joinCityWaitlist (a city with no DJs) ──────────────────────────────────

/** An organizer asks to be told when DJs are available in a city. */
export interface CityWaitlistRequest {
  /** The organizer's email. Gelatin stores it lower-cased; at most 254 characters. */
  email: string;
  /** A bundled city's `label` from `listCities`, such as `"Boise, ID"`. */
  city: string;
  /** Send `true` only after the organizer asked to be told; Gelatin records the time. */
  consent: true;
  /** Where the ask came from, as a short lower-case label such as `"empty_state"`. Defaults to `"partner_api"`. */
  source?: string;
}

export interface CityWaitlistResult {
  /** `already_subscribed` when this email already asked for this city through you. */
  status: "subscribed" | "already_subscribed";
  city: { name: string; region: string; label: string };
}

// ─── listGenres (feeds listDjs) ─────────────────────────────────────────────

export interface GenreQuery {
  /** A `listCities` label. Counts only DJs `listDjs({ city })` would return; omit for every city. */
  city?: string;
  /** The same bands as `listDjs({ budget })`, so each count is what that search returns. */
  budget?: readonly BudgetBand[];
}

export interface DirectoryGenre {
  /** `"Deep House"`: the spelling most of these DJs use. Pass it as `listDjs({ genre })`. */
  name: string;
  /** DJs your catalog lists with this genre, in the asked-for city. Always at least 1. */
  dj_count: number;
}

/** Genres your catalog's DJs list, busiest first. Only genres with DJs appear, so none returns an empty page. */
export interface GenreDirectory {
  genres: DirectoryGenre[];
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
  /**
   * Your ID for the community that runs the event. Required for Make a Deal.
   * Amounts owed attach to the community, so a colleague creating the next
   * event can't shed them. Set once per event.
   */
  community_ref?: string;
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

/**
 * How the organizer pays. `confirm_and_book` (the default): a card hold,
 * charged when the DJ accepts. `make_a_deal`: no hold and no charge; the
 * organizer pays the DJ directly, and while their community owes a DJ it can't
 * add talent. Make a Deal is enabled per partner.
 */
export type PartnerDeal = "confirm_and_book" | "make_a_deal";

/** One DJ in the booking. Each DJ is requested, paid and answered separately. */
export interface DjRequest {
  /**
   * Optional: your ID for this one DJ request. Left out, Gelatin derives one
   * (`gelatin:…`) and returns it; use `request_id` to refer to the request.
   */
  external_request_id?: string;
  /** `PublicDj.id`. */
  dj_id: string;
  initial_offer: DjOffer;
  /** Defaults to `confirm_and_book`. `make_a_deal` needs `organizer.community_ref`. */
  deal?: PartnerDeal;
  /**
   * The time the organizer chose for this DJ's set: ISO 8601 with an offset,
   * inside the event. Send both or neither. Gelatin checks the DJ against this
   * window rather than the whole event, and shows it on the public lineup once
   * the DJ is confirmed.
   */
  set_starts_at?: string;
  set_ends_at?: string;
}

/** Body of `submitBookingRequests`: one booking with one or more DJs. */
export interface BookingRequest {
  /** Your event ID. You read status back with it. Required. */
  external_event_id: string;
  /** @deprecated Accepted and ignored by Gelatin. Leave it out. */
  external_submission_id?: string;
  /**
   * Optional: your booking ID. Gelatin accepts each one once, so a retry is
   * never a second booking. Left out, the Idempotency-Key does that job, and a
   * later send under a new key adds DJs to the same event.
   */
  external_booking_id?: string;
  organizer: Organizer;
  event: EventDetails;
  requests: DjRequest[];
  authorization_placement: AuthorizationPlacement;
  /** Where Gelatin's booking page sends the organizer back. Its origin must be registered with Gelatin. */
  return_url: string;
  /**
   * Optional: also open one checkout for every DJ on the event and return it
   * as `event_checkout`, so your page mounts Stripe from this one call. Needs
   * `launch:write` as well as `requests:write`, and saved cards on for you.
   */
  payment?: "event_checkout";
}

/** @deprecated Renamed to `BookingRequest`; same shape. */
export type DjRequestSubmission = BookingRequest;

/** What Gelatin created for one DJ. Store these IDs with your event. */
export interface BookingRequestEngagement {
  id: string;
  /** Your `DjRequest.external_request_id`, or the one Gelatin derived when you left it out. */
  external_request_id: string;
  dj_id: string;
  /** Pass to `createPaymentSession` and `createPortalLaunch` as `{ kind: "request", id }`. */
  request_id: string;
  /** Pass to `createPortalLaunch` as `{ kind: "booking", id }`. */
  booking_id: string;
  offer_id: string;
  revision: number;
  /** What the organizer pays: DJ fee plus Gelatin's service fee and card processing. Never compute this yourself. On Make a Deal, the DJ's fee, paid to the DJ directly. */
  total_cents: number;
  currency: string;
  /** Sent only for Make a Deal; read absent as `confirm_and_book`. */
  deal?: PartnerDeal;
}

export interface BookingRequestResult {
  group_id: string;
  event_id: string;
  /** One per DJ request, in the order you sent them. */
  engagements: BookingRequestEngagement[];
  /** Sent only with `payment: "event_checkout"`, when the checkout opened. A replay returns the same open checkout. */
  event_checkout?: EventPaymentSessionResult;
  /** Sent only with `payment: "event_checkout"`, when the booking was made but its checkout could not open. */
  event_checkout_error?: EventCheckoutError;
}

/**
 * Why one checkout for the whole event didn't open, and what to do instead:
 * `nothing_to_pay`, every DJ is held or being held on the event's card, so
 * read booking status; `event_checkout_unavailable`, create a payment session
 * for each DJ still `authorization_required`; `temporarily_unavailable`, call
 * `createEventPaymentSession` again.
 */
export interface EventCheckoutError {
  code: "nothing_to_pay" | "event_checkout_unavailable" | "resource_unavailable" | "temporarily_unavailable";
  message: string;
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

/** One checkout for every DJ on the organizer's event. Needs saved cards on for you. */
export interface EventPaymentSessionRequest {
  external_event_id: string;
  /** The same organizer ID the booking was sent with. */
  external_user_id: string;
}

/**
 * Mount it exactly like a `PaymentSessionResult`. It saves the organizer's
 * card (the consent shows inside it); Gelatin then holds each DJ in the
 * background. Read booking status: a DJ the card couldn't hold stays
 * `authorization_required`, and a portal launch finishes it.
 */
export interface EventPaymentSessionResult extends PaymentSessionResult {
  /** Every DJ the saved card will hold, fees included. */
  total_cents: number;
  /** How many DJs the saved card will hold. */
  dj_count: number;
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
  /** Mid-negotiation, whose answer the booking waits on; null once settled. */
  pending_party: "organizer" | "dj" | null;
  /** The current organizer total, or null when there is no live offer. */
  amount: Money | null;
  /**
   * Confirm & Book (a card hold, charged when the DJ accepts) or Make a Deal
   * (no hold; the organizer pays the DJ directly and the amount is the DJ's fee).
   * Sent only for Make a Deal; read absent as confirm_and_book.
   */
  deal?: PartnerDeal;
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

// ─── listAlternates (after a request is lost) ───────────────────────────────

/** Your own event, as the lost offer saved it, to prefill a new request. */
export interface AlternatesEventDetails {
  name: string;
  venue_name: string;
  venue_address: string | null;
  starts_at: string;
  ends_at: string;
  time_zone: string;
}

/**
 * Who else is open for a slot a DJ passed on, let expire, or otherwise lost.
 * Each DJ is available on `date`, in `city` (by name or service radius), and
 * either publishes a rate within `budget` plus a fifth or publishes none. The
 * DJ who was lost and every DJ already asked for this event are left out.
 * Reading this books, holds and charges nothing.
 */
export interface DjAlternates {
  request_id: string;
  /** The DJ whose request was lost. */
  dj_id: string;
  /** The event's own calendar date, `YYYY-MM-DD`, in its time zone. */
  date: string;
  /** A `listCities` label, or null when Gelatin had no city to go on. */
  city: string | null;
  /** The organizer's last offered DJ fee. */
  budget: { currency: string; dj_fee_cents: number };
  event: AlternatesEventDetails;
  /** Up to five, best rate match first. Empty is a real answer. */
  items: PublicDj[];
}

// ─── 6. getEventLineup ──────────────────────────────────────────────────────

/** `confirmed`: booked and paid. `pending`: the DJ has the offer and hasn't settled it yet. */
export type LineupStatus = "confirmed" | "pending";

/** One DJ on an event's public lineup. Display data only: no prices or booking details. */
export interface LineupEntry {
  dj_id: string;
  name: string;
  status: LineupStatus;
  /**
   * The DJ's public profile: the co-branded page on your portal origin when
   * Gelatin has one registered for you, otherwise the Gelatin profile. Link to
   * it wherever the name is shown.
   */
  profile_url: string;
  /** An https image URL, or null when the DJ has no photo. */
  image_url: string | null;
  /**
   * When the DJ's set starts, as a UTC ISO 8601 instant. Null when no set time
   * was chosen, and always null on a `pending` entry.
   */
  set_starts_at?: string | null;
  /** When the DJ's set ends. Null under the same conditions as `set_starts_at`. */
  set_ends_at?: string | null;
  /**
   * The sound the DJ is bringing to this set, such as `"R&B / House mix"`, up to
   * 80 characters of plain text the DJ wrote. Null when they haven't named one,
   * and always null on a `pending` entry.
   */
  sound?: string | null;
}

/** Who's playing at one of your events, safe to show on a public page. */
export interface EventLineup {
  external_event_id: string;
  entries: LineupEntry[];
}

/** `getEventLineup` result, revalidated with `ifNoneMatch` like `getEventBookings`. */
export type ConditionalEventLineup =
  | { modified: false; etag: string | null }
  | { modified: true; etag: string | null; data: EventLineup };

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

// ─── previewCancellation / cancelBooking ────────────────────────────────────

/** Why a booking can't be cancelled now. */
export type CancellationBlock = "event_started" | "already_cancelled" | "already_completed" | "not_cancellable";

/** Which rule of the partner cancellation policy applies. */
export type CancellationRuleCode =
  | "free_before_acceptance"
  | "full_refund_7_days"
  | "half_2_to_7_days"
  | "dj_keeps_fee_under_48_hours";

/**
 * What cancelling one DJ's booking would do now. Show `rule.text` and the
 * amounts to the organizer before they confirm; `cancelBooking` applies the
 * same plan. On Make a Deal nothing is refunded and `dj_keeps_cents` is what
 * the organizer owes the DJ directly.
 */
export interface CancellationPreview {
  booking_id: string;
  deal: PartnerDeal;
  cancellable: boolean;
  /** Null when the booking can be cancelled now. */
  blocked_reason: CancellationBlock | null;
  currency: string;
  /** What was charged to the organizer's card; zero while it's only held. */
  charged_cents: number;
  refund_cents: number;
  dj_keeps_cents: number;
  gelatin_keeps_cents: number;
  /** Nothing was charged: the card hold, or an unfinished checkout, is released. */
  hold_released: boolean;
  rule: { code: CancellationRuleCode; text: string };
}

/** The cancellation. `dj-bookings` then shows the request as `cancelled` with a new ETag. */
export interface CancellationResult extends CancellationPreview {
  status: "cancelled";
  /** The booking was cancelled before this call; no money moved again. */
  already_cancelled: boolean;
}

// ─── getOrganizerStanding (Make a Deal) ─────────────────────────────────────

/** One amount the organizer's community owes a DJ directly. */
export interface OwedAmount {
  /** Your `DjRequest.external_request_id` the amount came from. */
  external_request_id: string;
  dj_id: string;
  /** `unpaid_fee`: the DJ said a Make a Deal fee wasn't paid. `cancellation`: the DJ's share of a late cancellation. */
  reason: "unpaid_fee" | "cancellation";
  amount: Money;
  /** When it fell due, ISO 8601. */
  due_at: string;
}

/**
 * Whether a community may add talent, and what it owes. Gate your own Add
 * talent control on `may_add_talent`; a create while it is false gets
 * `403 organizer_owes`, on every event the community runs.
 */
export interface OrganizerStanding {
  community_ref: string;
  may_add_talent: boolean;
  amount_owed: Money;
  /** Oldest first. */
  owed: OwedAmount[];
}
