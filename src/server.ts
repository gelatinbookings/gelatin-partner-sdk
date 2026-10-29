import type {
  AttendanceAggregate,
  AttendanceResult,
  AuthorizationAction,
  BookingActionKind,
  BookingRequest,
  BookingRequestResult,
  CityDirectory,
  CityWaitlistRequest,
  CityWaitlistResult,
  ConditionalEventBookings,
  ConditionalEventLineup,
  DjAlternates,
  DjCatalogPage,
  DjCatalogQuery,
  EventBookings,
  EventChange,
  EventChangeResult,
  EventLineup,
  GenreDirectory,
  GenreQuery,
  LineupStatus,
  PortalLaunchRequest,
  PortalLaunchResult,
  PaymentSessionRequest,
  PaymentSessionResult,
  PartnerBookingStatus,
  PublicDj,
  SubmissionResult,
} from "./types.js";

export type PartnerClientOptions = {
  /** Full partner API base, for example https://api.example/v1/partners/example. */
  baseUrl: string;
  /** Server-only, partner-scoped key. Never pass this client to browser code. */
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  /**
   * Automatic retries for network errors, timeouts, 429 and 503. Every attempt
   * reuses the same idempotency key, so a retried write never happens twice.
   * `maxAttempts: 1` turns retrying off.
   */
  retries?: { maxAttempts?: number; maxDelayMs?: number };
  /** Per-attempt time limit. An attempt that runs over is retried. */
  timeoutMs?: number;
};

export type WriteOptions = { idempotencyKey: string; signal?: AbortSignal };
/** `idempotencyKey` defaults per route; pass one to make your own retries line up. */
export type DefaultedWriteOptions = { idempotencyKey?: string; signal?: AbortSignal };
export type ReadOptions = { signal?: AbortSignal };

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_DELAY_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const BASE_DELAY_MS = 500;

export class PartnerApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message = "Partner API request failed",
    readonly requestId: string | null = null,
    /** Set on `dj_unavailable`: the `external_request_id` whose DJ cannot take the event. */
    readonly externalRequestId: string | null = null,
  ) {
    super(message);
    this.name = "PartnerApiError";
  }

  toJSON() {
    return { status: this.status, code: this.code, message: this.message, requestId: this.requestId, externalRequestId: this.externalRequestId };
  }
}

const STATUSES = new Set<PartnerBookingStatus>([
  "authorization_required", "requested", "negotiating", "reauthorization_required",
  "confirmed", "declined", "expired", "cancelled",
]);
const TIERS = new Set(["verified", "top_performer", "resident", "city_pillar"]);
const ACTIONS = new Set(["authorize", "review_terms", "reauthorize", "view_booking"]);
const LINEUP_STATUSES = new Set<LineupStatus>(["confirmed", "pending"]);

function invalidResponse(): never {
  throw new PartnerApiError(502, "invalid_response", "Partner API returned an invalid response");
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalidResponse();
  return value as Record<string, unknown>;
}

function string(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return invalidResponse();
  return value;
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return invalidResponse();
  return value;
}

function optionalString(value: unknown): string | null {
  return value === null ? null : string(value);
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) return invalidResponse();
  return value;
}

function literal<T extends string>(value: unknown, allowed: Set<T>): T {
  if (typeof value !== "string" || !allowed.has(value as T)) return invalidResponse();
  return value as T;
}

function amount(value: unknown): { currency: string; total_cents: number } {
  const row = object(value);
  return { currency: string(row.currency), total_cents: integer(row.total_cents) };
}

