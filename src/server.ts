import type {
  AttendanceAggregate,
  AttendanceResult,
  AuthorizationAction,
  BookingActionKind,
  BookingRequest,
  BookingRequestResult,
  ConditionalEventBookings,
  DjCatalogPage,
  DjCatalogQuery,
  EventBookings,
  EventChange,
  EventChangeResult,
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

function catalog(value: unknown): DjCatalogPage {
  const body = object(value);
  return {
    items: array(body.items).map((item): PublicDj => {
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
        draw: draw ? { min: integer(draw.min), max: integer(draw.max), window: string(draw.window) } : null,
        published_rate_cents: row.published_rate_cents === null ? null : integer(row.published_rate_cents),
        available: row.available,
      };
    }),
    next_cursor: optionalString(body.next_cursor),
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
      if (query.date) params.set("date", query.date);
      if (query.cursor) params.set("cursor", query.cursor);
      if (query.limit !== undefined) params.set("limit", String(query.limit));
      const path = `djs${params.size ? `?${params}` : ""}`;
      return json(await request(path, "GET", undefined, options), catalog);
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
