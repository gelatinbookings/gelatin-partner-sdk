# Gelatin Partner SDK

A small, typed TypeScript client for Gelatin's partner booking API. With it, your platform can list Gelatin DJs, send booking requests, hand organizers to Gelatin's hosted booking page to negotiate and pay, and read each booking's status back.

- Zero runtime dependencies, uses the built-in `fetch`
- Server and browser entry points; the API key only ever lives on your server
- Idempotency keys and safe retries by default
- [OpenAPI 3.1 spec](openapi/partner-api.openapi.json) included. The API is plain HTTPS + JSON, so any language works without this package.

> **Pre-release (`0.1.0-alpha`).** The contract may change before 1.0. Pin to a tag. What changed in each release: [CHANGELOG](CHANGELOG.md).

## What this is, in plain words

Gelatin books DJs for events. A **partner** is a company with its own events website that wants its organizers to book Gelatin DJs. The journey has five steps:

1. Your website shows a list of Gelatin DJs.
2. The organizer picks DJs and suggests a fee. Your server sends that to Gelatin as a booking request.
3. The organizer places a card hold for each DJ, either **on your page** in Stripe's checkout form that Gelatin provides, or on a **Gelatin booking page** with your logo on it (see "Taking payment: two ways"). No money moves yet. If a DJ comes back with a different price, your website sends the organizer to a **Gelatin booking page** with your logo on it to review it.
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
npm install github:gelatinbookings/gelatin-partner-sdk#v0.1.0-alpha.5
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

## The journey in five calls

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
    venue_address: "123 Example St, Atlanta, GA 30303", // optional; the DJ sees it
  },
  requests: [
    { external_request_id: "req_1", dj_id: page.items[0].id, initial_offer: { currency: "usd", dj_fee_cents: 30000 } },
  ],
  authorization_placement: "partner_event_flow", // Full; "gelatin_portal_handoff" for Light (step 3)
  return_url: "https://your-site.example/events/event_123",
});

// 3. Take payment in ONE of two ways. Not both: see "Taking payment: two ways".

// EITHER Full: the organizer pays on your page, in Stripe's embedded checkout, one DJ
//    at a time. Give these two values to that organizer's browser, which mounts the checkout.
const { client_secret, publishable_key } = await gelatin.createPaymentSession({
  external_event_id: "event_123",
  external_user_id: "user_7",
  resource: { kind: "request", id: booking.engagements[0].request_id },
});

// OR Light: the organizer pays in Gelatin's co-branded portal (submit with
//    "gelatin_portal_handoff"). Full uses this too, for a DJ's counteroffer.
//    The link is one-use and expires in 60 seconds, so make it on click and redirect at once.
const launch = await gelatin.createPortalLaunch({
  external_event_id: "event_123",
  external_user_id: "user_7",
  resource: { kind: "request", id: booking.engagements[0].request_id },
  return_url: "https://your-site.example/events/event_123",
});
redirect(launch.url);

// 4. The organizer comes back to your return_url.

