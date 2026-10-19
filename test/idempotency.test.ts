import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPartnerClient, idempotencyKeyFor, PartnerApiError } from "../src/server.js";
import type { DjRequestSubmission, LaunchSessionRequest } from "../src/types.js";

const BASE = "https://api.gelatin.example/v1/partners/acme";

const submission: DjRequestSubmission = {
  external_event_id: "event_123",
  external_submission_id: "submission_123",
  external_booking_id: "booking_123",
  organizer: { external_user_id: "user_789", email: "organizer@example.test" },
  event: {
    name: "Friday Night",
    starts_at: "2026-11-14T21:00:00-05:00",
    ends_at: "2026-11-14T23:00:00-05:00",
    time_zone: "America/New_York",
    venue_name: "Example Room",
  },
  requests: [{
    external_request_id: "request_001",
    dj_id: "22222222-2222-4222-8222-222222222222",
    initial_offer: { currency: "usd", dj_fee_cents: 50_000 },
  }],
  authorization_placement: "gelatin_portal_handoff",
  return_url: "https://acme.example/events/event_123",
};

const launch: LaunchSessionRequest = {
  external_event_id: "event_123",
  external_user_id: "user_789",
  resource: { kind: "request", id: "33333333-3333-4333-8333-333333333333" },
  return_url: "https://acme.example/events/event_123",
};

const created = () => Response.json({
  group_id: "66666666-6666-4666-8666-666666666666",
  event_id: "77777777-7777-4777-8777-777777777777",
  engagements: [],
}, { status: 201 });
const launched = () => Response.json({ url: "https://book.acme.example/partner/launch#token=opaque", expires_at: "2026-10-12T18:00:00Z" }, { status: 201 });
const failure = (status: number, code: string, headers: Record<string, string> = {}) =>
  Response.json({ error: { code, message: "x", request_id: "trace" } }, { status, headers });
const catalog = () => Response.json({ items: [], next_cursor: null });

function keys(fetcher: ReturnType<typeof vi.fn>) {
  return fetcher.mock.calls.map(([, init]) => new Headers((init as RequestInit).headers).get("Idempotency-Key"));
}