function publicDj(item: unknown): PublicDj {
  const row = object(item);
  const draw = row.draw === null ? null : object(row.draw);
  if (typeof row.available !== "boolean") return invalidResponse();
  return {
    id: string(row.id),
    name: string(row.name),
    city: string(row.city),
    tier: literal(row.tier, TIERS) as PublicDj["tier"],
    profile_url: string(row.profile_url),
    image_url: optionalString(row.image_url),
    // avg is newer than min/max/window, so an API that doesn't send it still parses.
    draw: draw ? { min: integer(draw.min), max: integer(draw.max), avg: draw.avg === undefined ? null : integer(draw.avg), window: string(draw.window) } : null,
    // Additive field: a server that predates it sends none.
    genres: row.genres === undefined ? [] : array(row.genres).map(string).slice(0, 6),
    published_rate_cents: row.published_rate_cents === null ? null : integer(row.published_rate_cents),
    available: row.available,
  };
}

function catalog(value: unknown): DjCatalogPage {
  const body = object(value);
  return { items: array(body.items).map(publicDj), next_cursor: optionalString(body.next_cursor) };
}

function djAlternates(value: unknown): DjAlternates {
  const body = object(value);
  const budget = object(body.budget);
  const event = object(body.event);
  if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return invalidResponse();
  return {
    request_id: string(body.request_id),
    dj_id: string(body.dj_id),
    date: body.date,
    city: optionalString(body.city),
    budget: { currency: string(budget.currency), dj_fee_cents: integer(budget.dj_fee_cents) },
    event: {
      name: string(event.name), venue_name: string(event.venue_name), venue_address: optionalString(event.venue_address),
      starts_at: string(event.starts_at), ends_at: string(event.ends_at), time_zone: string(event.time_zone),
    },
    items: array(body.items).map(publicDj),
  };
}

function cityDirectory(value: unknown): CityDirectory {
  const body = object(value);
  return {
    countries: array(body.countries).map((item) => {
      const country = object(item);
      return {
        code: optionalString(country.code),
        name: string(country.name),
        regions: array(country.regions).map((entry) => {
          const region = object(entry);
          return {
            code: optionalString(region.code),
            name: string(region.name),
            cities: array(region.cities).map((city) => {
              const row = object(city);
              return { name: string(row.name), label: string(row.label), dj_count: integer(row.dj_count) };
            }),
          };
        }),
      };
    }),
  };
}

function cityWaitlistResult(value: unknown): CityWaitlistResult {
  const body = object(value);
  if (body.status !== "subscribed" && body.status !== "already_subscribed") return invalidResponse();
  const city = object(body.city);
  return { status: body.status, city: { name: string(city.name), region: string(city.region), label: string(city.label) } };
}

function genreDirectory(value: unknown): GenreDirectory {
  const body = object(value);
  return {
    genres: array(body.genres).map((item) => {
      const row = object(item);
      return { name: string(row.name), dj_count: integer(row.dj_count) };
    }),
  };
}

function submissionResult(value: unknown): SubmissionResult {
  const body = object(value);
  return {
    submission_id: string(body.submission_id),
    partner_booking_id: string(body.partner_booking_id),
    requests: array(body.requests).map((item) => {
      const row = object(item);
      const action = object(row.authorization);
      const kind = literal(action.kind, new Set<AuthorizationAction["kind"]>(["portal", "in_flow"]));
      return {
        request_id: string(row.request_id),
        dj_id: string(row.dj_id),
        status: literal(row.status, new Set(["authorization_required"])),
        offer_revision: integer(row.offer_revision),
        amount: amount(row.amount),
        authorization: kind === "portal"
          ? { kind, url: string(action.url), expires_at: string(action.expires_at) }
          : { kind, bootstrap_url: string(action.bootstrap_url), expires_at: string(action.expires_at) },
        portal_url: string(row.portal_url),
      };
    }),
  };
}

function bookingRequestResult(value: unknown): BookingRequestResult {
  const body = object(value);
  return {
    group_id: string(body.group_id),
    event_id: string(body.event_id),
    engagements: array(body.engagements).map((item) => {
      const row = object(item);
      return {
        id: string(row.id),
        external_request_id: string(row.external_request_id),
        dj_id: string(row.dj_id),
        request_id: string(row.request_id),
        booking_id: string(row.booking_id),
        offer_id: string(row.offer_id),
        revision: integer(row.revision),
        total_cents: integer(row.total_cents),
        currency: string(row.currency),
      };
    }),
  };
}