// 5. Read status whenever you need it, by your own event ID.
const status = await gelatin.getEventBookings("event_123");
```

A runnable version is in [`examples/quickstart.ts`](examples/quickstart.ts).

For a complete website, see the [Next.js partner example](examples/nextjs/README.md): a small events site you can run against the sandbox and click through the whole journey, including payment, the DJ's reply and live status.

Gelatin never calls your server. Status is pull-only: read it when the organizer comes back, when they open the event, or on a schedule. Pass `{ ifNoneMatch: lastEtag }` to skip unchanged reads: the result is `{ modified: false }` until something changes, then `{ modified: true, etag, data }`.

## Taking payment: two ways

Gelatin always takes the payment. The organizer places a card hold for each DJ, and Gelatin charges it when the DJ accepts. Your choice is **where the organizer types their card**: on Gelatin's co-branded booking page (Light) or on your own page (Full). Choose when you submit, with `authorization_placement`. `createPortalLaunch` is the Light payment step. `createPaymentSession` is the Full one.

| | Light: pay in Gelatin's portal | Full: Stripe checkout on your page |
| --- | --- | --- |
| Submit with | `authorization_placement: "gelatin_portal_handoff"` | `authorization_placement: "partner_event_flow"` |
| Payment call | `createPortalLaunch`, then redirect | `createPaymentSession` on your server, plus Stripe.js in the browser |
| Does the organizer leave your site? | Yes, to Gelatin's co-branded page, then back to your `return_url` | No. A DJ's counteroffer still goes to Gelatin |
| Several DJs | One visit: from the launched DJ, "All DJs for this event" reaches the rest | One checkout per DJ |
| Your work | One server call and a redirect | A server route, a browser component, and status reads |
| Pick it when | You want the quickest integration | You want the organizer to stay on your page |
| Scopes | `requests:write` (submit), `launch:write` (launch), `bookings:read` (status) | The same: `createPaymentSession` also needs `launch:write` |

Listing DJs needs `catalog:read` either way, so one key with all four scopes covers both. A Full integration still calls `createPortalLaunch` for counteroffers.

### Light: pay in Gelatin's portal

1. Submit with `authorization_placement: "gelatin_portal_handoff"`.
2. When the organizer clicks to pay, call `createPortalLaunch`. It returns `{ url, expires_at }`: a one-use link to Gelatin's co-branded booking page that expires in about 60 seconds. Redirect straight away, and never make one ahead of time. Each call gets a fresh key, so each click gets a new link.
3. The organizer reviews and pays there. Gelatin's page links back to your `return_url`, whose origin must be registered with Gelatin.
4. When they're back, read `getEventBookings`. A DJ still waiting for the card hold is `authorization_required`, and becomes `requested` once the hold is placed.

### Full: Stripe checkout on your page

1. Submit with `authorization_placement: "partner_event_flow"`.
2. **Server:** `createPaymentSession({ external_event_id, external_user_id, resource: { kind: "request", id: request_id } })` returns `{ client_secret, publishable_key, total_cents, currency }`.
3. Send only `client_secret` and `publishable_key` to **that organizer's** browser. Never log them. `total_cents` and `currency` are for your own display; never compute the total yourself.
4. **Browser:** mount Stripe's embedded checkout with [`@stripe/stripe-js`](https://www.npmjs.com/package/@stripe/stripe-js):

   ```ts
   import { loadStripe } from "@stripe/stripe-js";

   const stripe = await loadStripe(publishableKey);
   const checkout = await stripe!.createEmbeddedCheckoutPage({
     fetchClientSecret: async () => clientSecret,
     onComplete: () => showConfirming(), // not "paid" yet: see step 5
   });
   checkout.mount("#gelatin-checkout");
   ```

5. **When it completes, don't trust the browser.** `onComplete` doesn't place the hold. Gelatin records the hold only when Stripe's signed webhook arrives, usually within seconds. Show "Confirming…" and poll `getEventBookings` from your server, or use the [browser status watcher](#browser-status-refresh), until that DJ moves from `authorization_required` to `requested`.

The Next.js example's [`app/pay-button.tsx`](examples/nextjs/app/pay-button.tsx) is the working reference, with its server route in [`lib/handlers.ts`](examples/nextjs/lib/handlers.ts). [Paying on your page](#paying-on-your-page) has more detail.

### Gotchas

- **One DJ per payment session, today.** `resource` is always `{ kind: "request" }`, so a booking with three DJs needs three checkouts. Stripe allows one embedded checkout on a page at a time, so call `checkout.destroy()` before mounting the next.
- **`409 portal_required` means "use the portal for this DJ".** You get it when the DJ countered, so the offer on the table is no longer the organizer's own. You also get it when that DJ's hold was already started on Gelatin's page. Fall back to `createPortalLaunch` for that request and redirect.
- **A second click returns the same checkout.** Gelatin keeps one open hold per offer and returns it whichever idempotency key asks, so a double click or a retry never makes two holds.
- **`409 offer_changed`:** the offer changed, was already paid, or expired. Read status before offering payment again.

## One checkout for every DJ (saved card)

> **Off by default, testing only.** This is a per-partner switch that Gelatin sets for you (`organizer_card_mode`: `per_hold`, the default, or `saved_card`). It isn't released for live money until the consent wording, Gelatin's Terms and your agreement to it are signed off. Until then the consent text is a draft and is labelled as one.

With it on, an organizer booking several DJs enters their card once instead of once per DJ. Gelatin still holds and charges each DJ separately.

**What the organizer sees, on the portal's event page (`/partner/event`, "All DJs for this event"):**

1. A "Pay once for your DJs" panel lists the DJs whose offers are waiting for a hold, with the total, and a consent checkbox.
2. "Save card and hold for …" opens one embedded Stripe Checkout in **setup mode**. It saves the card and charges nothing.
3. Gelatin then places **one hold per DJ** on that card, each for that DJ's own total. Each is a manual-capture hold, charged only if that DJ accepts, exactly like a Checkout hold. A hold the bank wants confirmed (3-D Secure) is completed on the same page.
4. Next time, the panel reads "Hold with your saved card" and holds in one click. The card is removed from Stripe once all of the organizer's bookings with you are settled.

**How you get the organizer there:**

- **No launch opens the event page directly.** `createPortalLaunch` (`kind: "request"` or `"booking"`) opens that one DJ's page. The session covers the whole event, so "All DJs for this event" on that page reaches the panel. Gelatin's own emails to the organizer open the event page directly.
- **Light partners need no change.** Keep launching as you do. The panel appears for organizers of a partner with the switch on.
- **Full partners:** `createPaymentSession` is unchanged. It is still one DJ per session, in payment mode, and there is **no in-page "one checkout" for your own page yet**. To offer one checkout for several DJs, send the organizer to the portal with a launch.

**What you'll see per DJ in `getEventBookings`:** the same statuses as today, with no new values.

- **While Gelatin places a hold in the background:** `authorization_required` until the hold is confirmed, then `requested`.
- **A background hold the card refuses:** that DJ stays `authorization_required` (`reauthorization_required` after a counteroffer). Gelatin emails the organizer a "payment needed" link, and that DJ's page offers to authorize with the same card or another. If the organizer is on your site, mint a `createPortalLaunch` for that request. Other DJs' holds are unaffected.
- **A new offer is held again automatically** on the saved card. This covers a DJ's counteroffer the organizer accepts and the organizer's own counteroffer. The new hold is placed first and the old one released after. The DJ reads `reauthorization_required` until the new hold is in place, then moves on exactly as with a Checkout hold. You don't need to do anything.

**Coming:** a receipt email to the organizer for every hold, and per-organizer hold limits.

## Finding DJs

### Choosing a city

`@gelatinbookings/partner-sdk/places` ships the list a city picker needs, with no request: `US_STATES` (all 50 states plus DC) and `US_MAJOR_CITIES`, each state's major cities with a point. The cities are the Census Bureau's 200 most populous places plus each state's largest (Vintage 2024 estimates and 2024 Gazetteer points, both public domain).

`listCities()` returns the same cities grouped by state, plus any other city where your catalog has a DJ, each with `dj_count`: how many DJs `listDjs` returns for its `label`. That counts DJs whose profile names the city and, for a listed city, DJs whose service radius covers it, so a big city with no local DJs still shows the ones who travel there. A city with no DJs keeps `dj_count: 0`; list it rather than hiding it. `filterCityDirectory(directory, query)` narrows the list the way Gelatin's picker does: by the start of a city's name, or every city in a state ("GA") or country ("US").

```ts
import { filterCityDirectory } from "@gelatinbookings/partner-sdk/places";

