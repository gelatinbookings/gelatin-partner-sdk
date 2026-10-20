import { describe, expect, it, vi } from "vitest";
import { PartnerApiError } from "@gelatinbookings/partner-sdk/server";
import { readDemoConfig, type DemoConfig } from "./config";
import { cookieNames, hasValidSession, issueSession, readBookings, readCookie, writeBookings, type DemoBooking } from "./cookies";
import { approvedLaunchUrl, type GelatinClient } from "./gelatin";
import { createBookingPost, createLaunchPost, createLoginPost, createLogoutPost, memoryLoginLimiter, type HandlerDeps } from "./handlers";

const config: DemoConfig = readDemoConfig({
  GELATIN_API_BASE_URL: "https://staging.gelatinbookings.com",
  GELATIN_PARTNER_SLUG: "gelatin-demo",
  GELATIN_PARTNER_KEY: "gel_test_abcdefghijklmnopqrstuvwxyz",
  DEMO_ACCESS_PASSWORD: "correct horse battery",
  DEMO_SESSION_SECRET: "s".repeat(48),
  DEMO_PUBLIC_ORIGIN: "https://partner-demo.staging.gelatinbookings.com",
  GELATIN_PORTAL_ORIGINS: "https://book-demo.staging.gelatinbookings.com",
});
const ORIGIN = config.publicOrigin;
const names = cookieNames(config);
const token = "A".repeat(43);
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const DJ_ID = "22222222-2222-4222-8222-222222222222";

function cookieValue(setCookie: string) {
  return setCookie.split(";")[0];
}

function sessionCookie() {
  return cookieValue(issueSession(config));
}

const booking: DemoBooking = {
  eventId: "demo-evt-1", eventName: "Community Friday", createdAt: "2030-01-01T00:00:00.000Z",
  organizerId: "demo-organizer-abc", engagements: [{ requestId: REQUEST_ID, djName: "DJ One", totalCents: 54_200, currency: "usd" }],
};