function launchResult(value: unknown): PortalLaunchResult {
  const body = object(value);
  return { url: string(body.url), expires_at: string(body.expires_at) };
}

function paymentSessionResult(value: unknown): PaymentSessionResult {
  const body = object(value);
  return {
    client_secret: string(body.client_secret),
    publishable_key: string(body.publishable_key),
    total_cents: integer(body.total_cents),
    currency: string(body.currency),
  };
}

function eventBookings(value: unknown): EventBookings {
  const body = object(value);
  return {
    external_event_id: string(body.external_event_id),
    revision: integer(body.revision),
    bookings: array(body.bookings).map((booking) => {
      const group = object(booking);
      return {
        partner_booking_id: string(group.partner_booking_id),
        external_booking_id: string(group.external_booking_id),
        requests: array(group.requests).map((item) => {
          const row = object(item);
          return {
            external_request_id: string(row.external_request_id),
            request_id: string(row.request_id),
            dj_id: string(row.dj_id),
            status: literal(row.status, STATUSES),
            offer_revision: integer(row.offer_revision),
            // Absent from older servers: treat missing as settled (null).
            pending_party: row.pending_party === "organizer" || row.pending_party === "dj" ? row.pending_party : null,
            amount: row.amount === null ? null : amount(row.amount),
            actions: array(row.actions).map((item) => {
              const action = object(item);
              return { kind: literal(action.kind, ACTIONS) as BookingActionKind, url: string(action.url) };
            }),
          };
        }),
      };
    }),
  };
}

function eventLineup(value: unknown): EventLineup {
  const body = object(value);
  return {
    external_event_id: string(body.external_event_id),
    entries: array(body.entries).map((item) => {
      const row = object(item);
      return {
        dj_id: string(row.dj_id),
        name: string(row.name),
        status: literal(row.status, LINEUP_STATUSES),
        profile_url: string(row.profile_url),
        image_url: optionalString(row.image_url),
      };
    }),
  };
}

function eventChangeResult(value: unknown): EventChangeResult {
  const body = object(value);
  return {
    external_event_id: string(body.external_event_id),
    revision: integer(body.revision),
    status: literal(body.status, new Set(["updated", "cancelled"])),
  };
}

function attendanceResult(value: unknown): AttendanceResult {
  const body = object(value);
  if (body.recorded !== true) return invalidResponse();
  return {
    external_event_id: string(body.external_event_id),
    recorded: true,
  };
}

function baseUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new TypeError("A valid partner API base URL is required"); }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new TypeError("Partner API base URL must use HTTPS outside loopback development");
  }
  if (url.username || url.password || url.search || url.hash) throw new TypeError("Partner API base URL cannot include credentials, query, or fragment");
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
}

function writeKey(value: string): string {
  if (!value || !value.trim() || value.length > 255 || /[\r\n]/.test(value)) {
    throw new TypeError("A stable idempotency key is required for partner writes");
  }
  return value;
}

/**
 * Build a stable idempotency key from IDs you already store, for example
 * `idempotencyKeyFor(eventId, "cancel", revision)`. Each part is escaped, so
 * parts that contain `:` cannot collide.
 */
export function idempotencyKeyFor(...parts: string[]): string {
  if (parts.length === 0) throw new TypeError("At least one stable ID is required for an idempotency key");
  for (const part of parts) {
    if (typeof part !== "string" || !part.trim() || /[\r\n]/.test(part)) {
      throw new TypeError("Idempotency key parts must be non-blank strings without line breaks");
    }
  }
  const key = parts.map((part) => encodeURIComponent(part)).join(":");
  if (key.length > 255) throw new TypeError("An idempotency key cannot exceed 255 characters");
  return key;
}