const georgia = filterCityDirectory(await gelatin.listCities(), "GA");
const djs = await gelatin.listDjs({ city: georgia.countries[0].regions[0].cities[0].label });
```

`listDjs({ city })` accepts a city with or without its state: `"Atlanta, GA"`, `"Atlanta"` and `"Atlanta, Georgia"` are the same city. Neither call returns coordinates or radii.

### Only the DJs free that night

With a `date`, every DJ carries `available` for that night. Add `available: true` to list only the DJs who are free then, so a page never holds a DJ the organizer can't book. It needs `date`. Without it, every DJ is listed with their own `available`.

```ts
const free = await gelatin.listDjs({ city: "Atlanta, GA", date: "2026-11-14", available: true });
```

Availability is advisory: a DJ can be booked between your read and your request, and Gelatin checks again when you send it (`409 dj_unavailable`). An empty page can mean nobody is free that night or nobody matches the search at all. To tell them apart, ask again without `available` (one DJ is enough), and offer a different date if DJs match.

### A city with no DJs yet

When the organizer picks a city with `dj_count: 0`, say Gelatin isn't there yet and offer to tell them when DJs are. Once they say yes, send their email with the city's `label`. It needs the `requests:write` scope and counts against your write quota. Gelatin keeps one sign-up per email, city and partner: a repeat answers `already_subscribed`. The answer never contains the email or anyone else's sign-up, and Gelatin sends no email from this call.

```ts
const { status } = await gelatin.joinCityWaitlist({ email, city: "Boise, ID", consent: true, source: "empty_state" });
// "subscribed" or "already_subscribed"
```

### Filtering by budget

`@gelatinbookings/partner-sdk/budget` exports `BUDGET_BANDS`: under $300, $300–600, $600–1,000 and $1,000+, each with a `key`, a display `label` and its cent bounds. Show them as checkboxes and pass the ticked keys as `listDjs({ budget })`; several bands return DJs in any of them, and no bands means any budget.

A DJ is in a band when the minimum rate they really charge is at least its lower bound and below its upper bound, so $300 exactly is in $300–600, $600 in $600–1,000 and $1,000 in $1,000+. DJs who keep their rate private are filtered on that same rate, so they still appear when they're affordable, but their `published_rate_cents` stays null. A DJ with no rate on file is in no band. Budget combines with `city` and `date`, and a `next_cursor` only continues the same bands.

```ts
import { BUDGET_BANDS } from "@gelatinbookings/partner-sdk/budget";