describe("default idempotency keys", () => {
  it("derives the submission key from the once-only external_booking_id", async () => {
    const fetcher = vi.fn(async () => created());
    const client = createPartnerClient({ baseUrl: BASE, apiKey: "gel_test_private", fetch: fetcher as unknown as typeof fetch });

    await client.submitBookingRequests(submission);
    await client.submitBookingRequests(submission);

    expect(keys(fetcher)).toEqual(["booking:booking_123", "booking:booking_123"]);
  });

  it("gives every portal launch a fresh key so each click mints a new link", async () => {
    const fetcher = vi.fn(async () => launched());
    const client = createPartnerClient({ baseUrl: BASE, apiKey: "gel_test_private", fetch: fetcher as unknown as typeof fetch });

    await client.createPortalLaunch(launch);
    await client.createPortalLaunch(launch);

    const [first, second] = keys(fetcher);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toMatch(/^[0-9a-f-]{36}$/);
    expect(first).not.toBe(second);
  });

  it("lets a caller-supplied key override either default", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(created())
      .mockResolvedValueOnce(launched());
    const client = createPartnerClient({ baseUrl: BASE, apiKey: "gel_test_private", fetch: fetcher as unknown as typeof fetch });

    await client.submitBookingRequests(submission, { idempotencyKey: "acme:intent:42" });
    await client.createPortalLaunch(launch, { idempotencyKey: "acme:click:7" });

    expect(keys(fetcher)).toEqual(["acme:intent:42", "acme:click:7"]);
  });

  it("still refuses an explicitly blank key before any network call", async () => {
    const fetcher = vi.fn();
    const client = createPartnerClient({ baseUrl: BASE, apiKey: "gel_test_private", fetch: fetcher });

    await expect(client.submitBookingRequests(submission, { idempotencyKey: " " })).rejects.toThrow("idempotency");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("idempotencyKeyFor", () => {
  it("joins stable IDs into one key", () => {
    expect(idempotencyKeyFor("event_123", "cancel", "v2")).toBe("event_123:cancel:v2");
  });

  it("keeps parts that contain the separator from colliding", () => {
    expect(idempotencyKeyFor("a:b", "c")).not.toBe(idempotencyKeyFor("a", "b:c"));
  });

  it("rejects empty input, blank parts, line breaks and keys over 255 characters", () => {
    expect(() => idempotencyKeyFor()).toThrow(TypeError);
    expect(() => idempotencyKeyFor("event_123", " ")).toThrow(TypeError);
    expect(() => idempotencyKeyFor("event_123", "a\r\nb")).toThrow(TypeError);
    expect(() => idempotencyKeyFor("x".repeat(256))).toThrow(TypeError);
  });
});

describe("retries", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("retries a 503 with the same idempotency key and returns the eventual success", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(failure(503, "temporarily_unavailable"))
      .mockResolvedValueOnce(failure(503, "temporarily_unavailable"))
      .mockResolvedValueOnce(created());
    const client = createPartnerClient({ baseUrl: BASE, apiKey: "gel_test_private", fetch: fetcher });

    const pending = client.submitBookingRequests(submission);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ group_id: "66666666-6666-4666-8666-666666666666" });

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(new Set(keys(fetcher))).toEqual(new Set(["booking:booking_123"]));
  });

  it("retries a network failure, a timeout and a 429 on reads and writes alike", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(failure(429, "rate_limited"))
      .mockResolvedValueOnce(catalog());
    const client = createPartnerClient({ baseUrl: BASE, apiKey: "gel_test_private", fetch: fetcher });

    const pending = client.listDjs();
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ items: [], next_cursor: null });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("treats an attempt that exceeds timeoutMs as retryable", async () => {
    const fetcher = vi.fn()
      .mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }))
      .mockResolvedValueOnce(catalog());
    const client = createPartnerClient({ baseUrl: BASE, apiKey: "gel_test_private", fetch: fetcher, timeoutMs: 1_000 });

    const pending = client.listDjs();
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ items: [], next_cursor: null });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    [400, "invalid_request"],
    [401, "unauthorized"],
    [403, "forbidden_scope"],
    [404, "not_found"],
    [409, "conflict"],
    [409, "dj_unavailable"],
    [422, "unsupported_authorization_placement"],
  ])("never retries a %i %s", async (status, code) => {
    const fetcher = vi.fn(async () => failure(status, code));
    const client = createPartnerClient({ baseUrl: BASE, apiKey: "gel_test_private", fetch: fetcher as unknown as typeof fetch });

    await expect(client.submitBookingRequests(submission)).rejects.toMatchObject({ status, code });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("waits for Retry-After before the next attempt", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(failure(503, "temporarily_unavailable", { "Retry-After": "2" }))
      .mockResolvedValueOnce(created());
    const client = createPartnerClient({ baseUrl: BASE, apiKey: "gel_test_private", fetch: fetcher });

    const pending = client.submitBookingRequests(submission);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("caps a long Retry-After at maxDelayMs", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(failure(503, "temporarily_unavailable", { "Retry-After": "30" }))
      .mockResolvedValueOnce(created());
    const client = createPartnerClient({ baseUrl: BASE, apiKey: "gel_test_private", fetch: fetcher });

    const pending = client.submitBookingRequests(submission);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("gives up after three attempts and surfaces the last error", async () => {
    const fetcher = vi.fn(async () => failure(503, "temporarily_unavailable"));
    const client = createPartnerClient({ baseUrl: BASE, apiKey: "gel_test_private", fetch: fetcher as unknown as typeof fetch });

    const pending = client.submitBookingRequests(submission);
    const outcome = expect(pending).rejects.toMatchObject({ status: 503, code: "temporarily_unavailable" });
    await vi.runAllTimersAsync();
    await outcome;
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("stops retrying as soon as the caller aborts", async () => {
    const fetcher = vi.fn(async () => failure(503, "temporarily_unavailable", { "Retry-After": "5" }));
    const client = createPartnerClient({ baseUrl: BASE, apiKey: "gel_test_private", fetch: fetcher as unknown as typeof fetch });
    const controller = new AbortController();

    const pending = client.submitBookingRequests(submission, { signal: controller.signal });
    const outcome = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(1_000);
    controller.abort();
    await outcome;
    await vi.runAllTimersAsync();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not retry when maxAttempts is 1", async () => {
    const fetcher = vi.fn(async () => failure(503, "temporarily_unavailable"));
    const client = createPartnerClient({ baseUrl: BASE, apiKey: "gel_test_private", fetch: fetcher as unknown as typeof fetch, retries: { maxAttempts: 1 } });

    await expect(client.submitBookingRequests(submission)).rejects.toBeInstanceOf(PartnerApiError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
