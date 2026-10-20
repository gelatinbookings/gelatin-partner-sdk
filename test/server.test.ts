import { describe, expect, it, vi } from "vitest";
import { createPartnerClient, PartnerApiError } from "../src/server.js";
import type { DjRequestSubmission } from "../src/types.js";

const submission: DjRequestSubmission = {
  external_event_id: "event_123",
  external_submission_id: "submission_123",
  external_booking_id: "booking_123",
  organizer: {
    external_user_id: "user_789",
    email: "organizer@example.test",
    display_name: "Taylor Smith",
  },
  event: {
    name: "Friday Night",
    starts_at: "2026-11-14T21:00:00-05:00",
    ends_at: "2026-11-14T23:00:00-05:00",
    time_zone: "America/New_York",
    venue_name: "Example Room",
  },
  requests: [{
    external_request_id: "request_001",
    dj_id: "dj_456",
    initial_offer: { currency: "usd", dj_fee_cents: 50_000, note: "Two-hour set" },
  }],
  authorization_placement: "gelatin_portal_handoff",
  return_url: "https://acme.example/events/event_123",
};

function mockFetch(response: Response) {
  return vi.fn(async () => response) as unknown as typeof fetch;
}

describe("partner server client", () => {
  it("keeps the partner credential in the Authorization header on a scoped catalog read", async () => {
    const fetcher = mockFetch(Response.json({
      items: [{ id: "dj_456", name: "KOYO", city: "Atlanta", tier: "verified", profile_url: "https://gelatin.example/djs/koyo", image_url: null, draw: null, published_rate_cents: null, available: true, private_email: "dj@example.test" }],
      next_cursor: null,
    }));
    const client = createPartnerClient({
      baseUrl: "https://api.gelatin.example/v1/partners/acme",
      apiKey: "gel_test_private",
      fetch: fetcher,
    });

    const result = await client.listDjs({ city: "Atlanta", date: "2026-11-14" });

    expect(result.items[0]?.name).toBe("KOYO");
    expect(JSON.stringify(result)).not.toContain("private_email");
    expect(JSON.stringify(result)).not.toContain("dj@example.test");
    const [url, init] = vi.mocked(fetcher).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.gelatin.example/v1/partners/acme/djs?city=Atlanta&date=2026-11-14");
    expect(url).not.toContain("gel_test_private");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer gel_test_private");
    expect(init.credentials).toBe("omit");
  });

  it("requires a stable caller-owned idempotency key for submissions and sends one request", async () => {
    const fetcher = mockFetch(Response.json({
      submission_id: "sub_1",
      partner_booking_id: "pbk_1",
      requests: [{
        request_id: "req_1",
        dj_id: "dj_456",
        status: "authorization_required",
        offer_revision: 1,
        amount: { currency: "usd", total_cents: 56_500 },
        authorization: { kind: "portal", url: "https://bookings.acme.example/launch/opaque", expires_at: "2026-10-12T13:00:00Z" },
        portal_url: "https://bookings.acme.example/requests/req_1",
      }],
    }));
    const client = createPartnerClient({ baseUrl: "https://api.gelatin.example/v1/partners/acme", apiKey: "gel_test_private", fetch: fetcher });

    const result = await client.submitDjRequests(submission, { idempotencyKey: "event_123:request_001:v1" });

    expect(result.partner_booking_id).toBe("pbk_1");
    expect(result.requests[0]?.amount.total_cents).toBe(56_500);
    const [, init] = vi.mocked(fetcher).mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe("event_123:request_001:v1");
    expect(JSON.parse(String(init.body))).toEqual(submission);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refuses a write without an idempotency key before any network call", async () => {
    const fetcher = mockFetch(Response.json({}));
    const client = createPartnerClient({ baseUrl: "https://api.gelatin.example/v1/partners/acme", apiKey: "gel_test_private", fetch: fetcher });

    await expect(client.submitDjRequests(submission, { idempotencyKey: " " })).rejects.toThrow("idempotency key");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns an ETag and recognizes an unchanged status without treating it as an error", async () => {
    const fetcher = mockFetch(new Response(null, { status: 304, headers: { ETag: '"rev-4"' } }));
    const client = createPartnerClient({ baseUrl: "https://api.gelatin.example/v1/partners/acme", apiKey: "gel_test_private", fetch: fetcher });

    const result = await client.getEventBookings("event_123", { ifNoneMatch: '"rev-4"' });

    expect(result).toEqual({ modified: false, etag: '"rev-4"' });
    const [url, init] = vi.mocked(fetcher).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/events/event_123/dj-bookings");
    expect(new Headers(init.headers).get("If-None-Match")).toBe('"rev-4"');
  });

  it("returns only approved fields from a current status projection", async () => {
    const fetcher = mockFetch(Response.json({
      external_event_id: "event_123",
      revision: 5,
      organizer_email: "private@example.test",
      bookings: [{
        partner_booking_id: "pbk_1",
        external_booking_id: "booking_123",
        requests: [
          {
            external_request_id: "request_001",
            request_id: "req_1",
            dj_id: "dj_456",
            status: "negotiating",
            offer_revision: 2,
            amount: { currency: "usd", total_cents: 56_500 },
            actions: [{ kind: "review_terms", url: "https://bookings.example.test/requests/req_1" }],
            private_payout_cents: 42_000,
          },
          {
            external_request_id: "request_002",
            request_id: "req_2",
            dj_id: "dj_789",
            status: "confirmed",
            offer_revision: 1,
            amount: { currency: "usd", total_cents: 75_700 },
            actions: [{ kind: "view_booking", url: "https://bookings.example.test/requests/req_2" }],
          },
        ],
      }],
    }, { headers: { ETag: '"rev-5"' } }));
    const client = createPartnerClient({ baseUrl: "https://api.gelatin.example/v1/partners/acme", apiKey: "gel_test_private", fetch: fetcher });

    const result = await client.getEventBookings("event_123");

    expect(result).toMatchObject({ modified: true, etag: '"rev-5"', data: { revision: 5, bookings: [{ partner_booking_id: "pbk_1", requests: [{ status: "negotiating" }, { status: "confirmed" }] }] } });
    expect(JSON.stringify(result)).not.toContain("private@example.test");
    expect(JSON.stringify(result)).not.toContain("private_payout_cents");
  });

  it("rejects an invalid status projection instead of trusting a TypeScript cast", async () => {
    const fetcher = mockFetch(Response.json({ revision: 5, requests: [{ status: "paid", organizer_email: "private@example.test" }] }));
    const client = createPartnerClient({ baseUrl: "https://api.gelatin.example/v1/partners/acme", apiKey: "gel_test_private", fetch: fetcher });

    await expect(client.getEventBookings("event_123")).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("preserves a narrow API error without including a raw response or credential", async () => {
    const fetcher = mockFetch(Response.json({ error: { code: "forbidden_scope", message: "This key cannot read the catalog", request_id: "trace_1" }, debug_token: "secret" }, { status: 403 }));
    const client = createPartnerClient({ baseUrl: "https://api.gelatin.example/v1/partners/acme", apiKey: "gel_test_private", fetch: fetcher });

    let thrown: unknown;
    try { await client.listDjs({ city: "Atlanta" }); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(PartnerApiError);
    expect(thrown).toMatchObject({ status: 403, code: "forbidden_scope", requestId: "trace_1" });
    expect(JSON.stringify(thrown)).not.toContain("secret");
    expect(JSON.stringify(thrown)).not.toContain("gel_test_private");
  });

  it("names the request whose DJ is unavailable so the partner can offer another DJ", async () => {
    const fetcher = mockFetch(Response.json({ error: { code: "dj_unavailable", message: "A selected DJ is not available for this event.", request_id: "trace_2", external_request_id: "request_002" } }, { status: 409 }));
    const client = createPartnerClient({ baseUrl: "https://api.gelatin.example/v1/partners/acme", apiKey: "gel_test_private", fetch: fetcher });

    let thrown: unknown;
    try { await client.listDjs({ city: "Atlanta" }); } catch (error) { thrown = error; }
    expect(thrown).toMatchObject({ status: 409, code: "dj_unavailable", requestId: "trace_2", externalRequestId: "request_002" });
    expect((thrown as PartnerApiError).toJSON()).toMatchObject({ externalRequestId: "request_002" });
  });

  it("drops a malformed external request reference from an error", async () => {
    const fetcher = mockFetch(Response.json({ error: { code: "dj_unavailable", message: "x", external_request_id: "x".repeat(201) } }, { status: 409 }));
    const client = createPartnerClient({ baseUrl: "https://api.gelatin.example/v1/partners/acme", apiKey: "gel_test_private", fetch: fetcher });

    await expect(client.listDjs({ city: "Atlanta" })).rejects.toMatchObject({ code: "dj_unavailable", externalRequestId: null });
  });

  it("requires HTTPS except for loopback development", () => {
    expect(() => createPartnerClient({ baseUrl: "http://api.gelatin.example/v1/partners/acme", apiKey: "gel_test_private" })).toThrow("HTTPS");
    expect(() => createPartnerClient({ baseUrl: "http://127.0.0.1:3000/v1/partners/acme", apiKey: "gel_test_private" })).not.toThrow();
  });

  it("keeps launch, event-change and attendance writes on the scoped server client", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ url: "https://bookings.example.test/launch/opaque", expires_at: "2026-10-12T18:00:00Z" }))
      .mockResolvedValueOnce(Response.json({ external_event_id: "event_123", revision: 2, status: "updated" }))
      .mockResolvedValueOnce(Response.json({ external_event_id: "event_123", recorded: true }));
    const client = createPartnerClient({ baseUrl: "https://api.gelatin.example/v1/partners/acme", apiKey: "gel_test_private", fetch: fetcher });

    await client.createLaunchSession({ external_event_id: "event_123", external_user_id: "user_789", resource: { kind: "request", id: "req_1" }, return_url: "https://acme.example/events/event_123" }, { idempotencyKey: "launch-1" });
    await client.updateEvent("event_123", { revision: 2, kind: "updated", event: submission.event }, { idempotencyKey: "change-2" });
    await client.recordAttendance("event_123", { count: 186, source: "door", recorded_at: "2026-11-15T02:00:00Z" }, { idempotencyKey: "attendance-1" });

    expect(fetcher.mock.calls.map(([url]: [string]) => new URL(url).pathname)).toEqual([
      "/v1/partners/acme/launch-sessions",
      "/v1/partners/acme/events/event_123",
      "/v1/partners/acme/events/event_123/attendance",
    ]);
    expect(fetcher.mock.calls.map(([, init]: [string, RequestInit]) => new Headers(init.headers).get("Idempotency-Key"))).toEqual(["launch-1", "change-2", "attendance-1"]);
  });

  it("refuses to construct a credentialed server client in a browser context", () => {
    vi.stubGlobal("window", {});
    try {
      expect(() => createPartnerClient({ baseUrl: "https://api.gelatin.example/v1/partners/acme", apiKey: "gel_test_private" })).toThrow("server-only");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("submits a booking to the mounted route and returns only the documented engagement fields", async () => {
    const engagement = {
      id: "11111111-1111-4111-8111-111111111111", external_request_id: "request_001",
      dj_id: "22222222-2222-4222-8222-222222222222", request_id: "33333333-3333-4333-8333-333333333333",
      booking_id: "44444444-4444-4444-8444-444444444444", offer_id: "55555555-5555-4555-8555-555555555555",
      revision: 1, total_cents: 54_200, currency: "usd",
    };
    const fetcher = mockFetch(Response.json({
      group_id: "66666666-6666-4666-8666-666666666666", event_id: "77777777-7777-4777-8777-777777777777",
      engagements: [{ ...engagement, booker_id: "internal-booker", payout_cents: 50_000 }],
      internal_note: "never surfaced",
    }, { status: 201 }));
    const client = createPartnerClient({ baseUrl: "https://api.gelatin.example/v1/partners/acme", apiKey: "gel_test_private", fetch: fetcher });

    const result = await client.submitBookingRequests(submission, { idempotencyKey: "booking-intent-1" });

    expect(result).toEqual({ group_id: "66666666-6666-4666-8666-666666666666", event_id: "77777777-7777-4777-8777-777777777777", engagements: [engagement] });
    const [url, init] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/v1/partners/acme/booking-requests");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe("booking-intent-1");
    expect(JSON.parse(String(init.body))).toEqual(submission);
  });

  it("rejects a malformed booking response instead of trusting a cast", async () => {
    const client = createPartnerClient({
      baseUrl: "https://api.gelatin.example/v1/partners/acme", apiKey: "gel_test_private",
      fetch: mockFetch(Response.json({ group_id: "g", event_id: "e", engagements: [{ id: "x", total_cents: -1 }] }, { status: 201 })),
    });
    await expect(client.submitBookingRequests(submission, { idempotencyKey: "booking-intent-2" })).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("refuses a booking submission or portal launch without an idempotency key before any network call", async () => {
    const fetcher = vi.fn();
    const client = createPartnerClient({ baseUrl: "https://api.gelatin.example/v1/partners/acme", apiKey: "gel_test_private", fetch: fetcher });
    await expect(client.submitBookingRequests(submission, { idempotencyKey: " " })).rejects.toThrow("idempotency");
    await expect(client.createPortalLaunch({ external_event_id: "event_123", external_user_id: "user_789", resource: { kind: "request", id: "req_1" }, return_url: "https://acme.example/events/event_123" }, { idempotencyKey: "" })).rejects.toThrow("idempotency");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("creates a payment session for the page to mount, under a fresh key per call", async () => {
    const body = { client_secret: "cs_test_a1_secret_b2", publishable_key: "pk_test_c3", total_cents: 11051, currency: "usd" };
    const fetcher = vi.fn(async () => Response.json(body, { status: 201 })) as unknown as typeof fetch;
    const client = createPartnerClient({ baseUrl: "https://api.gelatin.example/v1/partners/memberly", apiKey: "gel_test_private", fetch: fetcher });
    const input = { external_event_id: "event_123", external_user_id: "user_789", resource: { kind: "request" as const, id: "33333333-3333-4333-8333-333333333333" } };

    expect(await client.createPaymentSession(input)).toEqual(body);
    await client.createPaymentSession(input);

    const calls = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit]>;
    expect(new URL(calls[0][0]).pathname).toBe("/v1/partners/memberly/payment-sessions");
    expect(JSON.parse(String(calls[0][1].body))).toEqual(input);
    const keys = calls.map(([, init]) => new Headers(init.headers).get("Idempotency-Key"));
    expect(keys[0]).toBeTruthy();
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("rejects a payment session answer that isn't a client secret and publishable key", async () => {
    const client = createPartnerClient({
      baseUrl: "https://api.gelatin.example/v1/partners/memberly", apiKey: "gel_test_private",
      fetch: mockFetch(Response.json({ client_secret: "cs_test_a1_secret_b2", total_cents: 11051, currency: "usd" }, { status: 201 })),
    });
    await expect(client.createPaymentSession({ external_event_id: "e", external_user_id: "u", resource: { kind: "request", id: "33333333-3333-4333-8333-333333333333" } })).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("creates a portal launch on the mounted route", async () => {
    const fetcher = mockFetch(Response.json({ url: "https://book.acme.example/partner/launch#token=opaque", expires_at: "2026-10-12T18:00:00Z" }, { status: 201 }));
    const client = createPartnerClient({ baseUrl: "https://api.gelatin.example/v1/partners/acme", apiKey: "gel_test_private", fetch: fetcher });
    const input = { external_event_id: "event_123", external_user_id: "user_789", resource: { kind: "request" as const, id: "33333333-3333-4333-8333-333333333333" }, return_url: "https://acme.example/events/event_123" };

    const result = await client.createPortalLaunch(input, { idempotencyKey: "launch-2" });

    expect(result).toEqual({ url: "https://book.acme.example/partner/launch#token=opaque", expires_at: "2026-10-12T18:00:00Z" });
    const [url, init] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/v1/partners/acme/portal-launches");
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe("launch-2");
    expect(JSON.parse(String(init.body))).toEqual(input);
  });
});