function deps(client: Partial<GelatinClient> = {}, overrides: Partial<HandlerDeps> = {}): HandlerDeps {
  return { config: () => config, client: () => client as GelatinClient, allowLogin: () => true, ...overrides };
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const form = {
  nonce: "0b6f8f4e-8a43-4b8a-9d55-5c5f1c1e2a10", event_name: "Community Friday", venue_name: "The Loft",
  date: "2030-11-15", start_time: "21:00", end_time: "23:30", time_zone: "America/New_York",
  organizer_email: "organizer@example.test", organizer_name: "Taylor",
  djs: [{ id: DJ_ID, name: "DJ One", fee_dollars: 450 }],
};

describe("demo access", () => {
  it("signs in with the shared password and sets an HttpOnly, host-only Secure session", async () => {
    const body = new URLSearchParams({ password: "correct horse battery" });
    const response = await createLoginPost(deps())(new Request(`${ORIGIN}/api/login`, { method: "POST", headers: { origin: ORIGIN }, body }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^__Host-partner_demo_session=/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Domain");
    expect(hasValidSession(config, readCookie(cookieValue(cookie), names.session))).toBe(true);
  });

  it("refuses a wrong password, a cross-site post and a caller over its attempt limit", async () => {
    const wrong = await createLoginPost(deps())(new Request(`${ORIGIN}/api/login`, { method: "POST", headers: { origin: ORIGIN }, body: new URLSearchParams({ password: "nope" }) }));
    expect(wrong.headers.get("location")).toBe("/login?error=1");
    expect(wrong.headers.get("set-cookie")).toBeNull();
    const crossSite = await createLoginPost(deps())(new Request(`${ORIGIN}/api/login`, { method: "POST", headers: { origin: "https://evil.example" }, body: new URLSearchParams({ password: "correct horse battery" }) }));
    expect(crossSite.status).toBe(403);
    const limited = await createLoginPost(deps({}, { allowLogin: () => false }))(new Request(`${ORIGIN}/api/login`, { method: "POST", headers: { origin: ORIGIN }, body: new URLSearchParams({ password: "correct horse battery" }) }));
    expect(limited.headers.get("location")).toBe("/login?error=limit");
    expect(limited.headers.get("set-cookie")).toBeNull();
  });

  it("rejects tampered, foreign-secret and expired sessions", () => {
    const value = readCookie(sessionCookie(), names.session) ?? "";
    expect(hasValidSession(config, `${value.slice(0, -2)}xx`)).toBe(false);
    const other = { ...config, sessionSecret: "o".repeat(48) };
    expect(hasValidSession(other, value)).toBe(false);
    expect(hasValidSession(config, value, Date.now() + 13 * 3600_000)).toBe(false);
  });

  it("limits login attempts per caller within the window", () => {
    let now = 0;
    const allow = memoryLoginLimiter(2, 1000, () => now);
    expect([allow("a"), allow("a"), allow("a"), allow("b")]).toEqual([true, true, false, true]);
    now = 1001;
    expect(allow("a")).toBe(true);
  });

  it("signs out by clearing both cookies", async () => {
    const response = await createLogoutPost(deps())(new Request(`${ORIGIN}/api/logout`, { method: "POST", headers: { origin: ORIGIN } }));
    expect(response.headers.get("location")).toBe("/login");
    expect(response.headers.getSetCookie().every((cookie) => cookie.includes("Max-Age=0"))).toBe(true);
  });

  it("fails closed when configuration is missing", async () => {
    const response = await createBookingPost(deps({}, { config: () => readDemoConfig({}) }))(post("/api/bookings", form));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("GELATIN_PARTNER_KEY");
  });
});

describe("booking submission", () => {
  it("sends one idempotent portal-handoff packet and records the result in a signed cookie", async () => {
    const submitBookingRequests = vi.fn(async () => ({
      group_id: "g", event_id: "e",
      engagements: [{ id: "x", external_request_id: "r", dj_id: DJ_ID.toUpperCase(), request_id: REQUEST_ID, booking_id: "b", offer_id: "o", revision: 1, total_cents: 54_200, currency: "usd" }],
    }));
    const response = await createBookingPost(deps({ submitBookingRequests }))(post("/api/bookings", form, { cookie: sessionCookie() }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ next: `/bookings?event=demo-evt-${form.nonce}` });
    const [packet, options] = submitBookingRequests.mock.calls[0] as unknown as [{ external_booking_id: string; return_url: string; authorization_placement: string }, unknown];
    // The SDK keys the write on the nonce-derived booking ID (`booking:<external_booking_id>`).
    expect(options).toBeUndefined();
    expect(packet.external_booking_id).toBe(`demo-bkg-${form.nonce}`);
    expect(packet.authorization_placement).toBe("gelatin_portal_handoff");
    expect(new URL(packet.return_url).origin).toBe(ORIGIN);
    const saved = readBookings(config, readCookie(cookieValue(response.headers.get("set-cookie") ?? ""), names.bookings));
    expect(saved[0].engagements).toEqual([{ requestId: REQUEST_ID, djName: "DJ One", totalCents: 54_200, currency: "usd" }]);
  });

  it("requires a session and a same-origin request before calling Gelatin", async () => {
    const submitBookingRequests = vi.fn();
    expect((await createBookingPost(deps({ submitBookingRequests }))(post("/api/bookings", form))).status).toBe(401);
    expect((await createBookingPost(deps({ submitBookingRequests }))(post("/api/bookings", form, { cookie: sessionCookie(), origin: "https://evil.example" }))).status).toBe(403);
    expect((await createBookingPost(deps({ submitBookingRequests }))(post("/api/bookings", { ...form, total_cents: 1 }, { cookie: sessionCookie() }))).status).toBe(400);
    expect((await createBookingPost(deps({ submitBookingRequests }))(post("/api/bookings", "x".repeat(17_000), { cookie: sessionCookie() }))).status).toBe(400);
    expect(submitBookingRequests).not.toHaveBeenCalled();
  });

  it("maps Gelatin errors to a short message and its request ID without the raw response", async () => {
    const submitBookingRequests = vi.fn(async () => { throw new PartnerApiError(409, "conflict", "Partner API request failed", "req_123"); });
    const response = await createBookingPost(deps({ submitBookingRequests }))(post("/api/bookings", form, { cookie: sessionCookie() }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: expect.stringContaining("already sent"), request_id: "req_123" });
  });
});

describe("portal launch", () => {
  const withBooking = () => `${sessionCookie()}; ${cookieValue(writeBookings(config, [booking]))}`;

  it("launches only a booking from this browser, as its original organizer, and returns an approved URL", async () => {
    const createPortalLaunch = vi.fn(async () => ({ url: `https://book-demo.staging.gelatinbookings.com/partner/launch#token=${token}`, expires_at: "2030-01-01T00:01:00Z" }));
    const response = await createLaunchPost(deps({ createPortalLaunch }))(post("/api/launch", { event_id: booking.eventId, request_id: REQUEST_ID }, { cookie: withBooking() }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: `https://book-demo.staging.gelatinbookings.com/partner/launch#token=${token}` });
    expect(response.headers.get("cache-control")).toBe("no-store");
    const [input, options] = createPortalLaunch.mock.calls[0] as unknown as [Record<string, unknown>, unknown];
    expect(input).toEqual({
      external_event_id: booking.eventId, external_user_id: booking.organizerId,
      resource: { kind: "request", id: REQUEST_ID }, return_url: `${ORIGIN}/return?event=${booking.eventId}`,
    });
    // The SDK gives each launch a fresh key.
    expect(options).toBeUndefined();
  });

  it("refuses unknown bookings, forged booking cookies and launch URLs off the allowlist", async () => {
    const createPortalLaunch = vi.fn(async () => ({ url: `https://evil.example/partner/launch#token=${token}`, expires_at: "x" }));
    const handler = createLaunchPost(deps({ createPortalLaunch }));
    expect((await handler(post("/api/launch", { event_id: booking.eventId, request_id: "44444444-4444-4444-8444-444444444444" }, { cookie: withBooking() }))).status).toBe(404);
    const forged = `${sessionCookie()}; ${names.bookings}=${Buffer.from(JSON.stringify([booking])).toString("base64url")}.bad`;
    expect((await handler(post("/api/launch", { event_id: booking.eventId, request_id: REQUEST_ID }, { cookie: forged }))).status).toBe(404);
    expect(createPortalLaunch).not.toHaveBeenCalled();
    expect((await handler(post("/api/launch", { event_id: booking.eventId, request_id: REQUEST_ID }, { cookie: withBooking() }))).status).toBe(502);
  });

  it("accepts only Gelatin's launch path with a fragment token", () => {
    const allowed = new Set(["https://book-demo.staging.gelatinbookings.com"]);
    expect(approvedLaunchUrl(`https://book-demo.staging.gelatinbookings.com/partner/launch#token=${token}`, allowed)).not.toBeNull();
    expect(approvedLaunchUrl(`https://book-demo.staging.gelatinbookings.com/elsewhere#token=${token}`, allowed)).toBeNull();
    expect(approvedLaunchUrl(`https://book-demo.staging.gelatinbookings.com/partner/launch?token=${token}`, allowed)).toBeNull();
    expect(approvedLaunchUrl(`https://book-demo.staging.gelatinbookings.com.evil.example/partner/launch#token=${token}`, allowed)).toBeNull();
    expect(approvedLaunchUrl("javascript:alert(1)", allowed)).toBeNull();
  });
});

describe("Gelatin error wording", () => {
  it("says plainly when a chosen DJ isn't available, without claiming an outage", async () => {
    const submitBookingRequests = vi.fn(async () => { throw new PartnerApiError(409, "dj_unavailable", "Partner API request failed", "req_9"); });
    const response = await createBookingPost(deps({ submitBookingRequests }))(post("/api/bookings", form, { cookie: sessionCookie() }));
    expect(response.status).toBe(409);
    const error = (await response.json()).error as string;
    expect(error).toContain("isn't available for this event");
    expect(error).not.toContain("unavailable right now");
  });

  it("reports a 503 as a short outage", async () => {
    const submitBookingRequests = vi.fn(async () => { throw new PartnerApiError(503, "temporarily_unavailable", "Partner API request failed", "req_10"); });
    const response = await createBookingPost(deps({ submitBookingRequests }))(post("/api/bookings", form, { cookie: sessionCookie() }));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("unavailable right now");
  });
});
