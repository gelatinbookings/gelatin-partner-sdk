# Gelatin Partner SDK

A small, typed TypeScript client for Gelatin's partner booking API. With it, your platform can list Gelatin DJs, send booking requests, hand organizers to Gelatin's hosted booking page to negotiate and pay, and read each booking's status back.

- Zero runtime dependencies, uses the built-in `fetch`
- Server and browser entry points; the API key only ever lives on your server
- Idempotency keys and safe retries by default
- [OpenAPI 3.1 spec](openapi/partner-api.openapi.json) included. The API is plain HTTPS + JSON, so any language works without this package.

> **Pre-release (`0.1.0-alpha`).** The contract may change before 1.0. Pin to a tag.

## What this is, in plain words

Gelatin books DJs for events. A **partner** is a company with its own events website that wants its organizers to book Gelatin DJs. The journey has five steps:

1. Your website shows a list of Gelatin DJs.
2. The organizer picks DJs and suggests a fee. Your server sends that to Gelatin as a booking request.
3. Your website sends the organizer to a **Gelatin booking page** with your logo on it. There they review the offer, negotiate if the DJ counters, and place a card hold. No money moves yet.
4. The organizer comes back to your website.
5. When the DJ accepts, Gelatin takes the payment. Your server asks Gelatin for each booking's status whenever it wants to show it.

This package is the code your **server** uses to talk to Gelatin. It saves you writing the web requests by hand. A few terms:

- **Server vs browser:** your server is the computer running your backend code. The browser is the organizer's screen. The API key must only ever be on your server.
- **API key:** a long secret password Gelatin issues, starting `gel_test_` (sandbox) or `gel_live_` (live). Keep it in your server's environment settings, never in code or the browser.
- **Sandbox:** Gelatin's practice environment with fake money (Stripe test mode). Build and test there first.
- **Idempotency key:** a label on each write, so that if a request is sent twice (say, after a network blip), Gelatin does it only once. This package sets these for you.

Not using JavaScript? Every call is a plain HTTPS request with JSON, described in the OpenAPI file, so any language works.

## Install

```sh
npm install github:gelatinbookings/gelatin-partner-sdk#v0.1.0-alpha.1
```

Requires Node.js 20 or later. The package builds itself on install.

## Configure

Gelatin issues your partner slug and API key. Sandbox keys start with `gel_test_` and only work against the sandbox (Stripe test mode); live keys start with `gel_live_`.

```sh
# .env — server only, never ship the key to the browser
GELATIN_API_BASE=https://staging.gelatinbookings.com/v1/partners/<your-partner-slug>
GELATIN_API_KEY=gel_test_…
```

```ts
import { createPartnerClient } from "@gelatinbookings/partner-sdk/server";

const gelatin = createPartnerClient({
  baseUrl: process.env.GELATIN_API_BASE!,
  apiKey: process.env.GELATIN_API_KEY!,
});
```

## The journey in four calls

```ts
// 1. List DJs. Pass the event date to get availability.
const page = await gelatin.listDjs({ city: "Atlanta", date: "2026-11-14", limit: 20 });

// 2. Send the organizer's booking request, one entry per DJ.
const booking = await gelatin.submitBookingRequests({
  external_booking_id: "booking_42",     // your ID; accepted once
  external_submission_id: "submission_42",
  external_event_id: "event_123",
  organizer: { external_user_id: "user_7", email: "organizer@example.com", display_name: "Sam Rivera" },
  event: {
    name: "Friday Social",
    starts_at: "2026-11-14T22:00:00-05:00",
    ends_at: "2026-11-15T02:00:00-05:00",
    time_zone: "America/New_York",
    venue_name: "The Warehouse",
  },
  requests: [
    { external_request_id: "req_1", dj_id: page.items[0].id, initial_offer: { currency: "usd", dj_fee_cents: 30000 } },
  ],
  authorization_placement: "gelatin_portal_handoff",
  return_url: "https://your-site.example/events/event_123",
});

// 3. Send the organizer to Gelatin to negotiate and pay.
const launch = await gelatin.createPortalLaunch({
  external_event_id: "event_123",
  external_user_id: "user_7",
  resource: { kind: "request", id: booking.engagements[0].request_id },
  return_url: "https://your-site.example/events/event_123",
});
// Redirect immediately: the link works once and expires in 60 seconds.
redirect(launch.url);

// 4. Read status whenever you need it, by your own event ID.
const status = await gelatin.getEventBookings("event_123");
```