const djs = await gelatin.listDjs({ city: "Atlanta, GA", date: "2026-11-14", budget: ["300_to_600", "600_to_1000"] });
```

### Choosing a genre

Each catalog DJ carries `genres`: up to six from the DJ's profile, in the DJ's own order (an empty array when the DJ lists none). `listGenres({ city, budget })` returns the genres your DJs in that city (and budget bands, when given) list, busiest first, each with `dj_count`: how many DJs `listDjs({ city, budget, genre })` returns for its `name`. Only genres with DJs are listed, so a typeahead built from it never offers a term that finds nobody. Ask again when the city changes, and drop a picked genre the new city doesn't have.

`listDjs({ genre })` ignores case, accents, spaces and punctuation, so `"Deep-House"` and `"deep house"` find the same DJs. There is no synonym list yet: `"D&B"` does not find `"Drum and Bass"`. A genre no DJ lists returns an empty page. `@gelatinbookings/partner-sdk/genres` applies the same rule with no request: `genreKey`, `filterGenres(directory, query)` for the typeahead, and `findGenre(directory, picked)` to check a picked genre against a new city.

```ts
import { findGenre } from "@gelatinbookings/partner-sdk/genres";

const directory = await gelatin.listGenres({ city: "Atlanta, GA" });
// Drop a genre picked for another city that Atlanta's DJs don't list.
const genre = picked && findGenre(directory, picked) ? picked : undefined;
const djs = await gelatin.listDjs({ city: "Atlanta, GA", genre, date: "2026-11-14" });
```

### After a DJ passes

When a request ends without a booking (`getEventBookings` status `declined`, `expired` or `cancelled`), don't leave the slot empty. `listAlternates(eventId, requestId)` returns up to five DJs who are open that night. They're in the event's city (by name, or by a service radius that reaches a bundled city) and either publish a rate within the organizer's last offered fee plus a fifth or publish none. The DJ who passed and every DJ already asked for this event are left out. A request that is still live answers `409 request_active`.

The result also carries the night, the city, the budget and your own event details, so Offer can start your usual request flow pre-filled. Reading alternates books, holds and charges nothing.

```ts
const alternates = await gelatin.listAlternates(event.external_event_id, request.request_id);
// alternates.items: PublicDj[]; alternates.event: { name, venue_name, venue_address, starts_at, ends_at, time_zone }
```

Gelatin's own booking page shows the same list. Its Offer button returns the organizer to the `return_url` you registered, with `gelatin_request_id` (the lost request) and `gelatin_offer_dj` (the chosen DJ) added. Check that the request is one of yours, then start a new request for that DJ, for example by calling `listAlternates` again.

### A public event page

For a public event page, read the lineup rather than the status feed. It carries names, profile links and photos, and no prices:

```ts
const lineup = await gelatin.getEventLineup("event_123", { includePending: true, ifNoneMatch: lastEtag });
if (lineup.modified) renderLineup(lineup.data.entries); // each entry: dj_id, name, status, profile_url, image_url
```

### Values that depend on your partner settings

Three behaviours are set per partner by Gelatin and default to the full integration; ask Gelatin to change them. Field names and types never change, only the values:

- `profile_url` opens the DJ's co-branded page on your registered portal origin, or Gelatin's own `/djs/{slug}` page when you have none or choose Gelatin links.
- `city` in `listDjs`, `listGenres` and alternates, and the counts in `listCities`, include other spellings of the city and DJs whose service radius covers it. With exact-name matching, only DJs whose profile city is exactly the text you send match.
- After a DJ passes, Gelatin's booking page can send the organizer back to your `return_url` with an Offer link (default), show the list only, or let the organizer send the offer to another DJ right there, so you need no code for alternates.

## Request and response shapes

Every shape is a named, commented type in [`src/types.ts`](src/types.ts), in the same order as the journey. Each nested object has its own name, so you can build a request from parts:

```ts
import type { BookingRequest, DjRequest, EventDetails, Organizer } from "@gelatinbookings/partner-sdk/types";

