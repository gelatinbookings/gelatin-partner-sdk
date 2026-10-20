/** Public partner contract. These are projections, never Gelatin's internal records. */
export type DjTier = "verified" | "top_performer" | "resident" | "city_pillar";
export type AuthorizationPlacement = "partner_event_flow" | "gelatin_portal_handoff";
export type PartnerBookingStatus =
  | "authorization_required"
  | "requested"
  | "negotiating"
  | "reauthorization_required"
  | "confirmed"
  | "declined"
  | "expired"
  | "cancelled";

export interface PublicDj {
  id: string;
  name: string;
  city: string;
  tier: DjTier;
  profile_url: string;
  image_url: string | null;
  draw: { min: number; max: number; window: string } | null;
  /** Null means no rate or derived affordability hint may be displayed. */
  published_rate_cents: number | null;
  /** Advisory only; Gelatin rechecks availability at each write boundary. */
  available: boolean;
}

export interface DjCatalogPage {
  items: PublicDj[];
  next_cursor: string | null;
}

export interface DjCatalogQuery {
  city?: string;
  date?: string;
  cursor?: string;
  limit?: number;
}

export interface DjRequestSubmission {
  external_event_id: string;
  external_submission_id: string;
  /** Your stable booking ID; one booking may contain several DJs. */
  external_booking_id: string;
  organizer: {
    external_user_id: string;
    email: string;
    email_verified?: boolean;
    display_name?: string;
  };
  event: {
    name: string;
    starts_at: string;
    ends_at: string;
    /** IANA timezone for the event's local calendar and display. */
    time_zone: string;
    venue_name: string;
  };
  requests: Array<{
    external_request_id: string;
    dj_id: string;
    initial_offer: { currency: string; dj_fee_cents: number; note?: string };
  }>;
  authorization_placement: AuthorizationPlacement;
  return_url: string;
}

export type AuthorizationAction =
  | { kind: "portal"; url: string; expires_at: string }
  | { kind: "in_flow"; bootstrap_url: string; expires_at: string };

export interface SubmissionResult {
  submission_id: string;
  partner_booking_id: string;
  requests: Array<{
    request_id: string;
    dj_id: string;
    status: "authorization_required";
    offer_revision: number;
    amount: { currency: string; total_cents: number };
    authorization: AuthorizationAction;
    portal_url: string;
  }>;
}

/** One DJ's engagement from the mounted `booking-requests` route. */
export interface BookingRequestEngagement {
  id: string;
  external_request_id: string;
  dj_id: string;
  /** Pass as a portal launch resource of kind "request". */
  request_id: string;
  /** Pass as a portal launch resource of kind "booking". */
  booking_id: string;
  offer_id: string;
  revision: number;
  /** Server-calculated organizer total; never computed by the partner. */
  total_cents: number;
  currency: string;
}

export interface BookingRequestResult {
  group_id: string;
  event_id: string;
  engagements: BookingRequestEngagement[];
}

export interface LaunchSessionRequest {
  external_event_id: string;
  external_user_id: string;
  resource: { kind: "request" | "booking"; id: string };
  return_url: string;
}

export interface LaunchSessionResult {
  url: string;
  expires_at: string;
}

/** Pay for the organizer's own initial offer on your page. A DJ's counteroffer is reviewed in Gelatin. */
export interface PaymentSessionRequest {
  external_event_id: string;
  external_user_id: string;
  resource: { kind: "request"; id: string };
}

/**
 * Mount it in the browser with Stripe.js:
 * `(await loadStripe(publishable_key)).createEmbeddedCheckoutPage({ fetchClientSecret: async () => client_secret })`.
 * The client secret opens only this one checkout; pass it to the organizer's browser and nowhere else.
 */
export interface PaymentSessionResult {
  client_secret: string;
  publishable_key: string;
  /** What the organizer authorizes: DJ fee plus Gelatin's service fee and card processing. */
  total_cents: number;
  currency: string;
}

export interface EventBookingProjection {
  external_event_id: string;
  revision: number;
  bookings: Array<{
    partner_booking_id: string;
    external_booking_id: string;
    requests: Array<{
    external_request_id: string;
    request_id: string;
    dj_id: string;
    status: PartnerBookingStatus;
    offer_revision: number;
    amount: { currency: string; total_cents: number } | null;
    actions: Array<{ kind: "authorize" | "review_terms" | "reauthorize" | "view_booking"; url: string }>;
    }>;
  }>;
}

export type ConditionalEventBookings =
  | { modified: false; etag: string | null }
  | { modified: true; etag: string | null; data: EventBookingProjection };

export type EventChange =
  | { revision: number; kind: "updated"; event: DjRequestSubmission["event"] }
  | { revision: number; kind: "cancelled"; cancelled_at: string; reason?: string };

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