A runnable version is in [`examples/quickstart.ts`](examples/quickstart.ts).

For a complete website, see the [Next.js partner example](examples/nextjs/README.md): a small events site you can run against the sandbox and click through the whole journey, including payment, the DJ's reply and live status.

Gelatin never calls your server. Status is pull-only: read it when the organizer comes back, when they open the event, or on a schedule. Pass `{ ifNoneMatch: lastEtag }` to skip unchanged reads: the result is `{ modified: false }` until something changes, then `{ modified: true, etag, data }`.

## Idempotency and retries

| Call | Default `Idempotency-Key` | Why it's safe |
| --- | --- | --- |
| `submitBookingRequests` | `booking:<external_booking_id>` | Each external booking ID is accepted once. A resend with the same body returns the original result; a different body gets `409 conflict`. |
| `createPortalLaunch` | a fresh random key per call | Every click needs its own one-use link. Retries of that call reuse its key. |

Pass `{ idempotencyKey }` to use your own. `idempotencyKeyFor("booking", id)` joins IDs safely: it escapes each part and rejects blank parts, line breaks and keys over 255 characters.

Every call retries network errors, timeouts, `429` and `503`, up to 3 attempts, with the same key each time. It honours `Retry-After` up to 10 seconds and otherwise backs off with jitter. Each attempt times out after 15 seconds. Other `4xx` responses are never retried, and aborting your `signal` stops retrying at once.

```ts
createPartnerClient({ baseUrl, apiKey, retries: { maxAttempts: 1 }, timeoutMs: 30_000 });
```

## Errors

Failed calls throw `PartnerApiError` with `status`, a safe `code` and the `requestId` to quote to Gelatin support. Raw response bodies are not kept.

| Status | `code` | Meaning |
| --- | --- | --- |
| 400 | `invalid_request`, `invalid_query` | The input failed validation, including a `return_url` outside your registered sites. Fix it; don't retry. |
| 401 | `unauthorized` | The key is wrong, revoked, or from the other environment |
| 403 | `forbidden_scope` | The key lacks the scope for this call |
| 404 | `resource_unavailable` | The launch target doesn't exist for your partner |
| 409 | `dj_unavailable` | A DJ can't take the event; `externalRequestId` names the request. Nothing in the submission was saved. |
| 409 | `conflict`, `idempotency_conflict` | An ID or key was reused with different content |
| 422 | `unsupported_authorization_placement` | Use `gelatin_portal_handoff` |
| 429 | `rate_limited` | Retried automatically after `Retry-After` |
| 503 | `temporarily_unavailable` | Retried automatically |

## Browser status refresh

```ts
import { startStatusWatcher } from "@gelatinbookings/partner-sdk/browser";

const watcher = startStatusWatcher({
  // Call your own backend route. Never call Gelatin with the key from the browser.
  // Resolve to { modified: false, etag } or { modified: true, etag, data }.
  read: (etag, signal) => readStatusFromYourBackend("event_123", { etag, signal }),
  onUpdate: (snapshot) => render(snapshot),
});

watcher.stop(); // when the screen closes
```

The watcher prevents overlapping reads, passes ETags through and pauses while the tab is hidden.

## Not available yet

`updateEvent` and `recordAttendance` are typed for an upcoming release and call routes that aren't live yet. `submitDjRequests` and `createLaunchSession` are older names for `submitBookingRequests` and `createPortalLaunch`.

## Development

```sh
npm install
npm test
npm run build
```

## License

[MIT](LICENSE) © GelatinBookings, LLC