const organizer: Organizer = { external_user_id: "user_7", email: "organizer@example.com" };
const event: EventDetails = {
  name: "Friday Social",
  starts_at: "2026-11-14T22:00:00-05:00",
  ends_at: "2026-11-15T02:00:00-05:00",
  time_zone: "America/New_York",
  venue_name: "The Warehouse",
};
const requests: DjRequest[] = [
  { external_request_id: "req_1", dj_id: "<PublicDj.id>", initial_offer: { currency: "usd", dj_fee_cents: 30000 } },
];
const body: BookingRequest = {
  external_event_id: "event_123",
  external_submission_id: "submission_42",
  external_booking_id: "booking_42",
  organizer,
  event,
  requests,
  authorization_placement: "partner_event_flow",
  return_url: "https://your-site.example/events/event_123",
};
```

| Call | Sends | Gets back |
| --- | --- | --- |
| `listDjs` | `DjCatalogQuery` | `DjCatalogPage` of `PublicDj` |
| `submitBookingRequests` | `BookingRequest` (`Organizer`, `EventDetails`, `DjRequest` with `DjOffer`) | `BookingRequestResult`, one `BookingRequestEngagement` per DJ |
| `createPaymentSession` | `PaymentSessionRequest` | `PaymentSessionResult` |
| `createPortalLaunch` | `PortalLaunchRequest` (`LaunchResource`) | `PortalLaunchResult` |
| `getEventBookings` | your event ID | `ConditionalEventBookings`: `EventBookings` → `PartnerBooking` → `DjBookingStatus` |
| `getOrganizerStanding` | your community ID | `OrganizerStanding` with `OwedAmount` entries (Make a Deal only) |

The old names `DjRequestSubmission`, `LaunchSessionRequest`, `LaunchSessionResult` and `EventBookingProjection` still work as aliases.

## Paying on your page

`createPaymentSession` answers `{ client_secret, publishable_key, total_cents, currency }` for the organizer's own request. Send `client_secret` and `publishable_key` to that organizer's browser only (never log them), and mount Stripe's checkout with [`@stripe/stripe-js`](https://www.npmjs.com/package/@stripe/stripe-js):

```ts
import { loadStripe } from "@stripe/stripe-js";