function randomKey(): string {
  const generate = globalThis.crypto?.randomUUID;
  if (typeof generate !== "function") throw new TypeError("crypto.randomUUID is unavailable; pass an idempotencyKey");
  return generate.call(globalThis.crypto);
}

function retryAfterMs(response: Response): number | null {
  const value = response.headers.get("Retry-After");
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    function onAbort() { clearTimeout(timer); reject(signal!.reason); }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function externalId(value: string): string {
  if (!value || !value.trim()) throw new TypeError("An external event ID is required");
  return encodeURIComponent(value);
}

/** A thin, server-only HTTP wrapper. The documented HTTP API is authoritative. */
export function createPartnerClient(options: PartnerClientOptions) {
  if (typeof window !== "undefined") {
    throw new TypeError("The credentialed partner client is server-only");
  }
  const root = baseUrl(options.baseUrl);
  if (!options.apiKey || !options.apiKey.trim() || /[\r\n]/.test(options.apiKey)) throw new TypeError("A server-side partner API key is required");
  const fetcher = options.fetch ?? globalThis.fetch;
  if (!fetcher) throw new TypeError("A fetch implementation is required");
  const maxAttempts = options.retries?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const maxDelayMs = options.retries?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) throw new TypeError("retries.maxAttempts must be a positive integer");
  if (!Number.isFinite(maxDelayMs) || maxDelayMs < 0) throw new TypeError("retries.maxDelayMs must be a non-negative number");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError("timeoutMs must be a positive number");

  async function request(path: string, method: "GET" | "POST" | "PATCH", input?: unknown, settings?: {
    idempotencyKey?: string;
    ifNoneMatch?: string;
    signal?: AbortSignal;
  }): Promise<Response> {
    const headers = new Headers({ Authorization: `Bearer ${options.apiKey}`, Accept: "application/json" });
    if (input !== undefined) headers.set("Content-Type", "application/json");
    if (method !== "GET") headers.set("Idempotency-Key", writeKey(settings?.idempotencyKey ?? ""));
    if (settings?.ifNoneMatch) headers.set("If-None-Match", settings.ifNoneMatch);
    const url = new URL(path, root).toString();
    const body = input === undefined ? undefined : JSON.stringify(input);
    const signal = settings?.signal;

    for (let attempt = 1; ; attempt += 1) {
      if (signal?.aborted) throw signal.reason;
      const attemptController = new AbortController();
      const onAbort = () => attemptController.abort(signal!.reason);
      signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => attemptController.abort(new DOMException("Partner API attempt timed out", "TimeoutError")), timeoutMs);
      let response: Response | null = null;
      let failure: unknown = null;
      try {
        response = await fetcher(url, {
          method,
          headers,
          ...(body === undefined ? {} : { body }),
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
          signal: attemptController.signal,
        });
      } catch (error) {
        failure = error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
      // A caller abort ends the request; it is never retried.
      if (signal?.aborted) throw signal.reason;
      const retryable = response === null || response.status === 429 || response.status === 503;
      if (retryable && attempt < maxAttempts) {
        const hinted = response ? retryAfterMs(response) : null;
        const delay = hinted !== null
          ? Math.min(hinted, maxDelayMs)
          : Math.random() * Math.min(maxDelayMs, BASE_DELAY_MS * 2 ** (attempt - 1));
        await response?.body?.cancel().catch(() => undefined);
        await sleep(delay, signal);
        continue;
      }
      if (response === null) throw failure;
      return await settle(response);
    }
  }

  async function settle(response: Response): Promise<Response> {
    if (!response.ok && response.status !== 304) {
      let code = "http_error";
      let requestId = response.headers.get("X-Request-Id");
      let externalRequestId: string | null = null;
      try {
        const payload = object(await response.json());
        const error = object(payload.error);
        if (typeof error.code === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(error.code)) code = error.code;
        if (!requestId && typeof error.request_id === "string") requestId = error.request_id;
        if (typeof error.external_request_id === "string" && error.external_request_id.length > 0 && error.external_request_id.length <= 200) {
          externalRequestId = error.external_request_id;
        }
      } catch { /* Do not expose untrusted response bodies. */ }
      throw new PartnerApiError(response.status, code, "Partner API request failed", requestId, externalRequestId);
    }
    return response;
  }

  async function json<T>(response: Response, parse: (input: unknown) => T): Promise<T> {
    let value: unknown;
    try { value = await response.json(); } catch { return invalidResponse(); }
    return parse(value);
  }

  return {
    async listDjs(query: DjCatalogQuery = {}, options: ReadOptions = {}): Promise<DjCatalogPage> {
      const params = new URLSearchParams();
      if (query.city) params.set("city", query.city);
      if (query.genre) params.set("genre", query.genre);
      if (query.date) params.set("date", query.date);
      // Gelatin checks the band keys and answers 400 invalid_query for an unknown one.
      if (query.budget?.length) params.set("budget", [...new Set(query.budget)].join(","));
      if (query.cursor) params.set("cursor", query.cursor);
      if (query.limit !== undefined) params.set("limit", String(query.limit));
      const path = `djs${params.size ? `?${params}` : ""}`;
      return json(await request(path, "GET", undefined, options), catalog);
    },
    /**
     * Mounted route. Every US state with its major cities (`US_MAJOR_CITIES`
     * from `@gelatinbookings/partner-sdk/places`), plus any other city your
     * catalog has a DJ in, each with your DJ count. Pass a city's `label` to
     * `listDjs`; narrow the list with `filterCityDirectory`.
     */
    async listCities(options: ReadOptions = {}): Promise<CityDirectory> {
      return json(await request("cities", "GET", undefined, options), cityDirectory);
    },
    /**
     * Mounted route. When an organizer picks a city with `dj_count: 0`, offer
     * to tell them when DJs arrive and send their email here once they say
     * yes. A repeat for the same email and city answers `already_subscribed`.
     * Gelatin never returns the email or anyone else's sign-up. Needs the
     * `requests:write` scope and counts against your write quota.
     */
    async joinCityWaitlist(input: CityWaitlistRequest, options: DefaultedWriteOptions = {}): Promise<CityWaitlistResult> {
      const idempotencyKey = options.idempotencyKey ?? randomKey();
      return json(await request("city-waitlist", "POST", input, { ...options, idempotencyKey }), cityWaitlistResult);
    },
    /**
     * Mounted route. The genres your catalog's DJs list, each with its DJ
     * count, busiest first. With `city`, only DJs `listDjs({ city })` returns
     * are counted, so every genre listed finds at least one DJ there. Pass a
     * genre's `name` to `listDjs({ genre })`.
     */
    async listGenres(query: GenreQuery = {}, options: ReadOptions = {}): Promise<GenreDirectory> {
      const params = new URLSearchParams();
      if (query.city) params.set("city", query.city);
      if (query.budget?.length) params.set("budget", [...new Set(query.budget)].join(","));
      return json(await request(`genres${params.size ? `?${params}` : ""}`, "GET", undefined, options), genreDirectory);
    },
    /**
     * Mounted route. Use `partner_event_flow` placement when your page takes the
     * first card hold (`createPaymentSession`), or `gelatin_portal_handoff` to
     * send the organizer to Gelatin. The key defaults to
     * `booking:<external_booking_id>`: Gelatin accepts each external booking ID
     * once, so a resend returns the original result.
     */
    async submitBookingRequests(input: BookingRequest, options: DefaultedWriteOptions = {}): Promise<BookingRequestResult> {
      const idempotencyKey = options.idempotencyKey ?? `booking:${input.external_booking_id}`;
      return json(await request("booking-requests", "POST", input, { ...options, idempotencyKey }), bookingRequestResult);
    },
    /**
     * Mounted route. Redirect the organizer to the returned one-use URL
     * immediately; never log it. The key defaults to a fresh UUID per call, so
     * each click gets a new link; built-in retries reuse it.
     */
    async createPortalLaunch(input: PortalLaunchRequest, options: DefaultedWriteOptions = {}): Promise<PortalLaunchResult> {
      const idempotencyKey = options.idempotencyKey ?? randomKey();
      return json(await request("portal-launches", "POST", input, { ...options, idempotencyKey }), launchResult);
    },
    /**
     * Mounted route. Starts, or resumes, the card hold for the organizer's
     * initial offer as an embedded Stripe checkout your page mounts. The key
     * defaults to a fresh UUID per call: Gelatin resumes the same open hold
     * whichever key asks. A DJ's counteroffer answers `409 portal_required`;
     * create a portal launch instead.
     */
    async createPaymentSession(input: PaymentSessionRequest, options: DefaultedWriteOptions = {}): Promise<PaymentSessionResult> {
      const idempotencyKey = options.idempotencyKey ?? randomKey();
      return json(await request("payment-sessions", "POST", input, { ...options, idempotencyKey }), paymentSessionResult);
    },
    /** Proposed alpha route; not mounted. Use `submitBookingRequests`. */
    async submitDjRequests(input: BookingRequest, options: WriteOptions): Promise<SubmissionResult> {
      return json(await request("dj-request-submissions", "POST", input, options), submissionResult);
    },
    /** Proposed alpha route; not mounted. Use `createPortalLaunch`. */
    async createLaunchSession(input: PortalLaunchRequest, options: WriteOptions): Promise<PortalLaunchResult> {
      return json(await request("launch-sessions", "POST", input, options), launchResult);
    },
    async getEventBookings(eventId: string, options: ReadOptions & { ifNoneMatch?: string } = {}): Promise<ConditionalEventBookings> {
      const response = await request(`events/${externalId(eventId)}/dj-bookings`, "GET", undefined, options);
      const etag = response.headers.get("ETag");
      if (response.status === 304) return { modified: false, etag };
      return { modified: true, etag, data: await json(response, eventBookings) };
    },
    /**
     * Mounted route. After a request is lost (`declined`, `expired` or
     * `cancelled`), who else is open that night in that city at about that
     * budget, with the event details to prefill a new request. A live request
     * answers `409 request_active`. Reading this books and holds nothing.
     */
    async listAlternates(eventId: string, requestId: string, options: ReadOptions = {}): Promise<DjAlternates> {
      return json(await request(`events/${externalId(eventId)}/dj-bookings/${encodeURIComponent(requestId)}/alternates`, "GET", undefined, options), djAlternates);
    },
    /**
     * Mounted route. Confirmed DJs only, unless `includePending` adds offers
     * the DJ is still answering (for a "TBA" slot). Display data only.
     */
    async getEventLineup(eventId: string, options: ReadOptions & { ifNoneMatch?: string; includePending?: boolean } = {}): Promise<ConditionalEventLineup> {
      const { includePending, ...settings } = options;
      const response = await request(`events/${externalId(eventId)}/lineup${includePending ? "?include=pending" : ""}`, "GET", undefined, settings);
      const etag = response.headers.get("ETag");
      if (response.status === 304) return { modified: false, etag };
      return { modified: true, etag, data: await json(response, eventLineup) };
    },
    async updateEvent(eventId: string, change: EventChange, options: WriteOptions): Promise<EventChangeResult> {
      if (!Number.isSafeInteger(change.revision) || change.revision < 1) throw new TypeError("A positive event revision is required");
      return json(await request(`events/${externalId(eventId)}`, "PATCH", change, options), eventChangeResult);
    },
    async recordAttendance(eventId: string, aggregate: AttendanceAggregate, options: WriteOptions): Promise<AttendanceResult> {
      if (!Number.isSafeInteger(aggregate.count) || aggregate.count < 0) throw new TypeError("Attendance count must be a non-negative integer");
      return json(await request(`events/${externalId(eventId)}/attendance`, "POST", aggregate, options), attendanceResult);
    },
  };
}