const stripe = await loadStripe(publishableKey);
const checkout = await stripe!.createEmbeddedCheckoutPage({
  fetchClientSecret: async () => clientSecret,
  onComplete: () => showConfirming(), // then re-read status from your server
});
checkout.mount("#gelatin-checkout");
// Call checkout.destroy() before mounting another: Stripe allows one per page.
```

- Card details go straight to Stripe. The form shows the DJ fee, Gelatin's service fee and card processing, and names Gelatin as the seller.
- Finishing the form doesn't place the hold by itself. Gelatin records the hold when Stripe confirms it, usually within seconds, and `getEventBookings` then shows `requested` instead of `authorization_required`.
- It only works for the offer the organizer submitted. For a DJ's counteroffer the call answers `409 portal_required`: create a portal launch and send the organizer to Gelatin.
- If your site sets a Content Security Policy, allow Stripe's [documented sources](https://docs.stripe.com/security/guide#content-security-policy).

## Make a Deal and organizer standing

> **Off by default.** Make a Deal is a per-partner setting that Gelatin turns on only by agreement. Until it is on for your integration, none of this section applies: a request with `deal: "make_a_deal"` is refused with `400 invalid_request`, and `getOrganizerStanding` answers `404 not_found`. Bookings work exactly as described above.

When Gelatin enables Make a Deal for your integration, a request can say `deal: "make_a_deal"` instead of the default `confirm_and_book`. There is no card hold and no Gelatin charge: the DJ sees the offer straight away, accepting confirms the booking, and the organizer pays the DJ directly. Make a Deal needs `organizer.community_ref`, your ID for the community that runs the event.

What makes the organizer pay is their community's standing. After the night, the DJ tells Gelatin whether they were paid. While a community owes a DJ, a booking request for any event it runs, or from the organizer who owes, fails with `403 organizer_owes`. Gate your own "Add talent" control on the standing instead of waiting for that refusal:

```ts
const standing = await gelatin.getOrganizerStanding(communityId, { externalUserId: userId });
if (!standing.may_add_talent) showOwed(standing.owed); // each DJ, amount and due date, oldest first
```

The block lifts as soon as the DJ confirms payment. A booked DJ is never cancelled because money is owed. There is no standing webhook; read it when you need it. It needs the `bookings:read` scope.

## Idempotency and retries

| Call | Default `Idempotency-Key` | Why it's safe |
| --- | --- | --- |
| `submitBookingRequests` | `booking:<external_booking_id>` | Each external booking ID is accepted once. A resend with the same body returns the original result; a different body gets `409 conflict`. |
| `createPortalLaunch` | a fresh random key per call | Every click needs its own one-use link. Retries of that call reuse its key. |
| `createPaymentSession` | a fresh random key per call | Gelatin keeps one open hold per offer and returns it whichever key asks, so a second click gets the same checkout. |

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
| 403 | `organizer_owes` | Make a Deal only: the organizer's community owes a DJ. Read `getOrganizerStanding`; don't retry. |
| 404 | `resource_unavailable` | The launch target doesn't exist for your partner |
| 404 | `not_found` | `getOrganizerStanding` while Make a Deal is off for your integration |
| 409 | `dj_unavailable` | A DJ can't take the event; `externalRequestId` names the request. Nothing in the submission was saved. |
| 409 | `conflict`, `idempotency_conflict` | An ID or key was reused with different content |
| 409 | `portal_required` | `createPaymentSession` on a DJ's counteroffer: send the organizer to Gelatin with a portal launch |
| 409 | `offer_changed` | The offer changed, was already paid or expired; read status |
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
